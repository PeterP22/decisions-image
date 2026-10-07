import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/server.mjs';
import { DEFAULT_QUESTION } from '../src/decisions.mjs';

async function app(t, options = {}) {
  const server = createApp(options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return `http://127.0.0.1:${server.address().port}`;
}
async function sample(base, name = 'damaged') {
  const data = await fetch(`${base}/samples/${name}.png`);
  assert.equal(data.status, 200);
  return `data:image/png;base64,${Buffer.from(await data.arrayBuffer()).toString('base64')}`;
}
const post = (base, body, origin = base) => fetch(`${base}/api/inspect`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) });

test('offline UI serves assets and explains mode without exposing env files', async t => {
  const base = await app(t);
  assert.match(await (await fetch(base)).text(), /One image/);
  const config = await (await fetch(`${base}/api/config`)).json();
  assert.equal(config.mode, 'offline');
  assert.equal((await fetch(`${base}/.env`)).status, 404);
  assert.equal((await fetch(`${base}/src/server.mjs`)).status, 404);
});

test('offline mode replays only exact synthetic fixtures and the preset question', async t => {
  const base = await app(t);
  for (const [name, outcome] of [['damaged', 'yes'], ['intact', 'no'], ['unclear', 'review']]) {
    const imageDataUrl = await sample(base, name);
    const result = await (await post(base, { imageDataUrl, question: DEFAULT_QUESTION })).json();
    assert.equal(result.mode, 'offline');
    assert.equal(result.outcome, outcome);
    assert.equal(result.elapsedMs, null);
    assert.match(result.notice, /hand-authored/);
    const differentQuestion = await post(base, { imageDataUrl, question: 'Is it blue?' });
    assert.equal(differentQuestion.status, 400);
  }
});

test('cross-origin and malformed requests are rejected before inspection', async t => {
  let calls = 0;
  const base = await app(t, { mode: 'live', inspector: async () => { calls++; return {}; } });
  assert.equal((await post(base, {}, 'https://untrusted.example')).status, 403);
  assert.equal((await post(base, {})).status, 400);
  const invalid = await fetch(`${base}/api/inspect`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(invalid.status, 400);
  const oversized = await fetch(`${base}/api/inspect`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: 'x'.repeat(7 * 1024 * 1024 + 1) });
  assert.equal(oversized.status, 413);
  assert.equal(calls, 0);
});

test('live server forwards validated input and returns results', async t => {
  let received;
  const base = await app(t, { mode: 'live', inspector: async input => { received = input; return { mode: 'live', outcome: 'yes', probability: 0.95, elapsedMs: 125 }; } });
  const imageDataUrl = await sample(base);
  const response = await post(base, { imageDataUrl, question: 'Is the box damaged?' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).probability, 0.95);
  assert.deepEqual(received, { imageDataUrl, question: 'Is the box damaged?' });
});
