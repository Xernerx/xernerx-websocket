/** @format */

import { terminal } from '@xernerx/terminal';

const t = terminal.child({ scope: 'XW' });

/**
 * Constructor signature for a WebSocket-compatible implementation (browser `WebSocket` or `ws` in Node.js).
 */
export type WSLike = {
	/**
	 * Creates a new WebSocket connection to the specified URL.
	 * @param url - Full WebSocket endpoint URL.
	 */
	new (url: string): any;
};

/**
 * Configuration options for initializing a {@link XernerxWebsocket} client.
 */
export interface XernerxWebsocketOptions {
	/** Xernerx authentication token passed during the initial handshake. */
	token: string;
	/** Optional custom WebSocket server URL. */
	url?: string;
	/** When `true`, connects to `wss://ws.dev.xernerx.com` instead of `wss://ws.xernerx.com`. */
	dev?: boolean;
	/** Request and authentication timeout in milliseconds (defaults to `15000`). */
	timeout?: number;
	/** Optional WebSocket constructor implementation for Node environments without global `WebSocket`. */
	WebSocketImpl?: WSLike;
}

type PendingRequest = {
	resolve: (value: any) => void;
	reject: (reason?: any) => void;
	timer?: ReturnType<typeof setTimeout>;
};

/**
 * Promise-based RPC client for communicating with the Xernerx Suite WebSocket gateway (`wss://ws.xernerx.com`).
 *
 * Automatically handles connection management, token authentication, request multiplexing, and per-request timeouts.
 */
export class XernerxWebsocket {
	private ws!: any;
	private url: string;
	/** Authentication token used to authorize the WebSocket session. */
	protected readonly token: string;
	private readonly timeout: number;

	private WSImpl: WSLike;

	private ready = false;
	private connecting: Promise<void> | null = null;

	private requestId = 0;
	private pending = new Map<number, PendingRequest>();

	/**
	 * Creates a new {@link XernerxWebsocket} client instance.
	 * @param options - Connection, authentication, timeout, and WebSocket implementation options.
	 */
	constructor({ token, url, dev, timeout = 15_000, WebSocketImpl }: XernerxWebsocketOptions) {
		this.url = url ?? (dev ? 'wss://ws.dev.xernerx.com' : 'wss://ws.xernerx.com');
		this.token = token;
		this.timeout = timeout;

		// Prefer injected implementation (Node), otherwise use browser native
		this.WSImpl = WebSocketImpl ?? ((globalThis as any).WebSocket as unknown as WSLike);

		if (!this.WSImpl) {
			throw new Error('No WebSocket implementation found. Provide WebSocketImpl in Node.');
		}
	}

	/* ================= CONNECTION ================= */

	/**
	 * Opens the WebSocket connection and completes the `auth` handshake if not already connected.
	 * Concurrent calls share the same in-flight connection promise.
	 * @returns A promise that resolves once the connection is open and authenticated.
	 */
	public async connect() {
		if (this.ready) {
			t.log('Connected to websocket');
			return;
		}

		if (this.connecting) {
			t.info('Connecting to websocket...');
			return this.connecting;
		}

		this.connecting = new Promise<void>((resolve, reject) => {
			const finalUrl = this.url + (this.url.includes('?') ? '&' : '?') + `token=${encodeURIComponent(this.token)}`;
			this.ws = new this.WSImpl(finalUrl);

			this.ws.onopen = () => {
				this.setupMessageHandler();

				const id = ++this.requestId;
				const timer =
					this.timeout > 0
						? setTimeout(() => {
								this.pending.delete(id);
								this.ws?.close();
								reject(new Error(`WebSocket auth timed out after ${this.timeout}ms`));
							}, this.timeout)
						: undefined;

				this.pending.set(id, {
					resolve: () => {
						this.ready = true;
						resolve();
					},
					reject: (err) => {
						this.ready = false;
						this.ws?.close();
						reject(err);
					},
					timer,
				});

				this.ws.send(
					JSON.stringify({
						id,
						service: 'auth',
						body: { token: this.token },
					})
				);
			};

			this.ws.onerror = (err: any) => {
				reject(err);
			};

			this.ws.onclose = () => {
				this.ready = false;
				this.connecting = null;

				const closeError = new Error('Connection closed');
				reject(closeError);

				for (const { reject: rejectPending, timer } of this.pending.values()) {
					if (timer) clearTimeout(timer);
					rejectPending(closeError);
				}
				this.pending.clear();
			};
		}).finally(() => {
			this.connecting = null;
		});

		return this.connecting;
	}

