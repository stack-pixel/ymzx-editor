import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import dgram from 'node:dgram';
import { once } from 'node:events';
import { prepareReadOnlyReply, prepareImportReply, decodePacket, startListener, gameScriptPath } from './lua-log-listener.mjs';

test('Windows package path matches the native project directory comparison',()=>{
  const wire=gameScriptPath('C:\\Projects\\SampleMap\\dist\\code_test.zip');
  assert.equal(wire.split('\\dist\\code_')[0],'c:\\Projects\\SampleMap');
  assert.equal(gameScriptPath('/tmp/native/dist/code_test.zip'),'/tmp/native/dist/code_test.zip');
});

test('Lua metadata replies preserve display-only mode and reject writes and other projects', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lua-link-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'dist'));
  const archive = path.join(dir, 'dist/code.zip'); fs.writeFileSync(archive, 'test');
  const manifest = { type: 'pack', pack: archive, pwd: 'fixture-only' };
  fs.writeFileSync(path.join(dir, 'dist/play.json'), JSON.stringify(manifest));
  const request = { ProjectPath: dir, onlyShow: true, bNeedSave: false };
  const reply = prepareReadOnlyReply('GET', request, dir);
  assert.deepEqual(JSON.parse(reply.data), { ...manifest, pack: gameScriptPath(fs.realpathSync(archive)), onlyShow: true, bNeedSave: false });
  assert.throws(() => prepareReadOnlyReply('GET', { ...request, onlyShow: false }, dir));
  assert.throws(() => prepareReadOnlyReply('GET', { ...request, bNeedSave: true }, dir));
  assert.throws(() => prepareReadOnlyReply('GET', { ...request, ProjectPath: os.tmpdir() }, dir));
  const unbound={onlyShow:true,bNeedSave:false};
  assert.equal(JSON.parse(prepareReadOnlyReply('GET',unbound,dir).data).onlyShow,true);
  assert.throws(()=>prepareReadOnlyReply('GET',{...unbound,ProjectPath:''},dir));
  const grant = { project: dir, mapName: 'test map', layerId: 1, expiresAt: new Date(Date.now()+60000).toISOString(), packSha256: createHash('sha256').update('test').digest('hex'), manifestSha256: createHash('sha256').update(fs.readFileSync(path.join(dir, 'dist/play.json'))).digest('hex') };
  const importRequest = { ProjectPath: dir, bNeedSave: true };
  const mapInfo = { mapName: 'test map', curLayerId: 1 };
  assert.throws(()=>prepareImportReply('GET',{bNeedSave:true},dir,mapInfo,grant),/Select the local project/);
  assert.equal(JSON.parse(prepareImportReply('GET', importRequest, dir, mapInfo, grant).data).bNeedSave, true);
  assert.throws(() => prepareImportReply('GET', importRequest, dir, { ...mapInfo, curLayerId: 2 }, grant));
  assert.throws(() => prepareImportReply('GET', importRequest, dir, mapInfo, { ...grant, expiresAt: '2000-01-01' }));
  assert.throws(() => prepareImportReply('GET', importRequest, dir, mapInfo, { ...grant, packSha256: 'changed' }));
  fs.writeFileSync(path.join(dir, 'dist/play.json'), JSON.stringify({ type: 'pack', pack: process.execPath }));
  assert.throws(() => prepareReadOnlyReply('GET', request, dir), /escapes/);
  fs.writeFileSync(path.join(dir, 'dist/play.lua'), 'print("中文")');
  fs.writeFileSync(path.join(dir, 'dist/play.json'), JSON.stringify({ type: 'merge', lua: 'dist/play.lua' }));
  const merged = JSON.parse(prepareReadOnlyReply('GET', request, dir).data);
  assert.equal(inflateSync(Buffer.from(merged.buff, 'base64')).toString('utf8'), 'print("中文")');
});
test('Incoming protocol decodes base64 JSON and rejects invalid input', () => {
  const input = { data: { cmd: 'PRINT_LOG', data: '日志' } };
  assert.deepEqual(decodePacket(Buffer.from(Buffer.from(JSON.stringify(input)).toString('base64'))), input);
  assert.throws(() => decodePacket(Buffer.from('invalid!')));
});

