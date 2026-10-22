import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('./ymzx.mjs', import.meta.url));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function fixture(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ymzx-skill-test-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const state = path.join(temp, 'state');
  const web = path.join(temp, 'web');
  fs.mkdirSync(web); fs.mkdirSync(path.join(state, '.local'), { recursive: true });
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: { ...process.env, YMZX_STATE_DIR: state, YMZX_WEB_ROOT: '' } });
  return { state, web, run };
}
test('unknown frontend is rejected without patching files or creating a token', t => {
  const { state, web, run } = fixture(t);
  const original = '<body>Unrecognized frontend</body>';
  fs.writeFileSync(path.join(web, 'index.html'), original);
  assert.equal(run('install', web).status, 1);
  assert.equal(fs.readFileSync(path.join(web, 'index.html'), 'utf8'), original);
  assert.equal(fs.existsSync(path.join(web, 'codex-read-probe.js')), false);
  assert.equal(fs.existsSync(path.join(state, '.local/read-bridge.json')), false);
});
test('restore rejects changed files, then restores exactly matching originals', t => {
  const { state, web, run } = fixture(t);
  const indexPath = path.join(web, 'index.html');
  const probePath = path.join(web, 'codex-read-probe.js');
  const backup = path.join(state, '.local/original.html');
  const original = '<body>Original</body>', patched = '<body>Patched</body>', probe = 'test probe';
  fs.writeFileSync(backup, original); fs.writeFileSync(indexPath, patched); fs.writeFileSync(probePath, 'Changed');
  fs.writeFileSync(path.join(state, '.local/probe-install.json'), JSON.stringify({ indexPath, probePath, backup, originalHash: hash(original), patchedHash: hash(patched), probeHash: hash(probe) }));
  assert.equal(run('restore').status, 1);
  assert.equal(fs.readFileSync(indexPath, 'utf8'), patched);
  fs.writeFileSync(probePath, probe);
  assert.equal(run('restore').status, 0);
  assert.equal(fs.readFileSync(indexPath, 'utf8'), original);
  assert.equal(fs.existsSync(probePath), false);
});
test('CLI can be invoked from an unrelated working directory', t => {
  const { run } = fixture(t);
  const result = run('help');
  assert.equal(result.status, 0);
  assert.ok(JSON.parse(result.stdout).commands.includes('apply BASELINE_JSON PROJECT_JSON'));
});
