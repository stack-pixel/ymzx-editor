import fs from 'node:fs';
import {query} from './native-remote-read.mjs';
import {validateNativeArguments} from './native-reflection-validation.mjs';
import {parseNativeJson} from './native-json.mjs';
const library='/Script/MoeGameCore.Default__MoeBlueprintLibrary';
const allowed=new Set(['GetCurWorld','GetLetsGoGameInstance','GetLevelAllPlaceableActor','GetTransform','K2_GetActorLocation','K2_GetActorRotation','GetActorScale3D','GetAllActorsOfClass','GetGameInstance','GetGameMode','GetGameState','GetActorBounds','GetActorBySceneID','GetPlaceableActorRowTransformBySceneId','GetFolderFiles']);
for(const name of ['GetPakDirectories','GetPakDirFiles','GetSearchPaths','GetAllWidgetsOfClass'])allowed.add(name);
for(const name of ['FindAllWidgetsRecursive','FindAllWidgetsByClassReceive','FindAllWidgetsByClass','GetWidgetScreenPosition','GetWidgetLocSize','GetVisibility','IsVisible','GetIsEnabled','GetText','GetAccessibleText'])allowed.add(name);
allowed.add('GetDataFlowManager');
allowed.add('GetCurrentLogFilePath');
allowed.add('GetPropertyNames');
allowed.add('IsDragDropping');
for(const name of ['GetListItems','GetNumItems','GetItemAt','GetDisplayedEntryWidgets'])allowed.add(name);
for(const name of ['GetGameUID','GetOwnerGameUID','GetMapType','GetSceneID','GetPlaceableID','GetPlaceableActorTypeIdFromCpp','GetPlaceableActorIdFromCpp'])allowed.add(name);
for(const name of ['IsInViewport','GetParent','GetCachedGeometry','GetViewportSize','GetViewportScale','GetWidgetLocSize'])allowed.add(name);
for(const name of ['HasKeyboardFocus','HasAnyUserFocus','HasFocusedDescendants'])allowed.add(name);
export async function getter(objectPath,functionName,parameters={}){
 if(functionName==='ReadStringFromFile'){
  if(objectPath!=='/Script/TBUMCPBridge.Default__CSVibeFileUtils'||Object.keys(parameters).join()!=='Path'||!/^\.\.\/\.\.\/\.\.\/LetsGo\/Content\/(LetsGo|Feature|CSVibe)\/[A-Za-z0-9_/-]+\.lua$/.test(parameters.Path))throw Error('Read only installed editor Lua source');
 }else
 if(!allowed.has(functionName))throw Error('Read-only getter not allowed');
 const schema=await query('/remote/object/describe',{objectPath});
 const fn=schema.data?.Functions?.find(f=>f.Name===functionName);
 if(schema.status!==200||!fn)throw Error('Getter absent from native schema');
 validateNativeArguments(fn,parameters);
 const r=await fetch('http://127.0.0.1:30010/remote/object/call',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({objectPath,functionName,parameters,generateTransaction:false}),signal:AbortSignal.timeout(15000)});
 const data=parseNativeJson(await r.text());return {status:r.status,data};
}
if(process.argv[1]?.endsWith('native-remote-getters.mjs')){
 const fn=process.argv[2],objectPath=process.argv[3]||library;
 const parameters=process.argv[4]?JSON.parse(process.argv[4]):{};
 const result=await getter(objectPath,fn,parameters);
 const file='evidence/native-remote-getter-'+fn+'.json';fs.writeFileSync(file,JSON.stringify({capturedAt:new Date().toISOString(),objectPath,functionName:fn,parameters,...result},null,2));
 const arrays=Object.fromEntries(Object.entries(result.data||{}).map(([k,v])=>[k,Array.isArray(v)?{count:v.length,first:v.slice(0,8)}:v]));
 console.log(JSON.stringify({file,status:result.status,data:arrays},null,2));
}
