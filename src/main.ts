/** @format */

import { terminal } from '@xernerx/terminal';

const t = terminal.child({ scope: 'WS' });

type WSLike = {
	new (url: string): any;
};

type PendingRequest = {
	resolve: (value: any) => void;
	reject: (reason?: any) => void;
};

export class XernerxWebsocket {
	private ws!: any;
	private url: string;
	protected readonly token: string;

	private WSImpl: WSLike;

	private ready = false;
	private connecting: Promise<void> | null = null;

	private requestId = 0;
	private pending = new Map<number, PendingRequest>();

	constructor({ token, url, WebSocketImpl }: { token: string; url?: string; WebSocketImpl?: WSLike }) {
		this.url = url ?? 'wss://ws.xernerx.com';
		this.token = token;

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
			this.ws = new this.WSImpl(this.url);

			this.ws.onopen = async () => {
				try {
					this.setupMessageHandler();

					const res = await this.request('auth', {
						method: 'POST',
						body: { token: this.token },
					});

					if (!res?.success) {
						throw new Error('Authentication failed');
					}

					this.ready = true;
					resolve();
				} catch (err) {
					reject(err);
				}
			};

			this.ws.onerror = (err: any) => {
				reject(err);
			};

			this.ws.onclose = () => {
				this.ready = false;
				this.connecting = null;

				for (const { reject } of this.pending.values()) {
					reject('Connection closed');
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

			this.pending.delete(id);

			if (msg.message) {
				pending.reject(msg.message);
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

	private request(service: string, payload: any): Promise<any> {
		if (!this.ready && service !== 'auth') {
			throw new Error('WebSocket not authenticated');
		}

		const id = ++this.requestId;

		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });

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

	public async get(service: string, action: string, body: any = {}) {
		await this.connect();
		return this.request(service, {
			method: 'GET',
			action,
			body,
		});
	}

	public async create(service: string, action: string, body: any = {}) {
		await this.connect();
		return this.request(service, {
			method: 'POST',
			action,
			body,
		});
	}

	public async update(service: string, action: string, body: any = {}) {
		await this.connect();
		return this.request(service, {
			method: 'PATCH',
			action,
			body,
		});
	}

	public async delete(service: string, action: string, body: any = {}) {
		await this.connect();
		return this.request(service, {
			method: 'DELETE',
			action,
			body,
		});
	}

	public disconnect() {
		this.ready = false;
		this.ws?.close();
	}
}
