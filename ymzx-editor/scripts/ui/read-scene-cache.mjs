import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readWire } from './protobuf-wire.mjs';

function child(fields, number) { const entry = fields.find(item => item.field === number && item.bytes); return entry ? readWire(entry.bytes) : []; }
function at(fields, numbers) { for (const number of numbers) fields = child(fields, number); return fields; }
function vector(fields) {
  const values = [1, 2, 3].map(number => fields.find(item => item.field === number && item.wire === 5)?.float);
  return values.every(Number.isFinite) ? values : null;
}
function findCommon(fields, depth = 0, prefix = []) {
  if (depth > 12) return null;
  // An arbitrary bytes field may resemble a nested message without actually being
  // one. Reject only that candidate; keep searching the enclosing real message.
  try {
    const transform = child(fields, 1);
    if (vector(child(transform, 1)) && vector(child(transform, 2)) && vector(child(transform, 3))) return { fields, path: prefix };
  } catch {}
  for (const entry of fields) {
    if (!entry.bytes || !entry.bytes.length) continue;
    let nested;
    try { nested = readWire(entry.bytes); } catch { continue; }
    const found = findCommon(nested, depth + 1, [...prefix, entry.field]);
    if (found) return found;
  }
  return null;
}
export function readSceneCache(file) {
  const root = readWire(fs.readFileSync(file)), level = child(root, 5);
  const objects = level.filter(item => item.field === 24 && item.bytes).flatMap(item => {
    const wrapper = readWire(item.bytes);
    return wrapper.filter(entry => entry.field === 2 && entry.bytes).map(instance => {
    const payload = readWire(instance.bytes);
    const dataId = payload.find(entry => entry.field === 3 && entry.wire === 0)?.value;
    const id = payload.find(entry => entry.field === 2 && entry.wire === 0)?.value ?? dataId;
    const storedTypeId = wrapper.find(entry => entry.field === 1 && entry.wire === 0)?.value;
    let common = at(payload, [6, 11, 1]);
    if (!common.length) common = at(payload, [6, 1, 1, 1]);
    const found = findCommon(payload);
    if (found) common = found.fields;
    const transform = child(common, 1);
    return { id, dataId, storedTypeId, commonPath: found?.path ?? null, transform: transform.length ? { position: vector(child(transform, 1)), rotationFields: vector(child(transform, 2)), scale: vector(child(transform, 3)) } : null };
    });
  });
  return { source: path.resolve(file), capturedAt: new Date().toISOString(), objects, limits: 'Read-only interpretation of observed cache fields. Some resource classes use different payloads; stored type IDs can differ from public editor type IDs. Cache is saved state, not current unsaved scene.' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { const result = readSceneCache(process.argv[2]); if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2)); }
  catch (error) { console.error(JSON.stringify({ error: error.message })); process.exitCode = 1; }
}
