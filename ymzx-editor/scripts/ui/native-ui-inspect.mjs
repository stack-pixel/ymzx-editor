// Current-session UI inspection. All calls are reads and require live object
// identities. No cached process paths or fixed window coordinates are reused.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getter} from './native-remote-getters.mjs';
import {query} from './native-remote-read.mjs';
import {nativeTextValue} from './native-text.mjs';
const library='/Script/MoeGameCore.Default__MoeBlueprintLibrary';
function patternFor(value='') {
  if (typeof value!=='string'||value.length>180) throw Error('Bounded widget-name pattern required');
  return new RegExp(value,'i');
}
export async function widgetRoots(pattern='') {
  const re=patternFor(pattern);
  const world=await getter(library,'GetCurWorld');
  if(world.status!==200||typeof world.data.ReturnValue!=='string')throw Error('Current world could not be read');
  const result=await getter('/Script/UMG.Default__WidgetBlueprintLibrary','GetAllWidgetsOfClass',{
    WorldContextObject:world.data.ReturnValue,WidgetClass:'/Script/UMG.UserWidget',TopLevelOnly:false
  });
  if(result.status!==200||!Array.isArray(result.data.FoundWidgets))throw Error('Current widgets could not be enumerated');
  return {capturedAt:new Date().toISOString(),readOnly:true,world:world.data.ReturnValue,
    widgets:[...new Set(result.data.FoundWidgets)].filter(p=>typeof p==='string'&&re.test(p))};
}
export async function inspectWidgetTree(root,pattern='',limit=100) {
  const re=patternFor(pattern);
  if(typeof root!=='string'||!root.startsWith('/')||!Number.isInteger(limit)||limit<1||limit>300)throw Error('Live root path and bounded result limit required');
  const baseline=await widgetRoots();
  if(!baseline.widgets.includes(root))throw Error('Root is absent from current session; enumerate widgets again');
  const schema=await query('/remote/object/describe',{objectPath:root});
  if(schema.status!==200)throw Error('Widget root no longer exists');
  const descendants=await getter(root,'FindAllWidgetsRecursive',{Root:root});
  if(descendants.status!==200||!Array.isArray(descendants.data.ReturnValue))throw Error('Widget tree read failed: '+JSON.stringify(descendants.data));
  const paths=[...new Set([root,...descendants.data.ReturnValue])].filter(p=>typeof p==='string'&&re.test(p.split('.').at(-1)));
  if(paths.length>limit)throw Error('Widget match exceeds limit; narrow the name pattern');
  const widgets=[];
  for(const objectPath of paths){
    const s=await query('/remote/object/describe',{objectPath});
    if(s.status!==200)throw Error('Widget disappeared during inspection');
    const fields=s.data.Properties.filter(p=>['Text','Visibility','bIsEnabled','Slot','RenderTransform','ToolTipText'].includes(p.Name));
    const properties={};
    for(const f of fields){const r=await query('/remote/object/property',{objectPath,propertyName:f.Name,access:'READ_ACCESS'});if(r.status!==200)throw Error('Widget property read failed: '+f.Name);Object.assign(properties,r.data);}
    const geometry=await getter(root,'GetWidgetLocSize',{Widget:objectPath});
    if(geometry.status!==200)throw Error('Widget geometry read failed');
    const position=await getter(root,'GetWidgetScreenPosition',{Widget:objectPath});
    if(position.status!==200)throw Error('Widget screen position read failed');
    const state={};
    for(const method of ['GetVisibility','IsVisible','GetIsEnabled','GetText']){
      if(s.data.Functions.some(f=>f.Name===method&&f.Arguments.length===0)){
        const value=await getter(objectPath,method);
        state[method]={status:value.status,...value.data,...(method==='GetText'?{text:nativeTextValue(value.data.ReturnValue)}:{})};
      }
    }
    widgets.push({objectPath,name:s.data.Name,class:s.data.Class,properties,state,geometry:geometry.data,screenPosition:position.data,
      functions:s.data.Functions.filter(f=>/^(GetText|SetText|SetValue|GetValue|SetIsChecked|GetIsChecked|SetSelectedIndex|GetSelectedIndex|SetPercent|GetPercent)$/.test(f.Name))});
  }
  const after=await getter(library,'GetCurWorld');
  if(after.data.ReturnValue!==baseline.world)throw Error('World changed during UI inspection');
  return {capturedAt:new Date().toISOString(),readOnly:true,world:baseline.world,root,totalDescendants:descendants.data.ReturnValue.length,widgets};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [cmd,a='',b='',c]=process.argv.slice(2);
  try{
    const value=cmd==='roots'?await widgetRoots(a):cmd==='tree'?await inspectWidgetTree(a,b):null;
    if(!value)throw Error('Use roots [NAME_PATTERN] [OUT], or tree ROOT NAME_PATTERN [OUT]');
    const out=cmd==='roots'?b:c;
    if(out){fs.writeFileSync(out,JSON.stringify(value,null,2)+'\n');console.log(JSON.stringify({file:out,world:value.world,widgets:value.widgets.length}));}
    else console.log(JSON.stringify(value,null,2));
  }catch(error){console.error(JSON.stringify({error:error.message}));process.exitCode=1;}
}
