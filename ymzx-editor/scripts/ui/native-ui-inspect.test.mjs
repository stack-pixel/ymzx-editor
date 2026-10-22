import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectWidgetTree,widgetRoots} from './native-ui-inspect.mjs';
const world='/Game/Test.Editor',root='/Engine/Transient.EditorRoot';
const child=root+'.WidgetTree.w_btn_Create',other=root+'.WidgetTree.w_txt_Title';
const arg=(Name,Type)=>({Name,Type,ContainerType:'',MetaData:{}});
function fixture({stale=false,changedWorld=false}={}){
  const seen=[];let worldReads=0;
  const functions=[
    {Name:'GetCurWorld',Arguments:[]},
    {Name:'GetAllWidgetsOfClass',Arguments:[arg('WorldContextObject','UObject*'),arg('WidgetClass','TSubclassOf<UUserWidget>'),arg('TopLevelOnly','bool')]},
    {Name:'FindAllWidgetsRecursive',Arguments:[arg('Root','UUserWidget*')]},
    {Name:'GetWidgetLocSize',Arguments:[arg('Widget','UWidget*')]},
    {Name:'GetWidgetScreenPosition',Arguments:[arg('Widget','UWidget*')]},
    ...['GetVisibility','IsVisible','GetIsEnabled','GetText'].map(Name=>({Name,Arguments:[]}))
  ];
  return {seen,fetch:async(url,options)=>{
    const body=JSON.parse(options?.body||'{}');seen.push({url:String(url),body});
    let data;
    if(String(url).endsWith('/remote/object/describe')) data={Name:body.objectPath.split('.').at(-1),Class:'/Script/UMG.Button',Properties:[],Functions:functions};
    else if(String(url).endsWith('/remote/object/call')){
      assert.equal(body.generateTransaction,false);
      switch(body.functionName){
        case 'GetCurWorld':data={ReturnValue:changedWorld&&worldReads++>0?'/Game/Other.Editor':world};break;
        case 'GetAllWidgetsOfClass':data={FoundWidgets:stale?[]:[root]};break;
        case 'FindAllWidgetsRecursive':assert.deepEqual(body.parameters,{Root:root});data={ReturnValue:[child,other]};break;
        case 'GetWidgetLocSize':assert([root,child,other].includes(body.parameters.Widget));data={ReturnValue:{X:100,Y:40}};break;
        case 'GetWidgetScreenPosition':data={ReturnValue:{X:240,Y:180}};break;
        case 'GetText':data={ReturnValue:'创建控件'};break;
        case 'GetVisibility':data={ReturnValue:'Visible'};break;
        case 'IsVisible':case 'GetIsEnabled':data={ReturnValue:true};break;
        default:throw Error('Unexpected native call '+body.functionName);
      }
    }else throw Error('Unexpected native route '+url);
    return {status:200,json:async()=>data,text:async()=>JSON.stringify(data)};
  }};
}
async function withFixture(settings,fn){const f=fixture(settings),before=globalThis.fetch;globalThis.fetch=f.fetch;try{return await fn(f);}finally{globalThis.fetch=before;}}
test('widget inspection validates roots and bounds before connecting',async()=>{
 await withFixture({},async({seen})=>{
   await assert.rejects(inspectWidgetTree('', 'button'),/Live root path/);
   await assert.rejects(inspectWidgetTree(root,'',301),/bounded result/);
   assert.equal(seen.length,0);
 });
});
test('stale widget paths do not reach native tree traversal',async()=>{
 await withFixture({stale:true},async({seen})=>{
   await assert.rejects(inspectWidgetTree(root),/absent from current session/);
   assert(!seen.some(x=>x.body.functionName==='FindAllWidgetsRecursive'));
 });
});
test('live tree inspection supplies root, preserves identity and reads text/state/geometry',async()=>{
 await withFixture({},async({seen})=>{
   const r=await inspectWidgetTree(root,'w_btn_');
   assert.equal(r.readOnly,true);assert.equal(r.world,world);assert.equal(r.root,root);assert.equal(r.widgets.length,1);
   assert.equal(r.widgets[0].objectPath,child);assert.equal(r.widgets[0].state.GetText.ReturnValue,'创建控件');
   assert.deepEqual(r.widgets[0].screenPosition.ReturnValue,{X:240,Y:180});
   assert(seen.every(x=>/\/remote\/object\/(describe|call)$/.test(x.url)));
 });
});
test('world changes invalidate inspection and large matches stop before detailed reads',async()=>{
 await withFixture({changedWorld:true},async()=>{await assert.rejects(inspectWidgetTree(root,'w_btn_'),/World changed/);});
 await withFixture({},async({seen})=>{
   await assert.rejects(inspectWidgetTree(root,'',1),/narrow the name pattern/);
   assert(!seen.some(x=>x.body.functionName==='GetWidgetLocSize'));
 });
});
