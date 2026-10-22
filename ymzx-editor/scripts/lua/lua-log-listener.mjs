import dgram from 'node:dgram';
import { randomBytes, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

function samePath(a, b) { return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b; }
// The installed UI_UGCScript normalizes the drive to lowercase. Its
// SaveCodeInfo then compares ToProjectPath(pack) with that exact string.
export function gameScriptPath(value) {
  return /^[A-Za-z]:[\\/]/.test(value) ? value[0].toLowerCase()+value.slice(1).replaceAll('/','\\') : value;
}
export function prepareReadOnlyReply(command, request, approvedProject) {
  if (!['GET', 'GET_MIN'].includes(command) || request?.onlyShow !== true || request?.bNeedSave !== false) throw new Error('Only explicit metadata-display requests are supported');
  const project = fs.realpathSync(approvedProject);
  // A newly copied map has no local project association yet. The official
  // panel first asks for display metadata without ProjectPath. Reply only with
  // the explicitly configured workspace; an explicitly different path fails.
  if (request.ProjectPath !== undefined && (typeof request.ProjectPath !== 'string' || !samePath(fs.realpathSync(request.ProjectPath), project))) throw new Error('Project differs from the explicitly selected local project');
  function localFile(value) {
    if (typeof value !== 'string') throw new Error('Invalid project file');
    const file = fs.realpathSync(path.resolve(project, value));
    const relative = path.relative(project, file);
    if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative) || !fs.statSync(file).isFile()) throw new Error('Project file escapes approved directory');
    return file;
  }
  const manifest = JSON.parse(fs.readFileSync(localFile('dist/play.json'), 'utf8').replace(/^\uFEFF/, ''));
  if (manifest.type === 'pack') manifest.pack = gameScriptPath(localFile(manifest.pack));
  else if (manifest.type === 'merge') {
    const source = fs.readFileSync(localFile(command === 'GET_MIN' ? manifest.luamin : manifest.lua), 'utf8').replace(/^\uFEFF/, '');
    manifest.buff = deflateSync(Buffer.from(source, 'utf8')).toString('base64');
  } else throw new Error('Unsupported project build type');
  manifest.onlyShow = true; manifest.bNeedSave = false;
  return { cmd: command, data: JSON.stringify(manifest) };
}

// Observed in DreamHelper 1.4.7. Writes require a short-lived, one-use import grant.
export function decodePacket(buffer) {
  const encoded = buffer.toString('ascii').trim();
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('invalid base64');
  const packet = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) throw new Error('invalid packet');
  return packet;
}

export function prepareImportReply(command, request, project, mapInfo, grant) {
  if (command !== 'GET' || request?.onlyShow === true || request?.bNeedSave !== true) throw new Error('Expected an explicit save/import request');
  if (typeof request.ProjectPath !== 'string') throw new Error('Select the local project in the native panel before importing');
  if (!grant || !Number.isFinite(Date.parse(grant.expiresAt)) || Date.parse(grant.expiresAt) <= Date.now()) throw new Error('Import grant missing or expired');
  if (!mapInfo || mapInfo.mapName !== grant.mapName || mapInfo.curLayerId !== grant.layerId) throw new Error('Map/layer differs from import grant');
  if (!samePath(fs.realpathSync(grant.project), fs.realpathSync(project))) throw new Error('Import project differs from grant');
  if (!grant.manifestSha256 || createHash('sha256').update(fs.readFileSync(path.join(project, 'dist/play.json'))).digest('hex') !== grant.manifestSha256) throw new Error('Import manifest changed since review');
  const reply = prepareReadOnlyReply(command, { ...request, onlyShow: true, bNeedSave: false }, project);
  const manifest = JSON.parse(reply.data);
  if (manifest.type !== 'pack' || createHash('sha256').update(fs.readFileSync(manifest.pack)).digest('hex') !== grant.packSha256) throw new Error('Import archive changed since review');
  manifest.onlyShow = false; manifest.bNeedSave = true;
  return { cmd: command, data: JSON.stringify(manifest) };
}

