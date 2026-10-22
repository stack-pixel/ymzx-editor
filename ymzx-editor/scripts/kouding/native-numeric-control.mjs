// Edit an observed property through the editor's numeric keypad, with readback.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {widgetRoots} from './native-ui-inspect.mjs';
import {getter} from './native-remote-getters.mjs';
import {nativeTextValue} from './native-text.mjs';
import {controlWidget} from './native-ui-control.mjs';
import {root as stateRoot} from './kouding-read-bridge.mjs';
import {findProperty} from './native-property-inspect.mjs';
export function numericTokens(value){
 if(typeof value!=='string'||!/^[-]?(?:0|[1-9]\d{0,8})(?:\.\d{1,6})?$/.test(value)||!Number.isFinite(Number(value)))throw Error('Bounded decimal number string required');
 return [...value];
}
async function numberText(p){const r=await getter(p,'GetText');if(r.status!==200)throw Error('Numeric text unavailable');const text=nativeTextValue(r.data.ReturnValue);if(typeof text!=='string'||!/^[-]?\d+(?:\.\d+)?$/.test(text))throw Error('Unexpected numeric label');return {text,value:Number(text)};}
export async function setNumericField(propertyRoot,value,{alreadyOpen=false,panelRoot,expectedTitle}={}){
 const tokens=numericTokens(value);
 if(typeof propertyRoot!=='string'||!/^UI_UGC_AdvanceItem_(TextInput_(Int|Float)|Slider)_C_\d+$/.test(propertyRoot.split('.').at(-1)))throw Error('Observed numeric property root required');
 const inventory=await widgetRoots();if(!inventory.widgets.includes(propertyRoot))throw Error('Numeric property is stale');
 if(panelRoot||expectedTitle){const property=await findProperty(panelRoot,expectedTitle);if(property.root!==propertyRoot||property.kind!=='number')throw Error('Numeric property title changed');}
 const slider=/Slider_C_/.test(propertyRoot),label=propertyRoot+(slider?'.WidgetTree.UI_UGCEditor_LabelSlider.WidgetTree.w_txt_btnValue':'.WidgetTree.UI_UGCEditor_LabelNum.WidgetTree.w_txt_content');
 const before=await numberText(label),directory=path.join(stateRoot,'evidence');fs.mkdirSync(directory,{recursive:true});const file=path.join(directory,'numeric-control-'+randomUUID()+'.json');
 const report={startedAt:new Date().toISOString(),world:inventory.world,propertyRoot,before,requestedValue:value,state:'prepared',actions:[],verified:false};
 const persist=()=>fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 const click=async(root,selector)=>{const result=await controlWidget('click',root,selector);report.actions.push(result);persist();};
 try{
  if(!alreadyOpen)await click(propertyRoot,slider?'w_btn_keyboard':'w_btn_OpenNumPad');
  const pads=await widgetRoots('UI_UGCEditor_NumericKeypad_C_\\d+$'),visible=[];
  for(const r of pads.widgets){const v=await getter(r,'IsVisible'),s=await getter(r,'GetWidgetLocSize',{Widget:r});if(v.data.ReturnValue===true&&s.data.ReturnValue?.X>0)visible.push(r);}
  if(visible.length!==1)throw Error('Numeric keypad is missing or ambiguous');const pad=visible[0];
  if((await numberText(pad+'.WidgetTree.w_txt_Num')).value!==before.value)throw Error('Keypad original differs from selected property');
  const t=await getter(pad,'FindAllWidgetsRecursive',{Root:pad}),keys=new Map();
  for(const p of [...new Set(t.data.ReturnValue)].filter(p=>/Widget_NumericKey_\d+\.WidgetTree\.TextBlock$/.test(p))){const r=await getter(p,'GetText');const text=nativeTextValue(r.data.ReturnValue);if(keys.has(text))throw Error('Ambiguous numeric key');keys.set(text,p);}
  for(const key of ['清空',...tokens,'确定']){
   if(!keys.has(key))throw Error('Numeric key unavailable: '+key);
   await click(pad,keys.get(key));
  }
  const resolved=panelRoot?await findProperty(panelRoot,expectedTitle):null;
  const after=await numberText(resolved?.selector||label);report.after=after;report.resolvedAfter=resolved;
  const current=await widgetRoots();if(current.world!==inventory.world||!current.widgets.includes(resolved?.root||propertyRoot)||after.value!==Number(value))throw Error('Numeric property readback differs');
  report.state='verified';report.verified=true;persist();return {file,propertyRoot,before,after,verified:true,scope:'Property label readback; full map persistence requires separate validation'};
 }catch(error){report.state='failed';report.error=error.message;persist();throw Error(error.message+'; journal: '+file);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(await setNumericField(process.argv[2],process.argv[3],{alreadyOpen:process.argv[4]==='already-open'}),null,2));}catch(error){console.error(error.message);process.exitCode=1;}
}
