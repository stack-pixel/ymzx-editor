import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { checkProject } from './lua-check-project.mjs';
import { buildProject } from './lua-build-project.mjs';
import { startListener } from './lua-log-listener.mjs';
import { projectSources } from './lua-helper-runtime.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const stateDir = path.resolve(process.env.YMZX_STATE_DIR || path.join(scriptDir, '../../runtime'));
const digest = buffer => createHash('sha256').update(buffer).digest('hex');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const save = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); };
function sources(project) {
  return Object.fromEntries(projectSources(project).map(file => [path.relative(project, file).split(path.sep).join('/'), digest(fs.readFileSync(file))]));
}

export function readLogs(eventFile, { after, sessionId, project, marker } = {}) {
  if (after && !Number.isFinite(Date.parse(after))) throw new Error('Invalid --after timestamp');
  const files = project ? projectSources(project) : [];
  const lines = fs.readFileSync(eventFile, 'utf8').split(/\r?\n/);
  const records = [], parseFailures = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    let event;
    try { event = JSON.parse(lines[i]); } catch { parseFailures.push(i + 1); continue; }
    if (event.event !== 'log' || (sessionId && event.sessionId !== sessionId) || (after && Date.parse(event.time) < Date.parse(after))) continue;
    const sourceRefs = [];
    for (const match of String(event.text).matchAll(/(?:\[string "([^"\n]+)"\]|([\w./\\-]+\.lua)):(\d+)/g)) {
      const reference = (match[1] ?? match[2]).replace(/\\/g, '/').replace(/^@/, '');
      const candidates = files.filter(file => {
        const relative = path.relative(project, file).split(path.sep).join('/');
        return relative === reference || relative.endsWith('/' + reference);
      });
      if (candidates.length === 1) sourceRefs.push({ file: candidates[0], line: Number(match[3]) });
    }
    records.push({ ...event, sourceRefs });
  }
  return { records, errors: records.filter(record => record.level === 'PRINT_ERROR'), warnings: records.filter(record => record.level === 'PRINT_WARNING'), markerFound: marker ? records.some(record => record.text.includes(marker)) : undefined, parseFailures, note: 'PRINT_ERROR can be explicitly emitted by application code. No errors or no records is not proof that a test passed.' };
}

