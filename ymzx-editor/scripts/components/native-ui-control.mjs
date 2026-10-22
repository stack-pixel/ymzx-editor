// Drive observed native editor widgets through normal guarded Windows input.
// Native UObject identities and live geometry replace fixed screen coordinates.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {stateRoot} from '../common/state.mjs';
import {widgetRoots} from './native-ui-inspect.mjs';
import {getter} from './native-remote-getters.mjs';
import {query} from './native-remote-read.mjs';
import {nativeTextValue} from './native-text.mjs';
const run=promisify(execFile),scriptDir=path.dirname(fileURLToPath(import.meta.url));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function windowPoint(center,window){
 if(!center||!window||![center.X,center.Y,window.left,window.top,window.width,window.height,window.clientLeft,window.clientTop,window.clientWidth,window.clientHeight].every(Number.isFinite)||window.clientWidth<=0||window.clientHeight<=0)throw Error('Valid native center and window geometry required');
 const x=Math.round(center.X-window.left),y=Math.round(center.Y-window.top);
 const minX=window.clientLeft-window.left,minY=window.clientTop-window.top;
 if(minX<0||minY<0||minX+window.clientWidth>window.width||minY+window.clientHeight>window.height||x<minX||y<minY||x>=minX+window.clientWidth||y>=minY+window.clientHeight)throw Error('Native widget center is outside the inspected game client');
 return {x,y};
}
async function observe(root,selector){
 const current=await widgetRoots();if(!current.widgets.includes(root))throw Error('Root is absent from the current session');
 const tree=await getter(root,'FindAllWidgetsRecursive',{Root:root});if(tree.status!==200||!Array.isArray(tree.data.ReturnValue))throw Error('Cannot read current widget tree');
 const found=[...new Set([root,...tree.data.ReturnValue])].filter(p=>selector.startsWith('/')?p===selector:p.split('.').at(-1)===selector);
 if(found.length!==1)throw Error('Widget selector is missing or ambiguous; inspect the tree');
 const objectPath=found[0],schema=await query('/remote/object/describe',{objectPath});if(schema.status!==200)throw Error('Widget disappeared');
 const visible=await getter(objectPath,'IsVisible'),enabled=await getter(objectPath,'GetIsEnabled');
 const size=await getter(root,'GetWidgetLocSize',{Widget:objectPath}),position=await getter(root,'GetWidgetScreenPosition',{Widget:objectPath});
 if(visible.status!==200||visible.data.ReturnValue!==true||enabled.status!==200||enabled.data.ReturnValue!==true||size.status!==200||!(size.data.ReturnValue?.X>0&&size.data.ReturnValue?.Y>0)||position.status!==200)throw Error('Widget is hidden, disabled or has no rendered area');
 const text=schema.data.Functions.some(f=>f.Name==='GetText'&&f.Arguments.length===0)?await getter(objectPath,'GetText'):null;
 return {world:current.world,root,objectPath,class:schema.data.Class,functions:schema.data.Functions,center:position.data.ReturnValue,size:size.data.ReturnValue,text:text?.status===200?nativeTextValue(text.data.ReturnValue):null};
}
async function capture(file){
 const result=await run('powershell',['-NoProfile','-File',path.join(scriptDir,'capture-game-window.ps1'),'-OutputPath',file],{windowsHide:true,timeout:15000});
 const value=JSON.parse(result.stdout.trim());if(value.processName!=='LetsGoClient-Win64-Shipping')throw Error('Capture is not the game client');return value;
}
async function input(window,action,point={},value='',destination){
 const args=['-NoProfile','-File',path.join(scriptDir,'observed-window-input.ps1'),'-TargetProcessId',String(window.processId),'-ExpectedProcessName',window.processName,'-ExpectedWidth',String(window.width),'-ExpectedHeight',String(window.height),'-Action',action];
 if(action==='click'||action==='drag')args.push('-X',String(point.x),'-Y',String(point.y));
 if(action==='drag')args.push('-ToX',String(destination.x),'-ToY',String(destination.y));
 if(action==='key'||action==='text')args.push('-Value',value);
 const result=await run('powershell',args,{windowsHide:true,timeout:30000,maxBuffer:200000});return JSON.parse(result.stdout.trim());
}
export async function controlWidget(action,root,selector,value,{resolveAfter}={}){
 if(!['click','fill','drag'].includes(action)||typeof root!=='string'||!root.startsWith('/')||typeof selector!=='string'||!selector||selector.length>4096)throw Error('Expected a live widget selector and click/fill/drag action');
 if(action==='fill'&&(typeof value!=='string'||value.length>4096||/[\x00\r\n]/.test(value)))throw Error('Single-line text value required');
 if(action==='drag'&&(!value||![value.x,value.y].every(Number.isFinite)))throw Error('Inspected destination point required');
 const before=await observe(root,selector);
 if(action==='fill'&&(!/EditableText/.test(before.class)||before.text===null))throw Error('Fill requires an editable text widget with readback');
 const directory=path.join(stateRoot(),'evidence');fs.mkdirSync(directory,{recursive:true});const id=randomUUID(),file=path.join(directory,'ui-control-'+id+'.json');
 const report={startedAt:new Date().toISOString(),action,before:{...before,functions:undefined},requestedValue:value,state:'prepared',verified:false,inputs:[]};
 const persist=()=>fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');
 fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 try{
  const window=await capture(path.join(directory,'ui-control-'+id+'-before.png'));report.window=window;
  const fresh=await observe(root,before.objectPath);if(fresh.world!==before.world)throw Error('World changed before UI action');
  const point=windowPoint(fresh.center,window);
  report.inputs.push({action:action==='drag'?'drag':'click',point,destination:action==='drag'?value:undefined,state:'requested'});persist();
  report.inputs.at(-1).result=await input(window,action==='drag'?'drag':'click',point,'',value);persist();
  if(action==='fill'){
   await wait(200);
   const methods=fresh.functions.filter(f=>['HasKeyboardFocus','HasAnyUserFocus','HasFocusedDescendants'].includes(f.Name)&&f.Arguments.length===0);
   let focused=false;for(const method of methods){const f=await getter(fresh.objectPath,method.Name);if(f.status===200&&f.data.ReturnValue===true)focused=true;}
   if(!focused)throw Error('Editable widget did not receive keyboard focus; text not sent');
   for(const [kind,text] of [['key','^a'],['text',value],['key','{ENTER}']]){
    report.inputs.push({action:kind,state:'requested'});persist();report.inputs.at(-1).result=await input(window,kind,{},text);persist();
   }
   // Enter can already release focus (e.g. the object search). Sending Tab in
   // that state invokes editor shortcuts and can hide the whole object bag.
   let stillFocused=false;for(const method of methods){const f=await getter(fresh.objectPath,method.Name);if(f.status===200&&f.data.ReturnValue===true)stillFocused=true;}
   if(stillFocused){report.inputs.push({action:'key',state:'requested'});persist();report.inputs.at(-1).result=await input(window,'key',{},'{TAB}');persist();}
   await wait(150);const resolved=resolveAfter?await resolveAfter():null;const after=await observe(resolved?.root||root,resolved?.selector||fresh.objectPath);report.after={...after,functions:undefined};
   if(after.world!==fresh.world||after.text!==value)throw Error('Editable text readback differs; inspect UI before retrying');
   report.verified=true;
  }
  await wait(350);
  report.afterCapture=await capture(path.join(directory,'ui-control-'+id+'-after.png'));report.state='completed';report.finishedAt=new Date().toISOString();persist();
  return {file,action,objectPath:before.objectPath,verified:report.verified,scope:action==='fill'?'Editable text readback; associated editor data and persistence require separate validation':'Input sent; resulting editor operation requires separate validation'};
 }catch(error){report.state='failed';report.error=error.message;persist();throw Error(error.message+'; journal: '+file);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [action,root,selector,a,b]=process.argv.slice(2);
 try{console.log(JSON.stringify(await controlWidget(action,root,selector,action==='drag'?{x:Number(a),y:Number(b)}:a),null,2));}
 catch(error){console.error(JSON.stringify({error:error.message}));process.exitCode=1;}
}
