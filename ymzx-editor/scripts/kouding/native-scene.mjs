// Map-scoped editing of existing, registered scene actors. Creation and full-map
// saving use different editor operations and are never implied by this command.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {read} from './editor-client.mjs';
import {root} from './kouding-read-bridge.mjs';
import {snapshot} from './native-scene-snapshot.mjs';
import {query} from './native-remote-read.mjs';
import {getter} from './native-remote-getters.mjs';
import {validateNativeArguments} from './native-reflection-validation.mjs';
import {parseNativeJson} from './native-json.mjs';
const library='/Script/MoeGameCore.Default__MoeBlueprintLibrary';
const clone=value=>JSON.parse(JSON.stringify(value));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function mapIdentity(value){
 if(typeof value!=='string'||!/^\d{1,32}$/.test(value))throw Error('Exact map ID string required');
 return value;
}
export async function captureScene(expectedMapId){
 if(expectedMapId!==undefined)mapIdentity(expectedMapId);
 const before=await read('GetAllActorCount');const mapId=mapIdentity(before.mapID);
 if(expectedMapId!==undefined&&mapId!==expectedMapId)throw Error('Current map differs from requested map');
 const scene=await snapshot();
 if(!scene.world.endsWith('LetsGo_Level_UGCEditor'))throw Error('Scene editing requires the editor world');
 const after=await read('GetAllActorCount');
 if(after.mapID!==mapId)throw Error('Map changed during scene inspection');
 return {...scene,mapId,referenceActorCount:after.count};
}
export function validateSceneChanges(changes){
 if(!Array.isArray(changes)||changes.length<1||changes.length>100)throw Error('Use 1..100 actor changes');
 const ids=new Set();
 for(const change of changes){
  if(!change||Object.keys(change).sort().join()!=='id,position,rotation,scale'||typeof change.id!=='string'||!/^\d{1,10}$/.test(change.id)||Number(change.id)<1||Number(change.id)>2147483647||ids.has(change.id))throw Error('Unique positive registered scene IDs and exact fields required');
  ids.add(change.id);
  for(const [field,limit] of [['position',100000],['rotation',360],['scale',150]])if(!Array.isArray(change[field])||change[field].length!==3||change[field].some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>limit||(field==='scale'&&v<=0)))throw Error('Invalid actor '+field);
 }
 return changes;
}
function validPose(pose){
 return !!pose&&['Translation','Scale3D','Rotation'].every(key=>pose[key]&&['X','Y','Z',...(key==='Rotation'?['W']:[])].every(axis=>typeof pose[key][axis]==='number'&&Number.isFinite(pose[key][axis])));
}
export function makeScenePlan(baseline,changes){
 validateSceneChanges(changes);mapIdentity(baseline?.mapId);
 if(baseline.readOnly!==true||typeof baseline.world!=='string'||!baseline.world.endsWith('LetsGo_Level_UGCEditor')||!Array.isArray(baseline.objects))throw Error('Current editor snapshot with map identity required');
 const edits=changes.map(change=>{
  const matches=baseline.objects.filter(o=>o.id===change.id);
  if(matches.length!==1)throw Error('Actor missing or ambiguous in baseline: '+change.id);
  const expected=matches[0];
  if(typeof expected.objectPath!=='string'||!expected.objectPath.startsWith(baseline.world+':PersistentLevel.')||!validPose(expected.transform))throw Error('Invalid baseline actor');
  return {expected:clone(expected),change:clone(change)};
 });
 return {version:2,planId:randomUUID(),preparedAt:new Date().toISOString(),mapId:baseline.mapId,world:baseline.world,edits};
}
export function scenePoseMatches(pose,change){
 if(!validPose(pose))return false;
 const [roll,pitch,yaw]=change.rotation.map(n=>n*Math.PI/180);
 const cy=Math.cos(yaw/2),sy=Math.sin(yaw/2),cp=Math.cos(pitch/2),sp=Math.sin(pitch/2),cr=Math.cos(roll/2),sr=Math.sin(roll/2);
 const q={X:cr*sp*sy-sr*cp*cy,Y:-cr*sp*cy-sr*cp*sy,Z:cr*cp*sy-sr*sp*cy,W:cr*cp*cy+sr*sp*sy};
 const dot=Math.abs(['X','Y','Z','W'].reduce((n,k)=>n+q[k]*pose.Rotation[k],0));
 return ['X','Y','Z'].every((axis,i)=>Math.abs(pose.Translation[axis]-change.position[i])<=.05&&Math.abs(pose.Scale3D[axis]-change.scale[i])<=.001)&&Math.abs(dot-1)<=.00001;
}
function callsFor(edit){const c=edit.change;return [
 {objectPath:edit.expected.objectPath,functionName:'K2_SetActorLocationAndRotation',parameters:{NewLocation:{X:c.position[0],Y:c.position[1],Z:c.position[2]},NewRotation:{Roll:c.rotation[0],Pitch:c.rotation[1],Yaw:c.rotation[2]},bSweep:false,bTeleport:true}},
 {objectPath:edit.expected.objectPath,functionName:'SetActorScale3D',parameters:{NewScale3D:{X:c.scale[0],Y:c.scale[1],Z:c.scale[2]}}},
 {objectPath:library,functionName:'SavePlaceableActorAllEditorData',parameters:{SceneID:Number(c.id)}}
 ];}