	private setupMessageHandler() {
		this.ws.onmessage = (event: any) => {
			let msg: any;

			try {
				msg = JSON.parse(event.data.toString());
			} catch {
				return;
			}

			const id = msg?.id;
			if (typeof id !== 'number') return;

			const pending = this.pending.get(id);
			if (!pending) return;

			if (pending.timer) clearTimeout(pending.timer);
			this.pending.delete(id);

			if ((msg.message && !('_id' in msg) && msg.success !== true) || msg.success === false) {
				pending.reject(new Error(msg.message || 'WebSocket request failed'));
			} else {
				if (Object.keys(msg).length <= 1) {
					pending.resolve(null);
				} else {
					delete msg.id;
					pending.resolve(msg);
				}
			}
		};
	}

	/* ================= CORE ================= */

	private request<T = any>(service: string, payload: Record<string, any>): Promise<T> {
		if (!this.ready) {
			throw new Error('WebSocket not ready');
		}

		const id = ++this.requestId;

		return new Promise<T>((resolve, reject) => {
			const timer =
				this.timeout > 0
					? setTimeout(() => {
							this.pending.delete(id);
							reject(new Error(`WebSocket request timed out after ${this.timeout}ms`));
						}, this.timeout)
					: undefined;

			this.pending.set(id, { resolve, reject, timer });

			this.ws.send(
				JSON.stringify({
					id,
					service,
					...payload,
				})
			);
		});
	}

	/* ================= CRUD ================= */

	/**
	 * Sends a `GET` action request to a target WebSocket service, automatically connecting first if needed.
	 * @param service - Target service namespace (e.g. `'virtue'`, `'bots'`, `'users'`).
	 * @param action - Service action name to execute.
	 * @param body - Optional query/filter parameters.
	 * @returns A promise resolving to the service response payload.
	 */
	public async get<T = any>(service: string, action: string, body: Record<string, any> = {}): Promise<T> {
		await this.connect();
		return this.request<T>(service, {
			method: 'GET',
			action,
			body,
		});
	}

	/**
	 * Sends a `POST` (create) action request to a target WebSocket service, automatically connecting first if needed.
	 * @param service - Target service namespace.
	 * @param action - Service action name to execute.
	 * @param body - Document or payload data to create.
	 * @returns A promise resolving to the created resource or service response.
	 */
	public async create<T = any>(service: string, action: string, body: Record<string, any> = {}): Promise<T> {
		await this.connect();
		return this.request<T>(service, {
			method: 'POST',
			action,
			body,
		});
	}

	/**
	 * Sends a `PATCH` (update) action request to a target WebSocket service, automatically connecting first if needed.
	 * @param service - Target service namespace.
	 * @param action - Service action name to execute.
	 * @param body - Filter and update fields.
	 * @returns A promise resolving to the updated resource or service response.
	 */
	public async update<T = any>(service: string, action: string, body: Record<string, any> = {}): Promise<T> {
		await this.connect();
		return this.request<T>(service, {
			method: 'PATCH',
			action,
			body,
		});
	}

	/**
	 * Sends a `DELETE` action request to a target WebSocket service, automatically connecting first if needed.
	 * @param service - Target service namespace.
	 * @param action - Service action name to execute.
	 * @param body - Identifier or filter parameters for deletion.
	 * @returns A promise resolving to the deletion result.
	 */
	public async delete<T = any>(service: string, action: string, body: Record<string, any> = {}): Promise<T> {
		await this.connect();
		return this.request<T>(service, {
			method: 'DELETE',
			action,
			body,
		});
	}

	/**
	 * Closes the active WebSocket connection and rejects any pending in-flight requests.
	 */
	public disconnect() {
		this.ready = false;
		this.connecting = null;

		const closeError = new Error('Connection closed');
		for (const { reject, timer } of this.pending.values()) {
			if (timer) clearTimeout(timer);
			reject(closeError);
		}
		this.pending.clear();

		this.ws?.close();
	}
}
