/** @format */

import { terminal } from '@xernerx/terminal';
import { XernerxWebsocket } from '../dist/main.js';

const t = terminal.child({ scope: 'XW' });

const client = new (class WS extends XernerxWebsocket {
	constructor() {
		super({
			token: process.env.TOKEN,
			dev: true,
		});
	}
})();

await client.connect();

const level = await client.get('xernerx', 'levels', {
	id: '482513687417061376',
});
t.info('Level:', level);

const guild = await client.update('virtue', 'guilds', {
	id: '784094726432489522',
	mode: 'balanced',
});
t.info('Guild updated:', guild);

const user = await client.get('xernerx', 'users', {
	id: '482513687417061376',
});
t.info('User:', user);
t.log('Credits:', user?.credits?.balance || 0);

client.disconnect();
process.exit(0);
