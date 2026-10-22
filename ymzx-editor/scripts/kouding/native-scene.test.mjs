import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {makeScenePlan,applyScenePlan,validateSceneChanges} from './native-scene.mjs';
const world='/Game/LetsGo/RuntimeLogicLevels/LetsGo_Level_UGCEditor.LetsGo_Level_UGCEditor';
const original={Rotation:{X:0,Y:0,Z:0,W:1},Translation:{X:1,Y:2,Z:3},Scale3D:{X:1,Y:1,Z:1}};
const target={Rotation:{X:0,Y:0,Z:Math.SQRT1_2,W:Math.SQRT1_2},Translation:{X:10,Y:20,Z:30},Scale3D:{X:2,Y:3,Z:4}};
const baseline={readOnly:true,mapId:'10000000000000002',world,objects:[{id:'301',objectPath:world+':PersistentLevel.TestBox',transform:original}]};
const change={id:'301',position:[10,20,30],rotation:[0,0,90],scale:[2,3,4]};
const clone=x=>JSON.parse(JSON.stringify(x));
const arg=(Name,Type)=>({Name,Type,MetaData:{}});
const Functions=[
 {Name:'K2_SetActorLocationAndRotation',Arguments:[arg('NewLocation','FVector'),arg('NewRotation','FRotator'),arg('bSweep','bool'),arg('bTeleport','bool')]},
 {Name:'SetActorScale3D',Arguments:[arg('NewScale3D','FVector')]},
 {Name:'SavePlaceableActorAllEditorData',Arguments:[arg('SceneID','int32')]}
];
function fixture(t,settings={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ymzx-scene-test-'));
 t.after(()=>{assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert(path.basename(dir).startsWith('ymzx-scene-test-'));fs.rmSync(dir,{recursive:true,force:true});});
 const calls=[];
 return {dir,calls,options:{
  journalDirectory:dir,
  capture:async()=>clone(settings.baseline||baseline),
  describe:async()=>({status:200,data:{Functions:settings.functions||Functions}}),
  currentMap:async()=>settings.currentMap||baseline.mapId,
  readActor:async()=>({id:'301',transform:clone(calls.length===3?target:original)}),
  invoke:async call=>{calls.push(clone(call));return settings.rejectScale&&call.functionName==='SetActorScale3D'?{status:400,data:{errorMessage:'Rejected'}}:{status:200,data:{}};}
 }};
}
test('generic scene plan preserves exact map identity and has no dedicated-map sentinel IDs',()=>{
 const plan=makeScenePlan(baseline,[change]);assert.equal(plan.mapId,'10000000000000002');assert.equal(plan.edits[0].expected.id,'301');
 assert.deepEqual(plan.edits[0].expected.transform,original);assert.deepEqual(baseline.objects[0].transform,original);
 for(const bad of [[{...change,id:'0'}],[{...change,id:'-99'}],[change,change],[{...change,position:[NaN,0,0]}],[{...change,scale:[-1,1,1]}]])assert.throws(()=>validateSceneChanges(bad));
 assert.throws(()=>makeScenePlan({...baseline,mapId:Number(baseline.mapId)},[change]),/Exact map ID/);
 assert.throws(()=>makeScenePlan(baseline,[{...change,id:'999'}]),/missing or ambiguous/);
});
test('map switches, changed transforms and missing signatures prevent every mutation',async t=>{
 for(const [settings,pattern] of [
  [{baseline:{...baseline,mapId:'10000000000000003'}},/map or world changed/],
  [{baseline:{...baseline,objects:[{...baseline.objects[0],transform:target}]}},/Actor changed since inspection/],
  [{functions:Functions.slice(1)},/schema is absent/]
 ]){
  const f=fixture(t,settings);await assert.rejects(applyScenePlan(makeScenePlan(baseline,[change]),f.options),pattern);assert.equal(f.calls.length,0);assert.deepEqual(fs.readdirSync(f.dir),[]);
 }
});
test('successful edits synchronize the selected actor and retain originals in a one-use journal',async t=>{
 const f=fixture(t),plan=makeScenePlan(baseline,[change]);const result=await applyScenePlan(plan,f.options);
 assert.equal(result.liveVerified,true);assert.equal(result.mapSaved,false);assert.equal(result.reopened,false);assert.equal(f.calls.length,3);
 assert.equal(f.calls[2].functionName,'SavePlaceableActorAllEditorData');assert.deepEqual(f.calls[2].parameters,{SceneID:301});
 const report=JSON.parse(fs.readFileSync(result.file));assert.equal(report.state,'verified');assert.deepEqual(report.plan.edits[0].expected.transform,original);assert.equal(report.readback[0].matches,true);
 await assert.rejects(applyScenePlan(plan,f.options),/EEXIST/);assert.equal(f.calls.length,3);
});
test('a rejected native stage stops later calls and journals the partial result',async t=>{
 const f=fixture(t,{rejectScale:true}),plan=makeScenePlan(baseline,[change]);
 await assert.rejects(applyScenePlan(plan,f.options),/Native edit rejected.*journal/);
 assert.equal(f.calls.length,2);assert(!f.calls.some(c=>c.functionName==='SavePlaceableActorAllEditorData'));
 const report=JSON.parse(fs.readFileSync(path.join(f.dir,fs.readdirSync(f.dir)[0])));assert.equal(report.state,'failed');assert.equal(report.liveVerified,false);assert.equal(report.calls[1].status,400);assert.deepEqual(report.plan.edits[0].expected.transform,original);
 await assert.rejects(applyScenePlan(plan,f.options),/EEXIST/);assert.equal(f.calls.length,2);
});
test('an identity change after preparation stops before touching the actor',async t=>{
 const f=fixture(t,{currentMap:'10000000000000003'});
 await assert.rejects(applyScenePlan(makeScenePlan(baseline,[change]),f.options),/Map changed during apply/);assert.equal(f.calls.length,0);
 const report=JSON.parse(fs.readFileSync(path.join(f.dir,fs.readdirSync(f.dir)[0])));assert.equal(report.state,'failed');
});
