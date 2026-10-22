import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(process.env.YMZX_STATE_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'runtime'));
export const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(root, '.local', 'read-bridge.json');
export const methods = new Set(['snapshot', 'GetUGCPList', 'GetCode', 'GetUGCPDebugState', 'GetUGCPDebugData', 'GetUGCPErrorData', 'GetUGCPOutputLogData', 'GetUGCPProfileData', 'GetAllActorCount']);
const editorMethods = new Set(['editorInfo', 'applyProject', 'saveProject', 'tryPlay', 'reloadPage']);
export function validateRequest(method, params = {}) {
  if (!methods.has(method) && !editorMethods.has(method) && !['sceneReferences', 'resourceReferences', 'staticTypes', 'resourceMenu', 'resourceList', 'resourcePage', 'resourceItems'].includes(method)) throw new Error('Method is not allowed by this typed bridge');
  if (!params || typeof params !== 'object' || Array.isArray(params)) throw new Error('Invalid parameters');
  if(method==='resourceItems'){
    const keys=['mapId','type','menuOrder','pageIndex'];
    if(keys.some(k=>!Object.hasOwn(params,k))||Object.keys(params).some(k=>![...keys,'subMenuOrder'].includes(k))||typeof params.mapId!=='string'||!/^\d{1,32}$/.test(params.mapId)||typeof params.type!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(params.type)||!Number.isInteger(params.menuOrder)||params.menuOrder<0||params.menuOrder>100000||!Number.isInteger(params.pageIndex)||params.pageIndex<1||params.pageIndex>100||Object.hasOwn(params,'subMenuOrder')&&(!Number.isInteger(params.subMenuOrder)||params.subMenuOrder<0||params.subMenuOrder>100000))throw Error('Invalid catalog page query');
    return;
  }
  if (['resourceMenu', 'resourceList', 'resourcePage'].includes(method)) {
    const keys=method==='resourcePage'?['mapId','type','pageIndex']:['mapId','type'];
    if(Object.keys(params).length!==keys.length||keys.some(k=>!Object.hasOwn(params,k))||typeof params.mapId!=='string'||!/^\d{1,32}$/.test(params.mapId)||typeof params.type!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(params.type)||method==='resourcePage'&&(!Number.isInteger(params.pageIndex)||params.pageIndex<1||params.pageIndex>100))throw Error('Invalid typed resource metadata query');
    return;
  }
  if (method === 'staticTypes') {
    if (Object.keys(params).length !== 1 || typeof params.mapId !== 'string' || !/^\d{1,32}$/.test(params.mapId)) throw new Error('Exact map ID required for static type metadata');
    return;
  }
  if (method === 'resourceReferences') {
    if (Object.keys(params).length !== 3 || !['Widget', 'Element', 'LogicElement', 'Module'].includes(params.kind) || typeof params.mapId !== 'string' || !/^\d{1,32}$/.test(params.mapId) || !Array.isArray(params.ids) || params.ids.length < 1 || params.ids.length > 30 || params.ids.some(id => typeof id !== 'string' || !/^\d{1,32}$/.test(id)) || new Set(params.ids).size !== params.ids.length) throw new Error('Invalid typed resource reference query');
    return;
  }
  if (method === 'sceneReferences') {
    if (Object.keys(params).length !== 2 || typeof params.mapId !== 'string' || !/^\d{1,32}$/.test(params.mapId) || !Array.isArray(params.sceneIds) || params.sceneIds.length < 1 || params.sceneIds.length > 30 || params.sceneIds.some(id => typeof id !== 'string' || !/^\d{1,32}$/.test(id))) throw new Error('Invalid scene reference query');
    return;
  }
  if (method === 'editorInfo') {
    if (Object.keys(params).some(key => key !== 'types') || (params.types !== undefined && (!Array.isArray(params.types) || params.types.length > 40 || params.types.some(type => typeof type !== 'string' || !/^[A-Za-z0-9_]{1,120}$/.test(type))))) throw new Error('Invalid block type query');
    return;
  }
  if (editorMethods.has(method)) {
    const keys = ['mapId', 'projectId', 'expectedProject', ...(method === 'applyProject' ? ['project'] : [])];
    if (Object.keys(params).length !== keys.length || keys.some(key => !(key in params))) throw new Error('Action requires map, project, and inspected baseline');
    if (typeof params.mapId !== 'string' || !/^\d{1,32}$/.test(params.mapId) || typeof params.projectId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(params.projectId)) throw new Error('Invalid map/project identity');
    for (const value of [params.expectedProject, ...(method === 'applyProject' ? [params.project] : [])]) {
      if (!value || typeof value !== 'object' || value.blocklyFileId !== params.projectId || !Array.isArray(value.triggerGroups)) throw new Error('Invalid project payload');
    }
    return;
  }
  if (method === 'GetCode') {
    if (Object.keys(params).length !== 1 || typeof params.fileId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(params.fileId)) throw new Error('GetCode requires a validated fileId string');
  } else if (Object.keys(params).length) throw new Error('This method takes no parameters');
}
export function config() {
  if (fs.existsSync(configPath)) return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const value = { host: '127.0.0.1', port: 43157, token: randomBytes(32).toString('hex') };
  fs.writeFileSync(configPath, JSON.stringify(value, null, 2));
  return value;
}

