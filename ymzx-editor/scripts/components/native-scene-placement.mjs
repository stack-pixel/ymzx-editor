// Native scene authoring through normal editor selection/copy/delete buttons.
// No Kouding, runtime spawning, map-cache writes, or host Computer Use.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {snapshot} from './native-scene-snapshot.mjs';
import {getter} from './native-remote-getters.mjs';
import {call} from './native-ui-call.mjs';
import {widgetRoots} from './native-ui-inspect.mjs';
import {liveRoot,tree,text} from './native-ui-author.mjs';
import {invokeButton} from './native-ui-delegate.mjs';

const lib='/Script/MoeGameCore.Default__MoeBlueprintLibrary';
const directory=path.dirname(fileURLToPath(import.meta.url));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const json=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
function journal(prefix,value){fs.mkdirSync('evidence',{recursive:true});const file=path.resolve('evidence',prefix+'-'+Date.now()+'.json');fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});return file;}
function save(file,value){fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');}
export function actorIn(scene,id){
 if(typeof id!=='string'||! /^[1-9]\d{0,9}$/.test(id)||Number(id)>2147483647||!scene.world?.endsWith('LetsGo_Level_UGCEditor'))throw Error('Positive scene ID in editor world required');
 const found=scene.objects.filter(a=>a.id===id);if(found.length!==1)throw Error('Actor missing or ambiguous');return found[0];
}
export function validatePlacements(changes,owned){
 if(!Array.isArray(changes)||changes.length<1||changes.length>20)throw Error('Use 1..20 placements');
 const ids=new Set();for(const c of changes){
  if(!c||Object.keys(c).sort().join()!=='id,position,rotation,scale'||!owned.includes(c.id)||ids.has(c.id))throw Error('Unique owned IDs and exact placement fields required');ids.add(c.id);
  for(const [key,bound] of [['position',100000],['rotation',360],['scale',150]])if(!Array.isArray(c[key])||c[key].length!==3||c[key].some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>bound||(key==='scale'&&v<=0)))throw Error('Invalid '+key);
 }return changes;
}
export function verifyOriginals(before,current){
 if(before.world!==current.world)throw Error('World changed');
 for(const old of before.objects){const now=current.objects.filter(x=>x.id===old.id);if(now.length!==1||now[0].objectPath!==old.objectPath||!equal(now[0].transform,old.transform))throw Error('Original actor changed or session reopened: '+old.id);}
}
export function windowPoint(capture,origin,screen){
 if(![capture.width,capture.height,capture.left,capture.top,capture.clientLeft,capture.clientTop,capture.clientWidth,capture.clientHeight,origin.X,origin.Y,screen.X,screen.Y].every(Number.isFinite)||Math.abs(origin.X-capture.clientLeft)>2||Math.abs(origin.Y-capture.clientTop)>2)throw Error('Viewport origin and physical capture differ');
 const x=screen.X+origin.X-capture.left,y=screen.Y+origin.Y-capture.top;
 if(screen.X<0||screen.Y<0||screen.X>=capture.clientWidth||screen.Y>=capture.clientHeight||x<0||x>=capture.width||y<30||y>=capture.height)throw Error('Projected point is outside current client');
 return {x:Math.round(x),y:Math.round(y)};
}
async function optionalRoot(pattern){const found=[];for(const p of (await widgetRoots(pattern)).widgets)if((await getter(p,'IsVisible')).data.ReturnValue)found.push(p);if(found.length>1)throw Error('Ambiguous editor mode');return found[0];}
async function selectionPanel(){
 let p=await optionalRoot('UI_UGCEditor_AdvanceSettingPanel_C_[0-9]+$');if(p)return p;
 const op=await liveRoot('UI_UGCOperate_C_[0-9]+$');await invokeButton(op+'.WidgetTree.UI_UGC_SwitcherButton_Advance.WidgetTree.w_btn_click');return liveRoot('UI_UGCEditor_AdvanceSettingPanel_C_[0-9]+$');
}
async function selected(expected){
 const p=await selectionPanel(),values=[];
 for(const x of [...new Set(await tree(p))].filter(x=>/InstanceInformation_Item_1\.WidgetTree\.w_txt_ID$/.test(x)))values.push(await text(x));
 if(values.length===0||values.some(x=>x!==expected))throw Error('Actual editor selection is not '+expected);
 return p;
}
async function closePanel(p){await invokeButton(p+'.WidgetTree.UI_UGC_FirstLevel_Container.WidgetTree.w_btn_Close',p);}
function powershell(script,args){const p=spawnSync('powershell',['-NoProfile','-File',path.join(directory,script),...args],{encoding:'utf8',windowsHide:true});if(p.status!==0)throw Error(p.stderr||p.stdout||'Local adapter failed');return JSON.parse(p.stdout.trim());}
export async function selectActor(id,mode='top',transport='observed-window'){
 if(transport!=='observed-window')throw Error('Observed input transport required');
 if(!['top','center','image-center','image-base'].includes(mode))throw Error('Observed top surface, center, image center or image base required');
 const before=await snapshot(),actor=actorIn(before,id);const open=await optionalRoot('UI_UGCEditor_AdvanceSettingPanel_C_[0-9]+$');
 if(open||await optionalRoot('UI_UGCOperate_C_[0-9]+$')){
  const panel=open||await selectionPanel(),values=[];for(const p of [...new Set(await tree(panel))].filter(p=>/InstanceInformation_Item_1\.WidgetTree\.w_txt_ID$/.test(p)))values.push(await text(p));
  await closePanel(panel);
  if(values.length&&values.every(value=>value===id)){const file=journal('scene-select',{at:new Date().toISOString(),actor,verified:true,method:'existing-editor-selection',selectedIds:values});return {file,id,objectPath:actor.objectPath,verified:true,method:'existing-editor-selection'};}
 }
 if(await optionalRoot('UI_UGCEditor_Copying_C_[0-9]+$'))throw Error('Finish copy mode before selecting');
 const bounds=(await getter(actor.objectPath,'GetActorBounds',{bOnlyCollidingComponents:false,bIncludeFromChildActors:true})).data;
 if(!bounds.Origin||!bounds.BoxExtent)throw Error('Bounds unavailable');
 const pc=(await call(lib,'GetFirstLocalPlayerController')).data.ReturnValue;
 let point3={X:bounds.Origin.X,Y:bounds.Origin.Y,Z:bounds.Origin.Z+bounds.BoxExtent.Z-Math.min(2,bounds.BoxExtent.Z)};
 if(mode==='center'){if(!/\.BP_PA_GE_(?:NoticeBoard_002_Color_A|TextDisplay_001_C)_C_\d+$/.test(actor.objectPath))throw Error('Center selection requires an observed sign class');point3=bounds.Origin;}
 if(mode==='image-center'){
  if(!/\.BP_PA_GE_ImageDisplayMesh_001_A_C_\d+$/.test(actor.objectPath))throw Error('Expected observed world-image class');
  const parts=(await call(actor.objectPath,'K2_GetComponentsByClass',{ComponentClass:'/Script/Engine.StaticMeshComponent'})).data.ReturnValue.filter(p=>p.endsWith('.StaticMesh'));
  if(parts.length!==1)throw Error('Image plane component missing or ambiguous');point3=(await call(parts[0],'K2_GetComponentLocation')).data.ReturnValue;
 }
 if(mode==='image-base'){
  if(!/\.BP_PA_GE_ImageDisplayMesh_001_A_C_\d+$/.test(actor.objectPath))throw Error('Expected observed world-image class');
  point3={...actor.transform.Translation,Z:actor.transform.Translation.Z+10*actor.transform.Scale3D.Z};
 }
 const projected=(await call(pc,'ProjectWorldLocationToScreen',{WorldLocation:point3,bPlayerViewportRelative:false})).data;
 if(!projected.ReturnValue)throw Error('Actor is outside camera');
 const origin=(await call(lib,'GetViewportAbsolutePosition')).data.ReturnValue;
 const captureFile=path.resolve('evidence','scene-select-'+Date.now()+'.png');fs.mkdirSync('evidence',{recursive:true});const capture=powershell('capture-game-window.ps1',['-OutputPath',captureFile]);const point=windowPoint(capture,origin,projected.ScreenLocation);
 const record={at:new Date().toISOString(),actor,origin,projected,capture,point,verified:false},file=journal('scene-select',record);
 record.input=powershell('observed-window-input.ps1',['-TargetProcessId',String(capture.processId),'-ExpectedProcessName','LetsGoClient-Win64-Shipping','-ExpectedWidth',String(capture.width),'-ExpectedHeight',String(capture.height),'-Action','click','-X',String(point.x),'-Y',String(point.y)]);save(file,record);
 for(let i=0;i<20;i++){if(await optionalRoot('UI_UGCOperate_C_[0-9]+$'))break;await pause(100);}
 const panel=await selected(id);const after=await snapshot();if(actorIn(after,id).objectPath!==actor.objectPath)throw Error('Actor session changed during selection');record.verified=true;save(file,record);await closePanel(panel);return {file,id,objectPath:actor.objectPath,verified:true};
}
export async function copySelected(id,count){
 if(!Number.isInteger(count)||count<1||count>20)throw Error('Use 1..20 copies');
 if(await optionalRoot('UI_UGCEditor_Copying_C_[0-9]+$'))throw Error('Copy mode is already active; inspect before retrying');
 const before=await snapshot(),seed=actorIn(before,id),panel=await selected(id);await closePanel(panel);
 const record={version:1,at:new Date().toISOString(),before,seed,requestedCount:count,created:[],calls:[],state:'prepared'},file=journal('scene-copy',record);
 const top=await liveRoot('UI_UGCEditor_ControlPanel_TopLeft_C_[0-9]+$');await invokeButton(top+'.WidgetTree.UI_UGC_SwitcherButton_copy.WidgetTree.w_btn_click');
 try{for(let i=0;i<count;i++){
  const current=await snapshot();verifyOriginals(before,current);if(current.objects.length!==before.objects.length+i)throw Error('Unexpected scene change during copying');
  const copying=await liveRoot('UI_UGCEditor_Copying_C_[0-9]+$');record.calls.push({at:new Date().toISOString(),operation:'normal-addOnce',state:'requested'});record.state='copying';save(file,record);await pause(250);await invokeButton(copying+'.WidgetTree.w_btn_addOnce');
  let after,delta;for(let j=0;j<20;j++){await pause(100);after=await snapshot();delta=after.objects.filter(x=>!current.objects.some(o=>o.id===x.id));if(delta.length)break;}
  verifyOriginals(current,after);if(delta?.length!==1||Number(delta[0].id)<=0||delta[0].objectPath.replace(/_\d+$/,'')!==seed.objectPath.replace(/_\d+$/,''))throw Error('Copy did not create exactly one registered actor of the seed class');
  record.created.push(delta[0]);record.calls.at(-1).state='verified';save(file,record);
 }record.state='verified';save(file,record);
 }catch(e){record.state='failed';record.error=e.message;save(file,record);throw Error(e.message+'; inspect '+file);
 }finally{if(await optionalRoot('UI_UGCEditor_Copying_C_[0-9]+$')){const t=await liveRoot('UI_UGCEditor_ControlPanel_TopLeft_C_[0-9]+$');await invokeButton(t+'.WidgetTree.UI_UGC_SwitcherButton_copy.WidgetTree.w_btn_click');}}
 return {file,created:record.created.map(x=>({id:x.id,objectPath:x.objectPath})),originalUnchanged:true,mapSaved:false};
}
export async function placeCopies(reportFile,changes){
 const owned=json(reportFile);if(owned.version!==1||owned.state!=='verified'||!Array.isArray(owned.created))throw Error('Verified copy journal required');validatePlacements(changes,owned.created.map(x=>x.id));
 const initial=await snapshot();verifyOriginals(owned.before,initial);for(const o of owned.created){const current=actorIn(initial,o.id);if(current.objectPath!==o.objectPath||!equal(current.transform,o.transform))throw Error('Copied actor changed or reopened; prepare a fresh experiment');}
 const record={at:new Date().toISOString(),copyReport:path.resolve(reportFile),changes,calls:[],state:'prepared',mapSaved:false},file=journal('scene-placement',record);const observed=new Map(initial.objects.map(x=>[x.id,x]));
 try{for(const c of changes){verifyOriginals(owned.before,await snapshot());const expected=observed.get(c.id),fresh=(await getter(expected.objectPath,'GetTransform')).data.ReturnValue;if(!equal(fresh,expected.transform))throw Error('Target transform changed');
  for(const x of [{p:expected.objectPath,f:'K2_SetActorLocationAndRotation',a:{NewLocation:{X:c.position[0],Y:c.position[1],Z:c.position[2]},NewRotation:{Roll:c.rotation[0],Pitch:c.rotation[1],Yaw:c.rotation[2]},bSweep:false,bTeleport:true}},{p:expected.objectPath,f:'SetActorScale3D',a:{NewScale3D:{X:c.scale[0],Y:c.scale[1],Z:c.scale[2]}}},{p:lib,f:'SavePlaceableActorAllEditorData',a:{SceneID:Number(c.id)}}]){
   const e={...x,state:'requested'};record.calls.push(e);record.state='applying';save(file,record);e.result=await call(x.p,x.f,x.a);e.state='responded';save(file,record);if(e.result.data.ReturnValue===false)throw Error('Native edit rejected');
  }
  const location=(await getter(expected.objectPath,'K2_GetActorLocation')).data.ReturnValue,rotation=(await getter(expected.objectPath,'K2_GetActorRotation')).data.ReturnValue,scale=(await getter(expected.objectPath,'GetActorScale3D')).data.ReturnValue;
  if(!['X','Y','Z'].every((k,i)=>Math.abs(location[k]-c.position[i])<.05&&Math.abs(scale[k]-c.scale[i])<.001)||!['Roll','Pitch','Yaw'].every((k,i)=>Math.abs(((rotation[k]-c.rotation[i]+540)%360)-180)<.05))throw Error('Placement readback mismatch');
 }verifyOriginals(owned.before,await snapshot());record.state='verified';record.after=await snapshot();save(file,record);return {file,liveVerified:true,actors:changes.length,mapSaved:false,reopened:false};
 }catch(e){record.state='failed';record.error=e.message;save(file,record);throw Error(e.message+'; inspect '+file);}
}
export async function deleteSelected(expectedPath){
 const before=await snapshot(),target=before.objects.find(a=>a.objectPath===expectedPath);if(!target)throw Error('Exact current actor path required');actorIn(before,target.id);const panel=await selected(target.id);await closePanel(panel);
 const op=await liveRoot('UI_UGCOperate_C_[0-9]+$');const buttons=[...new Set(await tree(op))].filter(p=>/\.w_btn_delete$|Delete.*w_btn_click$|delete.*w_btn_click$/.test(p));if(buttons.length!==1)throw Error('Normal delete button is missing or ambiguous');
 const record={at:new Date().toISOString(),target,before,state:'requested'},file=journal('scene-delete',record);await invokeButton(buttons[0]);await pause(150);const after=await snapshot();if(after.objects.some(a=>a.id===target.id)||after.objects.length!==before.objects.length-1)throw Error('Deletion not verified; inspect '+file);
 verifyOriginals({...before,objects:before.objects.filter(a=>a.id!==target.id)},after);record.after=after;record.state='verified';save(file,record);return {file,id:target.id,deleted:true,mapSaved:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{if(process.env.YMZX_STATE_DIR)process.chdir(process.env.YMZX_STATE_DIR);const [cmd,a,b]=process.argv.slice(2);let result;
  if(cmd==='select')result=await selectActor(a,b);else if(cmd==='copy')result=await copySelected(a,Number(b));else if(cmd==='place')result=await placeCopies(a,json(b));else if(cmd==='delete-selected')result=await deleteSelected(a);else throw Error('Use select ID [image-center], copy SELECTED_ID COUNT, place COPY_REPORT CHANGES_JSON, delete-selected EXACT_CURRENT_ACTOR_PATH');console.log(JSON.stringify(result,null,2));
 }catch(e){console.error(JSON.stringify({error:e.message}));process.exitCode=1;}
}
