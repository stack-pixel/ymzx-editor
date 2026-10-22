import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, root, validateRequest } from './kouding-read-bridge.mjs';

async function exchange(route, body) {
  const settings = config();
  const response = await fetch(`http://${settings.host}:${settings.port}${route}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'X-Ymzx-Key': settings.token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(65000),
  });
  const value = await response.json();
  if (!response.ok || value.error) throw new Error(value.error || `Bridge HTTP ${response.status}`);
  return value;
}

export async function status() {
  const value = await exchange('/status');
  const ageMs = value.browser ? Date.now() - Date.parse(value.browser.seenAt) : null;
  return { ...value, connected: ageMs !== null && ageMs >= 0 && ageMs < 12000, ageMs };
}

export async function read(method, params = {}) {
  validateRequest(method, params);
  const current = await status();
  if (!current.connected || !current.browser.ready) throw new Error('No recent response from the game page. Open Kouding and check bridge status.');
  const value = (await exchange('/request', { method, params })).result;
  if (!value) throw new Error('Missing response payload');
  if (value.ret !== undefined && value.ret !== 0) throw new Error(`Game returned ${value.ret}: ${value.errMsg || 'unknown error'}`);
  return value;
}

export function decodeData(value) {
  for (let count = 0; count < 3 && typeof value === 'string'; count++) {
    try { value = JSON.parse(value); } catch { break; }
  }
  return value;
}

export async function inspectProject() {
  const listing = decodeData((await read('GetUGCPList')).data);
  if (!listing || !Array.isArray(listing.list) || !listing.selectId) throw new Error('No selected project in game response');
  const item = listing.list.find(item => item.blocklyFileId === listing.selectId);
  if (!item) throw new Error('Selected project is absent from file list');
  const project = decodeData((await read('GetCode', { fileId: item.blocklyFileId })).data);
  if (!project || typeof project !== 'object' || !Array.isArray(project.triggerGroups)) throw new Error('Unexpected project format');
  const snapshot = await read('snapshot');
  if (!snapshot.ready) throw new Error(snapshot.reason || 'Canvas is not ready');
  const savedIds = new Set();
  function collect(value) {
    if (!value || typeof value !== 'object') return;
    if (value.type && typeof value.id === 'string') savedIds.add(value.id);
    for (const child of Object.values(value)) collect(child);
  }
  collect(project);
  const record = { capturedAt: new Date().toISOString(), mapId: listing.mapId, project, snapshot };
  const destination = path.join(root, 'evidence', `project-backup-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, JSON.stringify(record, null, 2), { flag: 'wx' });
  return {
    destination,
    triggerGroups: project.triggerGroups.length,
    visibleAndShadowBlocks: snapshot.blocks.length,
    canvasBlockIdsExistInSavedProject: snapshot.blocks.every(block => savedIds.has(block.id)),
    note: 'ID comparison verifies correspondence, not equality of all block fields or runtime behavior.',
  };
}

export async function logs() {
  const [output, errors] = await Promise.all([read('GetUGCPOutputLogData'), read('GetUGCPErrorData')]);
  return { capturedAt: new Date().toISOString(), output: decodeData(output.data), errors: decodeData(errors.data), note: 'Empty responses do not establish that a test was run or passed.' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  try {
    if (command === 'status') console.log(JSON.stringify(await status(), null, 2));
    else if (command === 'inspect') console.log(JSON.stringify(await inspectProject(), null, 2));
    else if (command === 'logs') console.log(JSON.stringify(await logs(), null, 2));
    else throw new Error('Use status, inspect, or logs');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
