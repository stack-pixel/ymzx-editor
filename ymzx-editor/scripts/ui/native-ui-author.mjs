import {widgetRoots} from './native-ui-inspect.mjs';
import {getter} from './native-remote-getters.mjs';
import {invokeButton} from './native-ui-delegate.mjs';
import {call} from './native-ui-call.mjs';
import {nativeTextValue} from './native-text.mjs';
import {query} from './native-remote-read.mjs';
import {controlWidget} from './native-ui-control.mjs';
export async function liveRoot(pattern){
 const roots=(await widgetRoots(pattern)).widgets.filter(p=>!p.includes('.WidgetTree.'));
 const visible=[];
 for(const r of roots){
  const schema=await query('/remote/object/describe',{objectPath:r});
  if(schema.status!==200||!schema.data.Functions?.some(f=>f.Name==='IsVisible'))continue;
  if(!(await getter(r,'IsVisible')).data.ReturnValue)continue;
  if(schema.data.Functions.some(f=>f.Name==='GetWidgetLocSize')&&!((await getter(r,'GetWidgetLocSize',{Widget:r})).data.ReturnValue.X>0))continue;
  visible.push(r);
 }
 if(visible.length!==1)throw Error('Live root ambiguous: '+pattern+' '+visible.length);
 return visible[0];
}
export async function tree(root){return (await getter(root,'FindAllWidgetsRecursive',{Root:root})).data.ReturnValue;}
export async function text(p){const value=nativeTextValue((await getter(p,'GetText')).data.ReturnValue);return typeof value==='string'?value.replaceAll('\r\n','\n'):value;}
// Keep list selection testable without touching an editor or Windows input.
export async function selectDisplayedRow(label,expectedUid,io){
 if(typeof label!=='string'||!label.trim()||typeof expectedUid!=='string'||!/^\d{1,32}$/.test(expectedUid))throw Error('Exact row label and persistent UID string required');
 const normalize=value=>value.replace(/\s+/g,' ').trim();
 const rows=await io.displayedRows(),matches=[];
 if(!Array.isArray(rows)||rows.some(row=>typeof row!=='string'))throw Error('Displayed list entries unavailable');
 for(const row of [...new Set(rows)])if(normalize(await io.rowText(row))===normalize(label))matches.push(row);
 if(matches.length!==1)throw Error('Displayed UI row missing or ambiguous: '+label+' '+matches.length);
 const row=matches[0];
 // Scrolling can recycle a pooled row between discovery and input.
 if(!(await io.displayedRows()).includes(row)||normalize(await io.rowText(row))!==normalize(label))throw Error('Displayed UI row changed before selection');
 await io.click(row);
 const actual=await io.selectedUid();
 if(actual!==expectedUid)throw Error('Selected UID mismatch: '+actual+' != '+expectedUid+'; inspect selection before editing');
 return row;
}
export async function selectedUID(){
 const panel=await openProperties(),values=[];
 for(const p of [...new Set(await tree(panel))].filter(p=>/InstanceInformation_Item_(?:1|C_\d+)\.WidgetTree\.w_txt_ID$/.test(p))){
  const size=(await getter(panel,'GetWidgetLocSize',{Widget:p})).data.ReturnValue;
  if(size?.X>0&&size?.Y>0)values.push(await text(p));
 }
 if(values.length!==1||!/^\d{1,32}$/.test(values[0]))throw Error('Selected persistent UID unavailable or ambiguous');
 return values[0];
}
export async function selectRow(label,expectedUid){
 // Validate before any native request.
 if(typeof label!=='string'||!label.trim()||typeof expectedUid!=='string'||!/^\d{1,32}$/.test(expectedUid))throw Error('Exact row label and persistent UID string required');
 const root=await liveRoot('UI_UGC_UIEditor_UIList_C_\\d+$');
 return selectDisplayedRow(label,expectedUid,{
  displayedRows:async()=>{
   const result=await getter(root+'.WidgetTree.w_tree_layerlist','GetDisplayedEntryWidgets');
   if(result.status!==200||!Array.isArray(result.data.ReturnValue))throw Error('Current displayed UI entries unavailable');
   return result.data.ReturnValue;
  },
  rowText:row=>text(row+'.WidgetTree.w_text_content'),
  click:row=>controlWidget('click',row,row+'.WidgetTree.w_touch_area_drag'),
  selectedUid:selectedUID,
 });
}
export async function openProperties(){
 try{return await liveRoot('UI_UGCEditor_AdvanceSettingPanel_C_[0-9]+$');}catch{}
 const r=await liveRoot('UI_UGCOperate_ScreenEdit_C_\\d+$');await invokeButton(r+'.WidgetTree.UI_UGC_SwitcherButton_Advance.WidgetTree.w_btn_click');return liveRoot('UI_UGCEditor_AdvanceSettingPanel_C_\\d+$');
}
export async function setText(p,value){
 if(typeof p!=='string'||!p.startsWith('/')||!p.includes('.WidgetTree.'))throw Error('Current editable widget path required');
 return controlWidget('fill',p.split('.WidgetTree.')[0],p,value);
}
export async function fillKeypad(value){
 if(!/^-?\d+(?:\.\d+)?$/.test(String(value)))throw Error('Decimal required');
 const pad=await liveRoot('UI_UGCEditor_NumericKeypad_C_[0-9]+$');
 const confirm=pad+'.WidgetTree.Widget_NumericKey_15.WidgetTree.';
 if(await text(confirm+'TextBlock')!=='确定')throw Error('Numeric apply key changed');
 // OnApplyClick in the installed Lua reads bp.w_txt_num:GetText(), validates
 // limits/precision, and invokes CallbackApply. Keep that actual commit path.
 const numeric=pad+'.WidgetTree.w_txt_num';
 await call(numeric,'SetText',{InText:String(value)});
 if(await text(numeric)!==String(value))throw Error('Keypad text readback mismatch');
 await invokeButton(confirm+'Button_32');
}
export async function setModifier(anchorRoot,field,value){
 const prefix=anchorRoot+'.WidgetTree.UI_UGCEditor_Label'+(['X','Y'].includes(field)?'Transform':'UI')+'Modifier_'+field+'.WidgetTree.UI_UGCEditor_NumberModifier.WidgetTree.';
 await invokeButton(prefix+'w_btn_edit');await fillKeypad(value);
 const actual=Number(await text(prefix+'w_txt_Value'));if(Math.abs(actual-Number(value))>0.02)throw Error('Modifier mismatch '+field+' '+actual+' != '+value);
}
export async function closeProperties(){const r=await liveRoot('UI_UGCEditor_AdvanceSettingPanel_C_[0-9]+$');await invokeButton(r+'.WidgetTree.UI_UGC_FirstLevel_Container.WidgetTree.w_btn_Close');}
export async function context(){
 const panel=await liveRoot('UI_UGCEditor_AdvanceSettingPanel_C_[0-9]+$'),paths=[...new Set(await tree(panel))];
 const anchors=[...new Set(paths.filter(p=>/UI_UGC_UIEditorAnchor_C_[0-9]+\.WidgetTree\./.test(p)).map(p=>p.split('.WidgetTree.')[0]))];
 if(anchors.length!==1)throw Error('Anchor ambiguous');
 const scrolls=paths.filter(p=>/AdvanceItemList_C_[0-9]+\.WidgetTree\.w_scroll_panel$/.test(p)),visible=[];
 for(const p of scrolls){let v=await getter(panel,'GetWidgetLocSize',{Widget:p});if(v.data.ReturnValue.X>0)visible.push(p);}
 if(visible.length!==1)throw Error('Active properties scroll ambiguous');
 return {panel,paths,anchor:anchors[0],scroll:visible[0]};
}
export function authorGeometry(spec){
 if(!spec||typeof spec.label!=='string'||/[\x00\r\n]/.test(spec.label)||spec.label.length>4096)throw Error('Single-line label required');
 const dimensions=['designWidth','designHeight','authorWidth','authorHeight'];
 if(dimensions.some(key=>!Number.isFinite(spec[key])||spec[key]<=0)||['x','y','w','h'].some(key=>!Number.isFinite(spec[key]))||spec.w<=0||spec.h<=0)throw Error('Explicit positive design/author dimensions and finite rectangle required');
 if(spec.font!==undefined&&(!Number.isFinite(spec.font)||spec.font<=0))throw Error('Positive font size required');
 const sx=spec.authorWidth/spec.designWidth,sy=spec.authorHeight/spec.designHeight;
 if(Math.abs(sx-sy)>Math.max(sx,sy)*1e-6)throw Error('Nonuniform author mapping requires explicit native modifiers');
 const result={Width:Math.round(spec.w*sx),Height:Math.round(spec.h*sy),X:Math.round((spec.x+spec.w/2-spec.designWidth/2)*sx),Y:Math.round((spec.y+spec.h/2-spec.designHeight/2)*sy)};
 if(Object.values(result).some(v=>!Number.isSafeInteger(v))||result.Width<=0||result.Height<=0)throw Error('Author geometry exceeds supported precision');
 return result;
}
export async function editSelected(spec){
 const geometry=authorGeometry(spec);
 await openProperties();let c=await context();
 await call(c.scroll,'ScrollToStart');
 const title=c.paths.filter(p=>/UI_UGC_AdvanceItem_TextInput_C_[0-9]+\.WidgetTree.*\.w_txt_Title$/.test(p));let field;
 for(const p of title)if(await text(p)==='显示的文字')field=p.split('.WidgetTree.')[0]+'.WidgetTree.UI_UGCEditor_LabelText.WidgetTree.UI_UGC_TextInput_Any.WidgetTree.w_editBox_input';
 if(!field)throw Error('Display text field absent');await setText(field,spec.label);
 if(spec.font){const ts=c.paths.filter(p=>/UI_UGC_AdvanceItem_Slider_C_[0-9]+\.WidgetTree.*\.w_txt_Title$/.test(p));for(const p of ts)if(await text(p)==='文字大小'){await invokeButton(p.split('.WidgetTree.')[0]+'.WidgetTree.UI_UGCEditor_LabelSlider.WidgetTree.w_btn_keyboard');await fillKeypad(spec.font);}}
 await call(c.scroll,'ScrollToEnd');
 const ready=c.anchor+'.WidgetTree.UI_UGCEditor_LabelUIModifier_Width.WidgetTree.UI_UGCEditor_NumberModifier.WidgetTree.w_btn_edit';
 if(!((await getter(c.panel,'GetWidgetLocSize',{Widget:ready})).data.ReturnValue.X>0)){
  await new Promise(r=>setTimeout(r,60));
  if(!((await getter(c.panel,'GetWidgetLocSize',{Widget:ready})).data.ReturnValue.X>0))await invokeButton(c.anchor+'.WidgetTree.UI_UGCEditor_LabelGroupCollapsible.WidgetTree.w_btn_bar');
  await call(c.scroll,'ScrollToEnd');
 }
 for(let i=0;i<20;i++){let g=await getter(c.panel,'GetWidgetLocSize',{Widget:ready});if(g.data.ReturnValue.X>0)break;await new Promise(r=>setTimeout(r,40));if(i===19)throw Error('Native scroll layout did not settle');}
 for(const [key,v] of Object.entries(geometry))await setModifier(c.anchor,key,v);
 await closeProperties();
}
export async function copySelected(){
 const before=(await widgetRoots('UI_UGC_UIEditor_Button_C_[0-9]+$')).widgets;
 const root=await liveRoot('UI_UGC_UIEditor_C_[0-9]+$');await invokeButton(root+'.WidgetTree.w_uiselector_normal.WidgetTree.UI_UGC_SwitcherButton_copy.WidgetTree.w_btn_click');
 const after=(await widgetRoots('UI_UGC_UIEditor_Button_C_[0-9]+$')).widgets;const created=after.filter(p=>!before.includes(p));
 if(created.length!==1)throw Error('Copy did not create exactly one formal widget');return created[0];
}
if(process.argv[1]?.endsWith('native-ui-author.mjs')){
 const [op,a,b]=process.argv.slice(2);
 if(op==='select')console.log(await selectRow(a,b));
 if(op==='props')console.log(await openProperties());
 if(op==='tree'){const r=await liveRoot(a);console.log(r);for(const p of await tree(r))if(/Title$|Scroll|Numeric|Btn|Button/.test(p))console.log(p);}
 if(op==='text')console.log(await setText(a,b));
 if(op==='keypad')console.log(await fillKeypad(a));
 if(op==='modifier')console.log(await setModifier(a,b,process.argv[5]));
}