async function main() {
  const args = process.argv.slice(2);
  let output;
  const outIndex = args.indexOf('--out');
  if (outIndex >= 0) { if (!args[outIndex + 1]) throw new Error('--out needs a path'); output = path.resolve(args[outIndex + 1]); args.splice(outIndex, 2); }
  const [command, ...rest] = args;
  const configFile = path.join(stateDir, '.local/lua-connection.json');
  const stateFile = path.join(stateDir, '.local/lua-status.json');
  const grantFile = path.join(stateDir, '.local/lua-import-once.json');
  const reviewFile = path.join(stateDir, '.local/lua-build-review.json');
  const eventFile = path.join(stateDir, 'evidence/lua-live-events.jsonl');
  const emit = result => { if (output) { save(output, result); console.log(JSON.stringify({ output })); } else console.log(JSON.stringify(result, null, 2)); };
  if (!command || command === 'help') return emit({ commands: ['configure PROJECT HELPER_EXTENSION_JS', 'check', 'build', 'serve [SECONDS]', 'status', 'logs [--after UTC_TIME] [--session SESSION_ID] [--marker TEXT]', 'arm-import UI_VERIFICATION_JSON', 'cancel-import'], state: 'YMZX_STATE_DIR selects configuration/status/evidence; default skill/runtime', import: 'arm-import does not click native Import Script. Inspect the component and trigger import through the editor; verify using exported source and runtime evidence.' });
  if (command === 'configure' && rest.length === 2) {
    const project = fs.realpathSync(rest[0]), helper = fs.realpathSync(rest[1]);
    const check = checkProject(project, helper);
    if (!check.ok) throw new Error('Project checks failed: ' + JSON.stringify(check.errors));
    if (fs.existsSync(stateFile) && json(stateFile).listening && json(stateFile).project !== project) throw new Error('Stop the existing Lua listener before changing projects');
    save(configFile, { project, helper, port: 2356 }); return emit({ configured: true, stateDir, project, warnings: check.warnings });
  }
  const config = json(configFile);
  if (command === 'check' && !rest.length) return emit(checkProject(config.project, config.helper));
  if (command === 'build' && !rest.length) {
    const result = await buildProject(config.project, config.helper);
    save(reviewFile, { ...result, manifestSha256: digest(fs.readFileSync(result.manifestPath)), sources: sources(config.project), builtAt: new Date().toISOString() });
    return emit(result);
  }
  if (command === 'status' && !rest.length) return emit(fs.existsSync(stateFile) ? json(stateFile) : { listening: false, reason: 'No listener status file' });
  if (command === 'logs') {
    const accepted = new Set(['--after', '--session', '--marker']); const options = {};
    for (let i = 0; i < rest.length; i += 2) { if (!accepted.has(rest[i]) || !rest[i + 1]) throw new Error('Invalid log filter'); options[rest[i]] = rest[i + 1]; }
    return emit(readLogs(eventFile, { project: config.project, after: options['--after'], sessionId: options['--session'], marker: options['--marker'] }));
  }
  if (command === 'cancel-import' && !rest.length) {
    if (fs.existsSync(grantFile)) fs.renameSync(grantFile, grantFile + '.cancelled-' + Date.now());
    return emit({ armed: false });
  }
  if (command === 'arm-import' && rest.length === 1) {
    const state = json(stateFile), ui = json(rest[0]), review = json(reviewFile);
    if (!state.listening || !state.sessionId || !state.mapInfo) throw new Error('Reconnect the programming component before importing');
    if (ui.method !== 'window-inspected' || !Number.isInteger(ui.componentId) || ui.componentId < 1 || !Number.isFinite(Date.parse(ui.verifiedAt)) || Date.now() - Date.parse(ui.verifiedAt) > 120000 || Date.parse(ui.verifiedAt) > Date.now() + 5000) throw new Error('Fresh component verification from editor UI is required');
    if (ui.mapName !== state.mapInfo.mapName || ui.layerId !== state.mapInfo.curLayerId) throw new Error('UI map/layer differs from connected editor');
    if (JSON.stringify(sources(config.project)) !== JSON.stringify(review.sources)) throw new Error('Source changed after packaging; build again');
    if (digest(fs.readFileSync(review.pack)) !== review.sha256 || digest(fs.readFileSync(path.join(config.project, 'dist/play.json'))) !== review.manifestSha256) throw new Error('Build changed after packaging; build again');
    if (review.project !== fs.realpathSync(config.project)) throw new Error('Build belongs to a different project');
    if (fs.existsSync(grantFile)) throw new Error('An import is already armed; cancel before replacing it');
    const grant = { project: config.project, mapName: ui.mapName, layerId: ui.layerId, componentId: ui.componentId, sessionId: state.sessionId, expiresAt: new Date(Date.now() + 120000).toISOString(), packSha256: review.sha256, manifestSha256: review.manifestSha256 };
    save(grantFile, grant); return emit({ armed: true, componentId: ui.componentId, expiresAt: grant.expiresAt, sha256: review.sha256, limitation: 'UDP requests omit component ID; the UI inspection identifies the target. Keep that component selected until import completes.' });
  }
  if (command === 'serve' && rest.length <= 1 && !output) {
    const seconds = rest[0] ? Number(rest[0]) : 0;
    fs.mkdirSync(path.dirname(eventFile), { recursive: true });
    const listener = startListener({ port: config.port, seconds, handshake: true, project: config.project, statusPath: stateFile, importGrantPath: grantFile, emit: event => { const line = JSON.stringify(event); console.log(line); fs.appendFileSync(eventFile, line + '\n'); } });
    process.once('SIGINT', listener.stop); process.once('SIGTERM', listener.stop); return;
  }
  throw new Error('Invalid Lua command; run help');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(JSON.stringify({ error: error.message })); process.exitCode = 1; });