export function startListener({ port = 2356, seconds = 60, handshake = false, project, importGrantPath, statusPath, emit = value => console.log(JSON.stringify(value)) } = {}) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('invalid port');
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 86400) throw new Error('invalid duration');
  const socket = dgram.createSocket('udp4');
  let closed = false;
  let bound = false;
  let peer;
  let fragment;
  let mapInfo;
  let lastSeenAt;
  let lastStatusWrite = 0;
  let lastImport;
  const updateStatus = () => {
    if (!statusPath || !bound) return;
    const result = { listening: !closed, port, processId: process.pid, handshake, project, sessionId: peer?.clientid, sourcePort: peer?.sourcePort, mapInfo, lastSeenAt, lastImport, updatedAt: new Date().toISOString() };
    fs.mkdirSync(path.dirname(statusPath), { recursive: true });
    const temporary = statusPath + '.tmp-' + process.pid;
    fs.writeFileSync(temporary, JSON.stringify(result, null, 2));
    fs.renameSync(temporary, statusPath);
    lastStatusWrite = Date.now();
  };
  const stop = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    updateStatus();
    socket.close();
  };
  const timer = seconds ? setTimeout(stop, seconds * 1000) : undefined;
  socket.on('error', error => { emit({ event: 'error', code: error.code }); stop(); });
  socket.on('close', () => emit({ event: 'closed' }));
  socket.on('message', (buffer, remote) => {
    if (remote.address !== '127.0.0.1') return;
    try {
      const packet = decodePacket(buffer);
      if (packet.clientid === 'UGC_SCRIPT_UDP_SERVICE_LOGIN') {
        emit({ event: 'login_observed', sourcePort: remote.port, handshake });
        if (!handshake) return;
        const replyPort = packet.port || remote.port;
        if (!Number.isInteger(replyPort) || replyPort < 1 || replyPort > 65535) throw new Error('invalid reply port');
        const previousPort = peer?.sourcePort;
        peer = { sourcePort: remote.port, replyPort, clientid: `UGC_SERVICE_ISOK_${randomBytes(8).readBigUInt64BE()}` };
        fragment = undefined;
        mapInfo = undefined;
        lastSeenAt = new Date().toISOString();
        updateStatus();
        emit({ event: previousPort ? 'reconnected' : 'session_started', time: lastSeenAt, sourcePort: remote.port, previousPort, sessionId: peer.clientid });
        // A successful handshake alone does not establish that a script was loaded.
        socket.send(JSON.stringify({ clientid: peer.clientid, data: { cmd: 'SERVICE_LOGIN' } }), replyPort, '127.0.0.1');
        return;
      }
      if (!peer || remote.port !== peer.sourcePort || packet.clientid !== peer.clientid) {
        emit({ event: 'unverified_packet', bytes: buffer.length, sourcePort: remote.port, matchesSession: packet.clientid === peer?.clientid });
        return;
      }
      let data = packet.data;
      lastSeenAt = new Date().toISOString();
      if (Date.now() - lastStatusWrite > 1000) updateStatus();
      if (packet.maxnum !== undefined || packet.curnum !== undefined) {
        const { maxnum, curnum } = packet;
        if (!Number.isInteger(maxnum) || !Number.isInteger(curnum) || maxnum < 1 || maxnum > 1024 || curnum < 1 || curnum > maxnum || typeof data !== 'string') throw new Error('invalid fragments');
        if (curnum === 1) fragment = { total: maxnum, next: 1, text: '', time: Date.now() };
        if (!fragment || fragment.total !== maxnum || fragment.next !== curnum || Date.now() - fragment.time > 5000) throw new Error('incomplete fragments');
        fragment.text += data;
        if (Buffer.byteLength(fragment.text) > 4 * 1024 * 1024) throw new Error('packet too large');
        fragment.next++;
        if (curnum !== maxnum) return;
        data = JSON.parse(fragment.text);
        fragment = undefined;
      }
      if (['PRINT_LOG', 'PRINT_WARNING', 'PRINT_ERROR'].includes(data?.cmd)) {
        emit({ event: 'log', time: new Date().toISOString(), sessionId: peer.clientid, mapName: mapInfo?.mapName, layerId: mapInfo?.curLayerId, level: data.cmd, text: String(data.data ?? '').slice(0, 65536) });
      } else if (data?.cmd === 'MAP_INFO') {
        mapInfo = data.data;
        updateStatus();
        emit({ event: 'map_info_received', time: new Date().toISOString(), data: data.data });
      } else if (['GET', 'GET_MIN'].includes(data?.cmd)) {
        emit({ event: 'script_requested', time: new Date().toISOString(), command: data.cmd, request: data.data, replied: false });
        if (project) {
          const isDisplay = data.data?.onlyShow === true && data.data?.bNeedSave === false;
          let reply;
          if (isDisplay) reply = prepareReadOnlyReply(data.cmd, data.data, project);
          else {
            if (!importGrantPath || !fs.existsSync(importGrantPath)) throw new Error('Import is not armed; no script sent');
            const grant = JSON.parse(fs.readFileSync(importGrantPath, 'utf8'));
            if (grant.sessionId !== peer.clientid) throw new Error('Import grant belongs to a different connection session');
            reply = prepareImportReply(data.cmd, data.data, project, mapInfo, grant);
          }
          const message = JSON.stringify({ clientid: peer.clientid, data: reply });
          if (Buffer.byteLength(message) > 65507) throw new Error('Reply exceeds UDP payload limit');
          if (!isDisplay) fs.renameSync(importGrantPath, importGrantPath + '.consumed-' + Date.now());
          const sessionId = peer.clientid;
          socket.send(message, peer.replyPort, '127.0.0.1', error => {
            const result = error ? { event: 'send_error', code: error.code } : { event: isDisplay ? 'metadata_sent' : 'import_sent', time: new Date().toISOString(), sessionId, onlyShow: isDisplay, bNeedSave: !isDisplay, verified: false };
            if (!isDisplay) { lastImport = result; updateStatus(); }
            emit(result);
          });
        }
      } else {
        emit({ event: 'command_ignored', command: String(data?.cmd ?? '').slice(0, 100) });
      }
    } catch (error) {
      fragment = undefined;
      emit({ event: 'packet_rejected', reason: error.message });
    }
  });
  socket.bind(port, '127.0.0.1', () => { bound = true; updateStatus(); emit({ event: 'listening', port, handshake, seconds }); });
  return { socket, stop };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const option = (name, fallback) => {
    const index = args.indexOf(name);
    return index < 0 ? fallback : Number(args[index + 1]);
  };
  const outIndex = args.indexOf('--out');
  const outPath = outIndex >= 0 ? path.resolve(args[outIndex + 1]) : null;
  if (outPath) fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const emit = value => { const line = JSON.stringify(value); console.log(line); if (outPath) fs.appendFileSync(outPath, line + '\n', 'utf8'); };
  const projectIndex = args.indexOf('--project');
  const project = projectIndex >= 0 ? fs.realpathSync(args[projectIndex + 1]) : undefined;
  const grantIndex = args.indexOf('--import-grant');
  const importGrantPath = grantIndex >= 0 ? path.resolve(args[grantIndex + 1]) : undefined;
  const statusIndex = args.indexOf('--status');
  const statusPath = statusIndex >= 0 ? path.resolve(args[statusIndex + 1]) : undefined;
  const listener = startListener({ port: option('--port', 2356), seconds: option('--seconds', 60), handshake: args.includes('--handshake'), project, importGrantPath, statusPath, emit });
  process.once('SIGINT', listener.stop);
  process.once('SIGTERM', listener.stop);
}
