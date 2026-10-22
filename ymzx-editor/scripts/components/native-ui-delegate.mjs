// Invoke an existing visible UButton delegate through the game's native API.
// No OS pointer, keyboard, synthetic pointer event, or coordinate input is sent.
import fs from 'node:fs';
import {query} from './native-remote-read.mjs';
import {getter} from './native-remote-getters.mjs';
import {validateNativeArguments} from './native-reflection-validation.mjs';
import {widgetRoots} from './native-ui-inspect.mjs';
export async function invokeButton(objectPath,geometryOwner){
 if(typeof objectPath!=='string'||!objectPath.startsWith('/Engine/Transient.'))throw Error('Current session UI button required');
 const schema=await query('/remote/object/describe',{objectPath});
 if(schema.status!==200||schema.data.Class!=='/Script/UMG.Button'||!schema.data.Functions?.some(f=>f.Name==='SetIsEnabled'))throw Error('Live UMG.Button required; a name or SetIsEnabled alone does not prove button type');
 let root=geometryOwner??objectPath.split('.WidgetTree.')[0];
 if(geometryOwner&&!(await widgetRoots()).widgets.includes(geometryOwner))throw Error('Explicit geometry owner is absent from current session');
 const rs=await query('/remote/object/describe',{objectPath:root});
 if(!rs.data.Functions?.some(f=>f.Name==='GetWidgetLocSize')){
  const candidates=(await widgetRoots('UI_UGC_UIEditor_C_[0-9]+$')).widgets;
  if(candidates.length!==1)throw Error('No current geometry owner');root=candidates[0];
 }
 const [visible,enabled,size]=await Promise.all([getter(objectPath,'IsVisible'),getter(objectPath,'GetIsEnabled'),getter(root,'GetWidgetLocSize',{Widget:objectPath})]);
 if(!visible.data.ReturnValue||!enabled.data.ReturnValue||!(size.data.ReturnValue?.X>0&&size.data.ReturnValue?.Y>0))throw Error('Button is hidden, disabled or has no rendered area');
 const library='/Script/MoeGameCore.Default__MoeBlueprintLibrary',s=await query('/remote/object/describe',{objectPath:library});
 const fn=s.data.Functions.find(f=>f.Name==='TriggerButtonClicked'),parameters={Button:objectPath};validateNativeArguments(fn,parameters);
 const file='evidence/ui-delegate-'+Date.now()+'.json',record={at:new Date().toISOString(),objectPath,class:schema.data.Class,visible:visible.data.ReturnValue,enabled:enabled.data.ReturnValue,size:size.data.ReturnValue,operation:fn.Name,dispatched:false};
 fs.writeFileSync(file,JSON.stringify(record,null,2),{flag:'wx'});
 const r=await fetch('http://127.0.0.1:30010/remote/object/call',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({objectPath:library,functionName:fn.Name,parameters,generateTransaction:false}),signal:AbortSignal.timeout(10000)});
 record.status=r.status;record.response=await r.json();record.dispatched=r.ok;fs.writeFileSync(file,JSON.stringify(record,null,2));
 if(!r.ok)throw Error('Native button delegate rejected; inspect '+file);
 return {file,...record};
}
if(process.argv[1]?.endsWith('native-ui-delegate.mjs'))console.log(JSON.stringify(await invokeButton(process.argv[2]),null,2));