test('Live UDP exchange handles reconnects, rejects old sessions and consumes import exactly once', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lua-udp-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'dist'));
  const pack = path.join(dir, 'dist/code.zip'); fs.writeFileSync(pack, 'fixture archive');
  const manifestFile = path.join(dir, 'dist/play.json');
  fs.writeFileSync(manifestFile, JSON.stringify({ type: 'pack', pack, pwd: 'fixture' }));
  const grantFile = path.join(dir, 'grant.json'), stateFile = path.join(dir, 'status.json');
  const available = dgram.createSocket('udp4'); available.bind(0, '127.0.0.1'); await once(available, 'listening');
  const port = available.address().port; available.close(); await once(available, 'close');
  const events = [];
  const listener = startListener({ port, seconds: 30, handshake: true, project: dir, importGrantPath: grantFile, statusPath: stateFile, emit: value => events.push(value) });
  t.after(listener.stop);
  await once(listener.socket, 'listening');
  const secondEvents = [];
  const duplicate = startListener({ port, seconds: 30, statusPath: stateFile, emit: event => secondEvents.push(event) });
  t.after(duplicate.stop);
  await new Promise(resolve => duplicate.socket.once('close', resolve));
  assert(secondEvents.some(event => event.event === 'error' && event.code === 'EADDRINUSE'));
  assert.equal(JSON.parse(fs.readFileSync(stateFile)).listening, true);
  async function waitFor(predicate) {
    const deadline = Date.now() + 1500;
    while (Date.now() < deadline) { const found = events.find(predicate); if (found) return found; await new Promise(resolve => setTimeout(resolve, 10)); }
    throw new Error('Expected protocol event not received: ' + JSON.stringify(events));
  }
  function peer() {
    const client = dgram.createSocket('udp4');
    t.after(() => client.close());
    const send = packet => client.send(Buffer.from(JSON.stringify(packet)).toString('base64'), port, '127.0.0.1');
    const reply = async packet => {
      const incoming = once(client, 'message', { signal: AbortSignal.timeout(1500) });
      send(packet); const [buffer] = await incoming; return JSON.parse(buffer.toString('utf8'));
    };
    return { send, reply };
  }
  const first = peer();
  const login1 = await first.reply({ clientid: 'UGC_SCRIPT_UDP_SERVICE_LOGIN' });
  assert.equal(login1.data.cmd, 'SERVICE_LOGIN');
  const map = { mapName: '中文地图', curLayerId: 1 };
  first.send({ clientid: login1.clientid, data: { cmd: 'MAP_INFO', data: map } });
  await waitFor(e => e.event === 'map_info_received');
  const second = peer();
  const login2 = await second.reply({ clientid: 'UGC_SCRIPT_UDP_SERVICE_LOGIN' });
  assert.notEqual(login1.clientid, login2.clientid);
  assert.equal(JSON.parse(fs.readFileSync(stateFile)).mapInfo, undefined);
  first.send({ clientid: login1.clientid, data: { cmd: 'PRINT_LOG', data: 'stale' } });
  await waitFor(e => e.event === 'unverified_packet');
  assert(!events.some(e => e.text === 'stale'));
  const joined = JSON.stringify({ cmd: 'PRINT_LOG', data: '中文 fragment' });
  for (let i = 0; i < 2; i++) second.send({ clientid: login2.clientid, maxnum: 2, curnum: i + 1, data: joined.slice(i * Math.floor(joined.length / 2), i === 0 ? Math.floor(joined.length / 2) : joined.length) });
  assert.equal((await waitFor(e => e.event === 'log')).text, '中文 fragment');
  const metadata = await second.reply({ clientid: login2.clientid, data: { cmd: 'GET', data: { ProjectPath: dir, onlyShow: true, bNeedSave: false } } });
  assert.equal(JSON.parse(metadata.data.data).onlyShow, true);
  second.send({ clientid: login2.clientid, data: { cmd: 'MAP_INFO', data: map } });
  await waitFor(e => e.event === 'map_info_received' && events.filter(v => v.event === 'map_info_received').length === 2);
  const request = { clientid: login2.clientid, data: { cmd: 'GET', data: { ProjectPath: dir, bNeedSave: true } } };
  second.send(request);
  await waitFor(e => e.event === 'packet_rejected' && e.reason.includes('not armed'));
  const grant = { project: dir, mapName: map.mapName, layerId: 1, expiresAt: new Date(Date.now() + 60000).toISOString(), packSha256: createHash('sha256').update('fixture archive').digest('hex'), manifestSha256: createHash('sha256').update(fs.readFileSync(manifestFile)).digest('hex'), sessionId: login1.clientid };
  fs.writeFileSync(grantFile, JSON.stringify(grant)); second.send(request);
  await waitFor(e => e.event === 'packet_rejected' && e.reason.includes('different connection'));
  fs.writeFileSync(grantFile, JSON.stringify({ ...grant, sessionId: login2.clientid }));
  fs.appendFileSync(manifestFile, ' '); second.send(request);
  await waitFor(e => e.event === 'packet_rejected' && e.reason.includes('manifest changed'));
  fs.writeFileSync(grantFile, JSON.stringify({ ...grant, sessionId: login2.clientid, manifestSha256: createHash('sha256').update(fs.readFileSync(manifestFile)).digest('hex') }));
  const imported = await second.reply(request);
  assert.equal(JSON.parse(imported.data.data).bNeedSave, true);
  assert(!fs.existsSync(grantFile));
  await waitFor(e => e.event === 'import_sent');
  second.send(request);
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(events.filter(e => e.event === 'import_sent').length, 1);
  assert.equal(JSON.parse(fs.readFileSync(stateFile)).lastImport.verified, false);
  assert.equal(fs.readdirSync(dir).filter(name => name.startsWith('grant.json.consumed')).length, 1);
});
