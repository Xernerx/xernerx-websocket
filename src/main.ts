/** @format */

import { terminal } from '@xernerx/terminal';

const t = terminal.child({ scope: 'XW' });

export type WSLike = {
	new (url: string): any;
};

type PendingRequest = {
	resolve: (value: any) => void;
	reject: (reason?: any) => void;
	timer?: ReturnType<typeof setTimeout>;
};

export class XernerxWebsocket {
	private ws!: any;
	private url: string;
	protected readonly token: string;
	private readonly timeout: number;

	private WSImpl: WSLike;

	private ready = false;
	private connecting: Promise<void> | null = null;

	private requestId = 0;
	private pending = new Map<number, PendingRequest>();

	constructor({ token, url, dev, timeout = 15_000, WebSocketImpl }: { token: string; url?: string; dev?: boolean; timeout?: number; WebSocketImpl?: WSLike }) {
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

	public async get<T = any>(service: string, action: string, body: Record<string, any> = {}): Promise<T> {
		await this.connect();
		return this.request<T>(service, {
			method: 'GET',
			action,
			body,
		});
	}

	public async create<T = any>(service: string, action: string, body: Record<string, any> = {}): Promise<T> {
		await this.connect();
		return this.request<T>(service, {
			method: 'POST',
			action,
			body,
		});
	}

	public async update<T = any>(service: string, action: string, body: Record<string, any> = {}): Promise<T> {
		await this.connect();
		return this.request<T>(service, {
			method: 'PATCH',
			action,
			body,
		});
	}

	public async delete<T = any>(service: string, action: string, body: Record<string, any> = {}): Promise<T> {
		await this.connect();
		return this.request<T>(service, {
			method: 'DELETE',
			action,
			body,
		});
	}

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