async function invokeNative(call){
 const r=await fetch('http://127.0.0.1:30010/remote/object/call',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...call,generateTransaction:true}),signal:AbortSignal.timeout(15000)});
 return {status:r.status,data:parseNativeJson(await r.text())};
}
async function readActor(objectPath){
 const identity=await query('/remote/object/property',{objectPath,propertyName:'UniqueSceneID',access:'READ_ACCESS'});
 const transform=await getter(objectPath,'GetTransform');
 if(identity.status!==200||transform.status!==200)throw Error('Actor readback failed');
 return {id:String(identity.data.UniqueSceneID),transform:transform.data.ReturnValue};
}
export async function applyScenePlan(plan,options={}){
 const capture=options.capture||captureScene,describe=options.describe||(async objectPath=>query('/remote/object/describe',{objectPath})),invoke=options.invoke||invokeNative,readback=options.readActor||readActor;
 if(plan?.version!==2||typeof plan.planId!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(plan.planId)||!Array.isArray(plan.edits))throw Error('Invalid scene plan');
 mapIdentity(plan.mapId);validateSceneChanges(plan.edits.map(e=>e.change));
 const current=await capture(plan.mapId);
 if(current.mapId!==plan.mapId||current.world!==plan.world)throw Error('Selected map or world changed; no mutation sent');
 for(const edit of plan.edits){
  if(edit.expected?.id!==edit.change.id||!validPose(edit.expected?.transform))throw Error('Plan actor identity mismatch');
  const found=current.objects.filter(o=>o.id===edit.expected.id);
  if(found.length!==1||found[0].objectPath!==edit.expected.objectPath||!same(found[0].transform,edit.expected.transform))throw Error('Actor changed since inspection; no mutation sent: '+edit.change.id);
 }
 const allCalls=plan.edits.flatMap(callsFor),schemas=new Map();
 for(const call of allCalls){
  if(!schemas.has(call.objectPath)){
   const schema=await describe(call.objectPath);if(schema.status!==200)throw Error('Native schema unavailable');schemas.set(call.objectPath,schema.data);
  }
  const fn=schemas.get(call.objectPath).Functions?.find(f=>f.Name===call.functionName);validateNativeArguments(fn,call.parameters);
 }
 const journalDirectory=options.journalDirectory||path.join(root,'evidence');fs.mkdirSync(journalDirectory,{recursive:true});
 const file=path.join(journalDirectory,'native-scene-plan-'+plan.planId+'.json');
 const report={requestedAt:new Date().toISOString(),plan:clone(plan),state:'prepared',liveVerified:false,mapSaved:false,reopened:false,calls:[],readback:[]};
 fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 const persist=()=>fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');
 try{
  for(const edit of plan.edits){
   // Check map identity again between actors; current actor is checked just
   // before touching it so concurrent user changes cannot be overwritten.
   const identity=options.currentMap?await options.currentMap():(await read('GetAllActorCount')).mapID;
   if(identity!==plan.mapId)throw Error('Map changed during apply; inspect journal before retrying');
   const fresh=await readback(edit.expected.objectPath);
   if(fresh.id!==edit.expected.id||!same(fresh.transform,edit.expected.transform))throw Error('Actor changed before write; inspect journal');
   if(!scenePoseMatches(fresh.transform,edit.change))for(const call of callsFor(edit)){
    const event={...clone(call),requestedAt:new Date().toISOString(),state:'requested'};report.calls.push(event);report.state='applying';persist();
    const result=await invoke(call);Object.assign(event,{state:'responded',...result});persist();
    if(result.status!==200||result.data?.ReturnValue===false)throw Error('Native edit rejected; inspect journal before retrying');
   }
   const actual=await readback(edit.expected.objectPath);const matches=actual.id===edit.change.id&&scenePoseMatches(actual.transform,edit.change);
   report.readback.push({id:edit.change.id,...actual,matches});persist();if(!matches)throw Error('Native actor readback mismatch');
  }
  const finalMap=options.currentMap?await options.currentMap():(await read('GetAllActorCount')).mapID;
  if(finalMap!==plan.mapId)throw Error('Map changed before final verification');
  report.state='verified';report.liveVerified=true;report.finishedAt=new Date().toISOString();persist();
  return {file,mapId:plan.mapId,actors:plan.edits.length,liveVerified:true,mapSaved:false,reopened:false,scope:'Registered actor transforms and native editor data only'};
 }catch(error){report.state='failed';report.error=error.message;persist();throw Error(error.message+'; journal: '+file);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [cmd,a,b,c]=process.argv.slice(2);const json=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
 try{
  if(cmd==='snapshot'){const result=await captureScene();if(a){fs.writeFileSync(a,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({file:a,mapId:result.mapId,actors:result.objects.length}));}else console.log(JSON.stringify(result,null,2));}
  else if(cmd==='prepare'&&a&&b&&c){const plan=makeScenePlan(json(a),json(b));fs.writeFileSync(c,JSON.stringify(plan,null,2)+'\n');console.log(JSON.stringify({file:c,mapId:plan.mapId,actors:plan.edits.length,writesPerformed:false}));}
  else if(cmd==='apply'&&a)console.log(JSON.stringify(await applyScenePlan(json(a)),null,2));
  else throw Error('Use snapshot [OUT], prepare BASELINE CHANGES PLAN, or apply PLAN');
 }catch(error){console.error(JSON.stringify({error:error.message}));process.exitCode=1;}
}
