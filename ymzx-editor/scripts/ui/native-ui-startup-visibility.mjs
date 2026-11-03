// Change the normal startup-visibility checkbox of an already selected control.
// Selection, normal UI packing, whole-map save and native play remain separate.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {liveRoot,tree,text} from './native-ui-author.mjs';import {call} from './native-ui-call.mjs';import {invokeButton} from './native-ui-delegate.mjs';
const title='游戏开始时为显示状态';
export async function setSelectedStartupVisibility(expectedName,visible,io){
 if(typeof expectedName!=='string'||!expectedName.trim()||expectedName.length>100||typeof visible!=='boolean')throw Error('Exact selected control name and boolean required');
 const validate=s=>{if(s.name!==expectedName)throw Error('Selected control changed or differs: '+s.name);if(s.title!==title)throw Error('Exact startup visibility property absent or recycled');if(s.index!==0&&s.index!==2)throw Error('Unsupported switcher state; inspect this native version');};
 const before=await io.read();validate(before);const desired=visible?2:0;
 if(before.index===desired)return {name:expectedName,before:before.index,after:desired,changed:false,visible};
 const fresh=await io.read();validate(fresh);if(fresh.index!==before.index||fresh.key!==before.key)throw Error('Property changed before input');
 await io.click();const after=await io.read();validate(after);if(after.key!==before.key||after.index!==desired)throw Error('Startup visibility readback differs; inspect before retrying');
 return {name:expectedName,before:before.index,after:after.index,changed:true,visible};
}
export async function selectedNativeIO(){
 const panel=await liveRoot('UI_UGCEditor_AdvanceSettingPanel_C_[0-9]+$');let button;
 return {panel,async read(){
  const paths=[...new Set(await tree(panel))],names=paths.filter(p=>p.endsWith('.w_txt_Name')&&/UI_UGCEditor_AdvanceSetting_UI_C_\d+\.WidgetTree\./.test(p));if(names.length!==1)throw Error('One actual selected UI control required');
  const headings=[];for(const p of paths.filter(p=>p.endsWith('.w_txt_Title')))if(await text(p)===title)headings.push(p);if(headings.length!==1)throw Error('One exact startup visibility row required');
  const base=headings[0].split('.WidgetTree.')[0]+'.WidgetTree.UI_UGCEditor_LabelRadio.WidgetTree.UI_UGC_SwitcherButton.WidgetTree.';button=base+'w_btn_click';
  return {name:await text(names[0]),title:await text(headings[0]),index:(await call(base+'w_switcher_root','GetActiveWidgetIndex')).data.ReturnValue,key:headings[0]};
 },async click(){if(!button)throw Error('Read actual selected property first');await invokeButton(button,panel);}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [name,state,out,...extra]=process.argv.slice(2);
 if(!name||name==='help')console.log('EXPECTED_CONTROL_NAME hidden|visible [OUT_JSON]; operates on the already-selected native UI property, does not select/pack/save/play.');
 else try{
  if(!['hidden','visible'].includes(state)||extra.length)throw Error('EXPECTED_CONTROL_NAME hidden|visible [OUT_JSON]');
  if(out&&fs.existsSync(out))throw Error('Preserve the existing result; choose a new output file');
  const io=await selectedNativeIO(),result=await setSelectedStartupVisibility(name,state==='visible',io),report={at:new Date().toISOString(),...result,panel:io.panel,method:'normal native checkbox delegate and fresh readback',mapSaved:false,playVerified:false};
  if(out)fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2));
 }catch(e){console.error(JSON.stringify({error:e.message}));process.exitCode=1;}
}
