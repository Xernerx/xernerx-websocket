<!-- @format -->

![Xernerx Banner](https://xernerx.com/banner.png)

# @xernerx/websocket

Official Promise-based WebSocket RPC client (`@xernerx/websocket`) for the **Xernerx Suite WebSocket Gateway** (`wss://ws.xernerx.com`).

---

## Features

- **Typed RPC Client**: Extend `XernerxWebsocket` to perform typed `get()`, `create()`, `update()`, and `delete()` operations across Xernerx Suite services (`xernerx`, `virtue`, `metamorphosis`, `zodiac`, etc.).
- **Automatic Connection & Token Handshake**: Lazy-connects on the first RPC call (or explicitly via `this.connect()`), deduplicating concurrent connection attempts and authenticating via the `auth` service handshake.
- **Request Multiplexing & Per-Request Timeouts**: Correlates concurrent requests over a single WebSocket connection using auto-incrementing request IDs and configurable timeouts (`15000ms` by default).
- **Universal Runtime Compatibility**: Uses native `globalThis.WebSocket` in Node.js `>=22` / browsers, or accepts a custom `WebSocketImpl` (such as `ws`).
- **Scoped CLI Logging**: Built-in `@xernerx/terminal` logging under the `XW` scope.

---

## Install

```bash
pnpm add @xernerx/websocket
```

```bash
npm install @xernerx/websocket
```

---

## Setup

Extend `XernerxWebsocket` to connect and execute RPC requests against the Xernerx WebSocket Gateway:

```ts
import { XernerxWebsocket } from '@xernerx/websocket';
import { Terminal } from '@xernerx/terminal';

export class WebSocket extends XernerxWebsocket {
	private readonly console = new Terminal({ scope: 'XW' });

	constructor() {
		super({
			token: process.env.XERNERX_WS_TOKEN!,
			dev: process.env.NODE_ENV === 'DEVELOPMENT',
		});

		this.connect();
	}

	async run() {
		// Fetch a record
		const guildProfile = await this.get('virtue', 'guilds', {
			id: '784094726432489522',
		});
		this.console.info('Loaded guild profile:', guildProfile);

		// Create a record
		await this.create('virtue', 'levels', {
			guild: '784094726432489522',
			id: '123456789012345678',
			xp: 100,
		});

		// Update a record
		await this.update('virtue', 'levels', {
			guild: '784094726432489522',
			id: '123456789012345678',
			xp: 250,
		});

		// Delete a record
		await this.delete('virtue', 'levels', {
			guild: '784094726432489522',
			id: '123456789012345678',
		});

		// Cleanly close the connection when shutting down
		this.disconnect();
	}
}

new WebSocket().run();
```

---

## Usage with `@xernerx/framework`

Attach your `WebSocket` class instance onto your `XernerxClient` subclass using `this.websocket`:

```ts
import { XernerxClient } from '@xernerx/framework';
import { XernerxWebsocket } from '@xernerx/websocket';

export class WebSocket extends XernerxWebsocket {
	constructor() {
		super({
			token: process.env.XERNERX_WS_TOKEN!,
			dev: process.env.NODE_ENV === 'DEVELOPMENT',
		});

		this.connect();
	}
}

export class Client extends XernerxClient {
	public readonly websocket = new WebSocket();

	constructor() {
		super({
			intents: ['Guilds', 'GuildMessages'],
			token: process.env.DISCORD_BOT_TOKEN!,
		});

		this.connect();
	}
}

new Client();
```

---

## Options (`XernerxWebsocketOptions`)

| Option          | Type      | Default                  | Required | Description                                                                       |
| --------------- | --------- | ------------------------ | -------- | --------------------------------------------------------------------------------- |
| `token`         | `string`  | —                        | **Yes**  | Xernerx WebSocket bearer token used for gateway authentication.                   |
| `url`           | `string`  | `'wss://ws.xernerx.com'` | No       | Custom WebSocket server URL.                                                      |
| `dev`           | `boolean` | `false`                  | No       | Connect to the development gateway (`wss://ws.dev.xernerx.com`).                  |
| `timeout`       | `number`  | `15000`                  | No       | Timeout in milliseconds for authentication and RPC requests.                      |
| `WebSocketImpl` | `WSLike`  | `globalThis.WebSocket`   | No       | Custom WebSocket constructor (e.g. `ws`) for runtimes without native `WebSocket`. |

---

## Methods

| Method                                   | Return Type     | Description                                                                                             |
| ---------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------- |
| `this.connect()`                         | `Promise<void>` | Opens the WebSocket connection and performs the `auth` handshake. Called automatically by CRUD methods. |
| `this.get<T>(service, action, body?)`    | `Promise<T>`    | Sends a `GET` RPC request to `service`.                                                                 |
| `this.create<T>(service, action, body?)` | `Promise<T>`    | Sends a `POST` RPC request to `service`.                                                                |
| `this.update<T>(service, action, body?)` | `Promise<T>`    | Sends a `PATCH` RPC request to `service`.                                                               |
| `this.delete<T>(service, action, body?)` | `Promise<T>`    | Sends a `DELETE` RPC request to `service`.                                                              |
| `this.disconnect()`                      | `void`          | Closes the WebSocket connection and rejects any in-flight requests.                                     |

---

## Documentation & API Reference

Full documentation, gateway protocol specifications, and interactive WebSocket playgrounds are available on the **[Xernerx Documentation](https://docs.xernerx.com)** and the **[`@xernerx/websocket` Package Reference](https://docs.xernerx.com/packages/@xernerx/websocket)**.

### Package Symbols (`@xernerx/websocket`)

- **Classes**:
  - [`XernerxWebsocket`](https://docs.xernerx.com/packages/@xernerx/websocket#class-XernerxWebsocket) — Promise-based RPC client for `wss://ws.xernerx.com`.
- **Interfaces & Types**:
  - [`XernerxWebsocketOptions`](https://docs.xernerx.com/packages/@xernerx/websocket#interface-XernerxWebsocketOptions) — Connection, token, timeout, and `WebSocketImpl` options.

### WebSocket Gateway Documentation

- [WebSocket Gateway Overview](https://docs.xernerx.com/websocket#overview)
- [Connecting to the Gateway](https://docs.xernerx.com/websocket#connecting)
- [Gateway Authentication & Handshake](https://docs.xernerx.com/websocket#authentication)
- [RPC Protocol Specification](https://docs.xernerx.com/websocket#protocol)
- [Services & Actions Catalog](https://docs.xernerx.com/websocket#services)
- [Client Integration Example](https://docs.xernerx.com/websocket#client)

### Ecosystem Links

- [Xernerx Documentation Home](https://docs.xernerx.com)
- [All Xernerx Packages](https://docs.xernerx.com/packages)
- [`xernerx` Collection](https://docs.xernerx.com/packages/xernerx)
- [`@xernerx/framework` Documentation](https://docs.xernerx.com/packages/@xernerx/framework)
- [`@xernerx/commands` Documentation](https://docs.xernerx.com/packages/@xernerx/commands)
- [`@xernerx/hooks` Documentation](https://docs.xernerx.com/packages/@xernerx/hooks)
- [`@xernerx/stats` Documentation](https://docs.xernerx.com/packages/@xernerx/stats)
- [`@xernerx/terminal` Documentation](https://docs.xernerx.com/packages/@xernerx/terminal)
- [Release Changelog](https://info.xernerx.com/changelog#@xernerx/websocket)

---

## Support & Links

- [Discord Support Server](https://xernerx.com/discord)
- [`@xernerx/websocket` Package Documentation](https://docs.xernerx.com/packages/@xernerx/websocket)
- [WebSocket Gateway Documentation](https://docs.xernerx.com/websocket)
- [Xernerx Developer Portal](https://portal.xernerx.com)
- [Xernerx Website](https://xernerx.com)
