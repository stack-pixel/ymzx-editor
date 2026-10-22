import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readLogs } from './lua.mjs';

test('Log diagnostics isolate test sessions and attach unique source locations', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lua-diag-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'src')); fs.writeFileSync(path.join(dir, 'src/GameEntry.lua'), 'return {}');
  const file = path.join(dir, 'events.jsonl');
  fs.writeFileSync(file, [
    { event: 'log', sessionId: 'old', time: '2026-10-14T17:00:00Z', level: 'PRINT_ERROR', text: 'src/GameEntry.lua:3: old failure' },
    { event: 'log', sessionId: 'new', time: '2026-10-14T18:00:00Z', level: 'PRINT_LOG', text: 'expected marker' },
    { event: 'log', sessionId: 'new', time: '2026-10-14T18:00:01Z', level: 'PRINT_ERROR', text: '[string "GameEntry.lua"]:8: runtime fault' }
  ].map(JSON.stringify).join('\n') + '\n{incomplete');
  const result = readLogs(file, { project: dir, sessionId: 'new', after: '2026-10-14T17:59:00Z', marker: 'expected marker' });
  assert.equal(result.records.length, 2);
  assert.equal(result.errors.length, 1);
  assert(result.markerFound);
  assert.deepEqual(result.errors[0].sourceRefs, [{ file: path.join(dir, 'src/GameEntry.lua'), line: 8 }]);
  assert.deepEqual(result.parseFailures, [4]);
  assert.throws(() => readLogs(file, { after: 'invalid' }));
});

test('Import preparation rejects changed source, stale target and duplicate arming', { skip: !process.env.YMZX_HELPER_FILE && 'Set YMZX_HELPER_FILE' }, t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lua-cli-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const project = path.join(dir, 'project'); fs.mkdirSync(path.join(project, 'src'), { recursive: true });
  const entry = path.join(project, 'src/GameEntry.lua'); fs.writeFileSync(entry, 'Log:PrintLog("test")');
  const commandFile = fileURLToPath(new URL('./lua.mjs', import.meta.url));
  const call = (...args) => JSON.parse(execFileSync(process.execPath, [commandFile, ...args], { encoding: 'utf8', env: { ...process.env, YMZX_STATE_DIR: dir }, stdio: ['ignore', 'pipe', 'pipe'] }));
  call('configure', project, process.env.YMZX_HELPER_FILE); call('build');
  fs.writeFileSync(path.join(dir, '.local/lua-status.json'), JSON.stringify({ listening: true, sessionId: 'test-session', mapInfo: { mapName: 'test', curLayerId: 1 } }));
  const uiFile = path.join(dir, 'ui.json');
  const ui = { method: 'window-inspected', componentId: 333, mapName: 'test', layerId: 1, verifiedAt: new Date().toISOString() };
  fs.writeFileSync(uiFile, JSON.stringify({ ...ui, layerId: 2 }));
  assert.throws(() => call('arm-import', uiFile), /map\/layer/);
  fs.writeFileSync(uiFile, JSON.stringify({ ...ui, verifiedAt: '2000-01-01' }));
  assert.throws(() => call('arm-import', uiFile), /Fresh component/);
  fs.writeFileSync(uiFile, JSON.stringify(ui)); fs.appendFileSync(entry, '\n-- changed');
  assert.throws(() => call('arm-import', uiFile), /Source changed/);
  call('build'); assert.equal(call('arm-import', uiFile).armed, true);
  assert.throws(() => call('arm-import', uiFile), /already armed/);
  assert.equal(call('cancel-import').armed, false);
  assert(!fs.existsSync(path.join(dir, '.local/lua-import-once.json')));
});
