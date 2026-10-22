// Inventory currently materialized editor tiles. This does not select or create.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {widgetRoots} from './native-ui-inspect.mjs';
import {getter} from './native-remote-getters.mjs';
import {nativeTextValue} from './native-text.mjs';
export async function paletteItems(kind='scene'){
 if(!['scene','ui'].includes(kind))throw Error('Expected scene or ui palette');
 const roots=await widgetRoots(kind==='scene'?'UI_UGCEditor_SearchObject_SingleItem_C_\\d+$':'UI_UGCUIEditor_Item_C_\\d+$');
 const items=[];
 for(const root of roots.widgets){
  const visible=await getter(root,'IsVisible');if(visible.data.ReturnValue!==true)continue;
  const size=await getter(root,'GetWidgetLocSize',{Widget:root});if(!(size.data.ReturnValue?.X>0&&size.data.ReturnValue?.Y>0))continue;
  const tree=await getter(root,'FindAllWidgetsRecursive',{Root:root});if(!Array.isArray(tree.data.ReturnValue))throw Error('Palette tree unavailable');
  const labels=[];
  for(const p of tree.data.ReturnValue.filter(p=>/^w_(txt_tabName|txt_name|text_name|txt_Name|txt_title|txt_Title|text_Name)$/.test(p.split('.').at(-1)))){
   const v=await getter(p,'GetText');if(v.status===200)labels.push({objectPath:p,text:nativeTextValue(v.data.ReturnValue)});
  }
  items.push({root,labels,size:size.data.ReturnValue,center:(await getter(root,'GetWidgetScreenPosition',{Widget:root})).data.ReturnValue});
 }
 const after=await widgetRoots();if(after.world!==roots.world)throw Error('World changed while reading palette');
 return {capturedAt:new Date().toISOString(),readOnly:true,world:roots.world,kind,items};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const [kind,out]=process.argv.slice(2),result=await paletteItems(kind);if(out){fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({file:out,items:result.items.length}));}else console.log(JSON.stringify(result,null,2));}catch(error){console.error(error.message);process.exitCode=1;}
}
