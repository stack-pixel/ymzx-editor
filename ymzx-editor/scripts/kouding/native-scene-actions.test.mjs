import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { validateRequest } from './kouding-read-bridge.mjs';

function fixture(responseFor) {
  const calls = [];
  const context = { window: { letsgo: { callFunction: (method, params, callback) => { calls.push({ method, params }); callback(responseFor ? responseFor(method, params) : method === 'GetAllActorCount' ? { ret: 0, count: 2, mapID: '123' } : { ret: 0, data: [{ sceneId: '333' }] }); } } }, setTimeout, clearTimeout };
  vm.runInNewContext(fs.readFileSync(new URL('./native-scene-actions.js', import.meta.url), 'utf8'), context);
  return { calls, execute: context.window.__codexNativeSceneActions.execute };
}

test('Native reference query validates IDs and refuses querying a changed map', async () => {
  const { calls, execute } = fixture();
  assert.doesNotThrow(() => validateRequest('sceneReferences', { mapId: '123', sceneIds: ['333'] }));
  assert.throws(() => validateRequest('sceneReferences', { mapId: '123', sceneIds: ['../bad'] }));
  await assert.rejects(execute('sceneReferences', { mapId: '456', sceneIds: ['333'] }), /differs/);
  assert.equal(calls.length, 1);
  const result = await execute('sceneReferences', { mapId: '123', sceneIds: ['333'] });
  assert.equal(result.reference.data[0].sceneId, '333');
  assert.equal(calls[2].method, 'GetReferenceElementInfoReq');
  assert.equal(calls[2].params.checkedAssets[0].elements[0].types[0], 'Element');
  assert(!calls.some(call => /Save|Create|Spawn|Delete/.test(call.method)));
});

test('static metadata reads use only AllStatic and correlate the echoed sequence',async()=>{
 validateRequest('staticTypes',{mapId:'123'});
 assert.throws(()=>validateRequest('staticTypes',{mapId:123}));
 const response=(method,params)=>method==='GetAllActorCount'?{mapID:'123'}:{seqId:params.seqId,data:{type:'AllStatic',list:[{type:'CoordinateType',list:[]}]}};
 const f=fixture(response);const r=await f.execute('staticTypes',{mapId:'123'});assert.equal(r.types[0].type,'CoordinateType');assert.equal(f.calls[1].params.data.type,'AllStatic');
 const bad=fixture((method,params)=>method==='GetAllActorCount'?{mapID:'123'}:{...response(method,params),seqId:1});
 await assert.rejects(bad.execute('staticTypes',{mapId:'123'}),/callback differs/);
 assert.equal(bad.calls.length,2);
});

test('resource query mode must match live metadata before requesting lists or menus',async()=>{
 const native=(method,params)=>method==='GetAllActorCount'?{mapID:'123'}:params.data.type==='AllStatic'?{seqId:params.seqId,data:{type:'AllStatic',list:[{VariableKey:'Level',DynamicQueryType:'SingleQuery'},{VariableKey:'ElementType',DynamicQueryType:'GetTypeMenu'}]}}:{seqId:params.seqId,data:{type:params.data.type,list:[{key:'1',name:'Main'}],menus:[]}};
 const f=fixture(native);const r=await f.execute('resourceList',{mapId:'123',type:'Level'});assert.equal(r.items[0].name,'Main');
 const before=f.calls.length;await assert.rejects(f.execute('resourceMenu',{mapId:'123',type:'Level'}),/not declared/);assert.equal(f.calls.slice(before).filter(c=>c.method==='GetTypeMenu').length,0);
 assert.throws(()=>validateRequest('resourcePage',{mapId:'123',type:'ModuleType',pageIndex:0}));
 assert.doesNotThrow(()=>validateRequest('resourcePage',{mapId:'123',type:'ModuleType',pageIndex:1}));
});

test('catalog pages use live submenu bounds and never issue an out-of-range item query',async()=>{
 const native=(method,params)=>{
  if(method==='GetAllActorCount')return {mapID:'123'};
  if(params.data.type==='AllStatic')return {seqId:params.seqId,data:{type:'AllStatic',list:[{VariableKey:'LogicElementType',DynamicQueryType:'GetTypeMenu'}]}};
  if(method==='GetTypeMenu')return {seqId:params.seqId,data:{type:'LogicElementType',menus:[{menuOrder:2,pageCount:1,subMenus:[{subMenuOrder:16,pageCount:1}]}]}};
  return {seqId:params.seqId,data:{type:'LogicElementType',list:[{key:'123456789',name:'Timer'}]}};
 };
 const f=fixture(native),args={mapId:'123',type:'LogicElementType',menuOrder:2,subMenuOrder:16,pageIndex:1};
 validateRequest('resourceItems',args);const r=await f.execute('resourceItems',args);assert.equal(r.items[0].name,'Timer');
 const count=f.calls.length;await assert.rejects(f.execute('resourceItems',{...args,pageIndex:2}),/outside observed/);
 assert.equal(f.calls.slice(count).filter(c=>c.method==='GetTypeData'&&c.params.data.type!=='AllStatic').length,0);
});

test('Widget reference reads preserve the type and reject ambiguous input before calls', async () => {
  const {calls,execute}=fixture();
  const params={mapId:'123',kind:'Widget',ids:['100047','100048']};
  validateRequest('resourceReferences',params);
  assert.throws(()=>validateRequest('resourceReferences',{...params,kind:'UI'}));
  await assert.rejects(execute('resourceReferences',{...params,ids:['100047','100047']}),/Invalid/);
  assert.equal(calls.length,0);
  const result=await execute('resourceReferences',params);
  assert.equal(result.kind,'Widget');
  assert.deepEqual(Array.from(calls[1].params.checkedAssets[0].elements[0].types),['Widget']);
  assert.equal(calls.length,3);
  assert.equal(calls[2].method,'GetAllActorCount');
});
