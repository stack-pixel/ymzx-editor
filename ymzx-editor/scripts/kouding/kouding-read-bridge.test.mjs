import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import vm from 'node:vm';
import { once } from 'node:events';
import { createBridge } from './kouding-read-bridge.mjs';

async function fixture(t) {
  const server = createBridge({ token: 'test-only' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'X-Ymzx-Key': 'test-only', 'Content-Type': 'application/json' };
  const call = (route, body, extra = {}) => fetch(base + route, {
    method: body ? 'POST' : 'GET', headers, ...extra,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { base, headers, call };
}

test('authentication, browser origins and write rejection', async t => {
  const { base, call } = await fixture(t);
  assert.equal((await fetch(base + '/status')).status, 401);
  assert.equal((await call('/status', null, { headers: { 'X-Ymzx-Key': 'test-only', Origin: 'https://untrusted.invalid' } })).status, 403);
  const preflight = await fetch(base + '/browser/hello', { method: 'OPTIONS', headers: { Origin: 'null' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), 'null');
  const cefPreflight = await fetch(base + '/browser/hello', { method: 'OPTIONS', headers: { Origin: 'file://' } });
  assert.equal(cefPreflight.status, 204);
  assert.equal(cefPreflight.headers.get('Access-Control-Allow-Origin'), 'file://');
  assert.equal((await call('/browser/hello', { ready: true }, { headers: { Origin: 'file://', 'Content-Type': 'application/json' } })).status, 401);
  assert.equal((await call('/request', { method: 'SaveCode', params: {} })).status, 400);
  assert.equal((await call('/request', { method: 'GetCode', params: { fileId: '../bad' } })).status, 400);
  const status = await (await call('/status')).json();
  assert.equal(status.browser, null);
  assert.deepEqual(status.diagnostics.rejectedOrigins, ['https://untrusted.invalid']);
});

test('read response preserves Chinese when UTF-8 is split across chunks', async t => {
  const { base, headers, call } = await fixture(t);
  const waiting = call('/request', { method: 'GetUGCPOutputLogData', params: {} });
  let job;
  for (let attempt = 0; attempt < 50; attempt++) {
    job = (await (await call('/browser/poll')).json()).job;
    if (job) break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(job.method, 'GetUGCPOutputLogData');
  const result = { data: '当游戏开始：循环次数 1' };
  const bytes = Buffer.from(JSON.stringify({ id: job.id, result }));
  const split = bytes.indexOf(Buffer.from('当')) + 1;
  await new Promise((resolve, reject) => {
    const req = http.request(base + '/browser/result', { method: 'POST', headers }, res => {
      res.resume(); res.on('end', resolve);
    });
    req.on('error', reject);
    req.write(bytes.subarray(0, split));
    setTimeout(() => req.end(bytes.subarray(split)), 15);
  });
  assert.deepEqual((await (await waiting).json()).result, result);
  assert.equal((await (await call('/status')).json()).pending, 0);
});

test('page probe refuses writes even if a server supplies one', async () => {
  const code = fs.readFileSync(new URL('./kouding-browser-probe.js', import.meta.url), 'utf8');
  const nativeCalls = [];
  let resolveResult;
  const reported = new Promise(resolve => { resolveResult = resolve; });
  const context = {
    window: {
      __codexKoudingReadConfig: { port: 1, token: 'test-only' },
      letsgo: { isInWebPage: () => false, callFunction: (...args) => nativeCalls.push(args) },
    },
    AbortController,
    setTimeout: () => 1,
    clearTimeout: () => {},
    fetch: async (url, init) => {
      if (url.endsWith('/browser/result')) resolveResult(JSON.parse(init.body));
      return { ok: true, json: async () => url.endsWith('/browser/poll') ? { job: { id: 'write', method: 'SaveCode', params: {} } } : {} };
    },
  };
  vm.runInNewContext(code, context);
  const result = await reported;
  assert.match(result.error, /denied/);
  assert.equal(nativeCalls.length, 0);
});