export function createBridge(settings) {
  const jobs = new Map();
  let browser = null;
  const diagnostics = { startedAt: new Date().toISOString(), preflights: 0, rejectedOrigins: [], unauthorized: 0 };
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin && origin !== 'null' && origin !== 'file://' && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) {
      if (!diagnostics.rejectedOrigins.includes(origin) && diagnostics.rejectedOrigins.length < 10) diagnostics.rejectedOrigins.push(String(origin).slice(0, 200));
      res.writeHead(403); res.end(); return;
    }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Ymzx-Key');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') { diagnostics.preflights++; res.writeHead(204); res.end(); return; }
    const reply = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    if (req.headers['x-ymzx-key'] !== settings.token) { diagnostics.unauthorized++; reply(401, { error: 'Unauthorized' }); return; }
    try {
      let payload = {};
      if (req.method === 'POST') {
        const chunks = []; let bytes = 0;
        for await (const chunk of req) { bytes += chunk.length; if (bytes > 8 * 1024 * 1024) throw new Error('Payload too large'); chunks.push(chunk); }
        payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      }
      if (req.method === 'GET' && req.url === '/status') {
        reply(200, { mode: 'typed-editor', browser, pending: jobs.size, diagnostics });
      } else if (req.method === 'POST' && req.url === '/browser/hello') {
        browser = { seenAt: new Date().toISOString(), ready: payload.ready === true, blockly: payload.blockly === true, version: payload.version || 1, userAgent: String(req.headers['user-agent'] || '').slice(0, 250) };
        reply(200, { ok: true });
      } else if (req.method === 'GET' && req.url === '/browser/poll') {
        const job = [...jobs.values()].find(item => !item.delivered);
        if (job) job.delivered = true;
        reply(200, { job: job ? { id: job.id, method: job.method, params: job.params } : null });
      } else if (req.method === 'POST' && req.url === '/browser/result') {
        const job = jobs.get(payload.id);
        if (job?.delivered) { clearTimeout(job.timer); jobs.delete(job.id); job.resolve(payload); }
        reply(200, { ok: true });
      } else if (req.method === 'POST' && req.url === '/request') {
        validateRequest(payload.method, payload.params);
        if (editorMethods.has(payload.method) && browser?.version !== 2) throw new Error('Page needs adapter version 2');
        if (jobs.size >= 4) throw new Error('Too many pending requests');
        if (payload.method === 'applyProject') {
          fs.mkdirSync(path.join(root, 'evidence'), { recursive: true });
          fs.writeFileSync(path.join(root, 'evidence', `before-apply-${Date.now()}-${randomBytes(4).toString('hex')}.json`), JSON.stringify({ capturedAt: new Date().toISOString(), mapId: payload.params.mapId, project: payload.params.expectedProject }, null, 2), { flag: 'wx' });
        }
        const result = await new Promise(resolve => {
          const id = randomBytes(12).toString('hex');
          const timeout = editorMethods.has(payload.method) ? 60000 : 15000;
          const timer = setTimeout(() => { jobs.delete(id); resolve({ id, error: 'Browser response timeout; inspect state before retrying a write' }); }, timeout);
          jobs.set(id, { id, method: payload.method, params: payload.params || {}, delivered: false, timer, resolve });
        });
        reply(200, result);
      } else reply(404, { error: 'Unknown endpoint' });
    } catch (error) { if (!res.headersSent) reply(400, { error: error.message }); }
  });
  server.on('close', () => { for (const job of jobs.values()) { clearTimeout(job.timer); job.resolve({ error: 'Server closed' }); } jobs.clear(); });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const settings = config();
  const base = `http://${settings.host}:${settings.port}`;
  const [command, method, fileId] = process.argv.slice(2);
  if (command === 'serve') {
    const server = createBridge(settings);
    server.on('error', e => { console.error(e.message); process.exitCode = 1; });
    server.listen(settings.port, settings.host, () => console.log(JSON.stringify({ listening: base, mode: 'typed-editor' })));
    process.once('SIGINT', () => server.close());
    process.once('SIGTERM', () => server.close());
  } else {
    const headers = { 'X-Ymzx-Key': settings.token, 'Content-Type': 'application/json' };
    if (command === 'status') console.log(await (await fetch(base + '/status', { headers })).text());
    else if (command === 'request') {
      const params = fileId ? { fileId } : {};
      validateRequest(method, params);
      const response = await fetch(base + '/request', { method: 'POST', headers, body: JSON.stringify({ method, params }) });
      const result = await response.json();
      const destination = path.join(root, 'evidence', `live-${method}-${Date.now()}.json`);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, JSON.stringify(result, null, 2));
      console.log(JSON.stringify({ destination, ok: !result.error, error: result.error, resultKeys: Object.keys(result.result || {}) }));
    } else throw new Error('Use serve, status, or request METHOD [FILE_ID]');
  }
}
