import fs from 'node:fs';
import path from 'node:path';
import { read, status, logs } from './editor-client.mjs';
import { config, createBridge, root } from './kouding-read-bridge.mjs';
import { manageProbe } from './install-probe.mjs';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
let outputPath;
if (outIndex >= 0) {
  if (!args[outIndex + 1]) throw new Error('--out needs a file path');
  outputPath = path.resolve(args[outIndex + 1]);
  args.splice(outIndex, 2);
}
const [command, ...rest] = args;
function json(file) { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
function baseline(file) {
  const info = json(file);
  if (!info.mapId || !info.projectId || !info.project) throw new Error('Expected an editorInfo baseline file');
  return { mapId: info.mapId, projectId: info.projectId, expectedProject: info.project };
}
function emit(result) {
  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({ ok: true, output: outputPath }));
  } else console.log(JSON.stringify(result, null, 2));
}
try {
  if (command === 'serve') {
    if (rest.length || outputPath) throw new Error('serve takes no arguments');
    const settings = config();
    const server = createBridge(settings);
    server.on('error', error => { console.error(JSON.stringify({ error: error.message })); process.exitCode = 1; });
    server.listen(settings.port, settings.host, () => emit({ listening: `http://${settings.host}:${settings.port}`, stateDirectory: root }));
    process.once('SIGINT', () => server.close());
    process.once('SIGTERM', () => server.close());
  } else if (['check', 'install', 'update', 'restore'].includes(command)) {
    if (rest.length > 1) throw new Error('Expected at most one web resource path');
    emit(manageProbe(command, rest[0]));
  } else if (command === 'status' && !rest.length) emit(await status());
  else if (command === 'logs' && !rest.length) emit(await logs());
  else if (command === 'info' && rest.length <= 1) emit(await read('editorInfo', rest[0] ? json(rest[0]) : {}));
  else if (command === 'call' && rest.length >= 1 && rest.length <= 2) emit(await read(rest[0], rest[1] ? json(rest[1]) : {}));
  else if (command === 'apply' && rest.length === 2) emit(await read('applyProject', { ...baseline(rest[0]), project: json(rest[1]) }));
  else if (['save', 'play', 'reload'].includes(command) && rest.length === 1) emit(await read({ save: 'saveProject', play: 'tryPlay', reload: 'reloadPage' }[command], baseline(rest[0])));
  else if (command === 'help' || !command) emit({
    commands: ['check WEB_ROOT', 'install WEB_ROOT', 'update [WEB_ROOT]', 'restore [WEB_ROOT]', 'serve', 'status', 'info [QUERY_JSON]', 'logs', 'call METHOD [PARAMS_JSON]', 'apply BASELINE_JSON PROJECT_JSON', 'save BASELINE_JSON', 'play BASELINE_JSON', 'reload BASELINE_JSON'],
    output: '--out FILE writes UTF-8 JSON; omit for stdout',
    state: 'YMZX_STATE_DIR selects local config, backups and evidence; default is skill/runtime',
  });
  else throw new Error('Invalid command or arguments; run help');
} catch (error) { console.error(JSON.stringify({ error: error.message })); process.exitCode = 1; }
