import test from 'node:test';
import assert from 'node:assert/strict';
import {findProperty} from './native-property-inspect.mjs';
const panel='/Engine/Transient.Panel',a='/Engine/Transient.UI_UGC_AdvanceItem_TextInput_Int_C_1',b='/Engine/Transient.UI_UGC_AdvanceItem_TextInput_Int_C_2';
const title=r=>r+'.WidgetTree.UI_UGCEditor_LabelNum.WidgetTree.UI_UGC_ItemHeader.WidgetTree.w_txt_Title';
const value=r=>r+'.WidgetTree.UI_UGCEditor_LabelNum.WidgetTree.w_txt_content';
const textRow='/Engine/Transient.UI_UGC_AdvanceItem_TextInput_C_3',textValue=textRow+'.WidgetTree.UI_UGCEditor_LabelText.WidgetTree.UI_UGC_TextInput_Any.WidgetTree.w_editBox_input';
const arg=(Name,Type)=>({Name,Type,ContainerType:'',MetaData:{}});
const functions=[{Name:'GetCurWorld',Arguments:[]},{Name:'GetAllWidgetsOfClass',Arguments:[arg('WorldContextObject','UObject*'),arg('WidgetClass','TSubclassOf<UUserWidget>'),arg('TopLevelOnly','bool')]},{Name:'FindAllWidgetsRecursive',Arguments:[arg('Root','UUserWidget*')]},{Name:'GetWidgetLocSize',Arguments:[arg('Widget','UWidget*')]},{Name:'GetText',Arguments:[]}];
test('pooled property paths are resolved by current title after a rebuild; duplicate titles stop',async()=>{
 const original=globalThis.fetch;let labels=['目标数值','初始数值'];
 globalThis.fetch=async(url,options)=>{
  const body=JSON.parse(options.body);let data;
  if(String(url).endsWith('/describe'))data={Name:'Widget',Class:'/Script/UMG.TextBlock',Properties:[],Functions:functions};
  else {assert.equal(body.generateTransaction,false);switch(body.functionName){
   case 'GetCurWorld':data={ReturnValue:'/Game/Editor'};break;
   case 'GetAllWidgetsOfClass':data={FoundWidgets:[panel,a,b,textRow]};break;
   case 'FindAllWidgetsRecursive':assert.equal(body.parameters.Root,panel);data={ReturnValue:[title(a),value(a),title(b),value(b),title(textRow),textValue]};break;
   case 'GetText':data={ReturnValue:body.objectPath===title(textRow)?'显示的文字':labels[body.objectPath===title(a)?0:1]};break;
   case 'GetWidgetLocSize':data={ReturnValue:{X:100,Y:30}};break;
   default:throw Error('Unexpected native call');
  }}return{status:200,json:async()=>data,text:async()=>JSON.stringify(data)};
 };
 try{
  assert.equal((await findProperty(panel,'目标数值')).selector,value(a));
  const textProperty=await findProperty(panel,'显示的文字');assert.equal(textProperty.kind,'text');assert.equal(textProperty.selector,textValue);
  labels.reverse();assert.equal((await findProperty(panel,'目标数值')).selector,value(b));
  labels=['目标数值','目标数值'];await assert.rejects(findProperty(panel,'目标数值'),/ambiguous/);
  await assert.rejects(findProperty('/Engine/Transient.Stale','目标数值'),/stale/);
 }finally{globalThis.fetch=original;}
});
