// Read the live scene directly through Unreal Remote Control. No UI or writes.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getter} from './native-remote-getters.mjs';
import {query} from './native-remote-read.mjs';
import {parseNativeJson} from './native-json.mjs';
const library='/Script/MoeGameCore.Default__MoeBlueprintLibrary';
export async function readBatch(requests){
 if(!Array.isArray(requests)||requests.length<1||requests.length>30)throw Error('Bounded read batch required');
 const ids=new Set();
 for(const r of requests){
  if(r.Verb!=='PUT'||typeof r.Body?.objectPath!=='string'||!r.Body.objectPath.startsWith('/')||!Number.isSafeInteger(r.RequestId)||ids.has(r.RequestId))throw Error('Invalid read request');
  ids.add(r.RequestId);
  if(r.URL==='/remote/object/property'){
   if(r.Body.access!=='READ_ACCESS'||Object.keys(r.Body).some(k=>!['objectPath','propertyName','access'].includes(k)))throw Error('Read-only properties required');
  }else if(r.URL==='/remote/object/call'){
   if(r.Body.functionName!=='GetTransform'||Object.keys(r.Body.parameters||{}).length||r.Body.generateTransaction!==false)throw Error('Read-only transform getter required');
  }else throw Error('Read-only batch route required');
 }
 const res=await fetch('http://127.0.0.1:30010/remote/batch',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({Requests:requests}),signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw Error('Native batch HTTP '+res.status);
 const result=parseNativeJson(await res.text());
 if(!Array.isArray(result.Responses)||result.Responses.length!==requests.length)throw Error('Incomplete native read batch');
 const returned=new Set();
 for(const row of result.Responses){
  if(row.ResponseCode!==200||!ids.has(row.RequestId)||returned.has(row.RequestId)||!row.ResponseBody||typeof row.ResponseBody!=='object')throw Error('Invalid native read response');
  returned.add(row.RequestId);
 }
 return result;
}
export async function snapshot(){
 const w=await getter(library,'GetCurWorld'),a=await getter(library,'GetLevelAllPlaceableActor');
 if(w.status!==200||a.status!==200||!Array.isArray(a.data.ReturnValue))throw Error('Live scene enumeration failed');
 const actors=a.data.ReturnValue;
 if(typeof w.data.ReturnValue!=='string'||actors.some(p=>typeof p!=='string'||!p.startsWith(w.data.ReturnValue+':PersistentLevel.'))||new Set(actors).size!==actors.length)throw Error('Actor enumeration does not match current world');
 if(actors.length){
  const schema=await query('/remote/object/describe',{objectPath:actors[0]});
  if(schema.status!==200||!schema.data.Functions?.some(f=>f.Name==='GetTransform'&&f.Arguments.length===0))throw Error('Unexpected transform schema');
 }
 const results=[];
 for(let i=0;i<actors.length;i+=15){
  const requests=actors.slice(i,i+15).flatMap((objectPath,k)=>[
   {RequestId:(i+k)*2,URL:'/remote/object/property',Verb:'PUT',Body:{objectPath,propertyName:'UniqueSceneID',access:'READ_ACCESS'}},
   {RequestId:(i+k)*2+1,URL:'/remote/object/call',Verb:'PUT',Body:{objectPath,functionName:'GetTransform',parameters:{},generateTransaction:false}}
  ]);
  const batch=await readBatch(requests);if(!Array.isArray(batch.Responses)||batch.Responses.some(r=>r.ResponseCode!==200))throw Error('Incomplete native read batch');results.push(...batch.Responses);
 }
 const byId=new Map(results.map(r=>[r.RequestId,r.ResponseBody]));
 const objects=actors.map((objectPath,i)=>{
  const id=byId.get(i*2).UniqueSceneID,transform=byId.get(i*2+1).ReturnValue;
  if(!Number.isInteger(id)||id< -2147483648||id>2147483647||!transform||!['Translation','Scale3D','Rotation'].every(key=>transform[key]&&['X','Y','Z',...(key==='Rotation'?['W']:[])].every(axis=>typeof transform[key][axis]==='number'&&Number.isFinite(transform[key][axis]))))throw Error('Malformed actor identity or transform at '+objectPath);
  return {objectPath,id:String(id),transform};
 });
 const after=await getter(library,'GetCurWorld');
 if(after.status!==200||after.data.ReturnValue!==w.data.ReturnValue)throw Error('World changed during scene inspection');
 return {capturedAt:new Date().toISOString(),world:w.data.ReturnValue,readOnly:true,objects};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const scene=await snapshot();const file=process.argv[2]||'evidence/native-live-scene-snapshot.json';fs.writeFileSync(file,JSON.stringify(scene,null,2));
 console.log(JSON.stringify({file,world:scene.world,count:scene.objects.length},null,2));
}
