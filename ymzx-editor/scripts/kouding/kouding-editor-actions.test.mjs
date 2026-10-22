import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function fixture(normalizeImport = value => value) {
  let project = { blocklyFileId: 'code1', codeFileId: 'code2', type: 'Global', triggerGroups: [] };
  const original = structuredClone(project);
  const calls = [];
  const m = {
    s: { projectStore: { exportCurrProject: () => project }, editorStore: { loading: false }, debugStore: { tryPlay: () => calls.push('debugPlay') } },
    $: value => { calls.push('import'); project = normalizeImport(structuredClone(value)); },
    ab: async mode => calls.push(mode),
    l: {getGameObjectVariableDropdown: () => []},
  };
  const schema={type:'second_type',args0:[{name:'position',type:'input_value',check:'Vector3'}]};
  const window = {
    requestAnimationFrame: callback => setTimeout(callback, 0),
    Blockly: {Blocks: {second_type: {init: function () {this.jsonInit(schema)}}, first_type: {}},Msg:{SECOND_TYPE_LABEL:'localized parameter',OTHER_TYPE_LABEL:'unrelated'}},
    System: { import: async () => m },
    letsgo: { callFunction: (method, params, callback) => {
      calls.push(method);
      callback?.(method === 'GetUGCPList' ? { ret: 0, data: { mapId: '42', selectId: 'code1' } } : { ret: 0, data: JSON.stringify(project) });
    } },
  };
  const document={baseURI:'file:///test/index.html',visibilityState:'visible'};
  vm.runInNewContext(fs.readFileSync(new URL('./kouding-editor-actions.js', import.meta.url), 'utf8'), { window, document, URL, setTimeout, clearTimeout });
  return { execute: window.__codexEditorActions.execute, original, calls, document, m, window };
}

test('editor info lists available block types without importing a project', async () => {
  const {execute,calls}=fixture();
  const info=await execute('editorInfo',{types:['missing_type','second_type']});
  assert.deepEqual(Array.from(info.blockTypes),['first_type','second_type']);
  assert.equal(info.definitions.missing_type,null);
  assert.equal(info.schemas.second_type.args0[0].name,'position');
  assert.equal(info.messages.SECOND_TYPE_LABEL,'localized parameter');
  assert.equal(info.messages.OTHER_TYPE_LABEL,undefined);
  assert.equal(calls.includes('import'),false);
});

test('hidden Kouding pages reject mutation before import or save',async()=>{
 const {execute,original,calls,document}=fixture();document.visibilityState='hidden';
 await assert.rejects(execute('applyProject',{mapId:'42',projectId:'code1',expectedProject:original,project:original}),/Open the Kouding/);
 assert.equal(calls.includes('import'),false);assert.equal(calls.includes('Stash'),false);
});

test('import mismatch reports the changed field and restores the original project', async () => {
  const {execute,original,calls}=fixture(value=>{
    if(value.triggerGroups[0]?.id==='new-group')value.triggerGroups[0].name='editor-localized name';
    return value;
  });
  const requested={...original,triggerGroups:[{id:'new-group',name:'requested name',state:{blocks:{blocks:[]}}}]};
  await assert.rejects(execute('applyProject',{mapId:'42',projectId:'code1',expectedProject:original,project:requested}),/project\.triggerGroups\.0\.name.*requested name.*editor-localized name.*previous canvas restored/);
  assert.equal(calls.filter(c=>c==='import').length,2);
  const restored=await execute('editorInfo',{});
  assert.deepEqual(JSON.parse(JSON.stringify(restored.project)),original);
});

test('writes reject a different map and stale project before import', async () => {
  const { execute, original, calls } = fixture();
  const request = { mapId: '99', projectId: 'code1', expectedProject: original, project: original };
  await assert.rejects(execute('applyProject', request), /changed/);
  request.mapId = '42'; request.expectedProject = { ...original, triggerGroups: [{ id: 'changed' }] };
  await assert.rejects(execute('applyProject', request), /changed/);
  assert.equal(calls.includes('import'), false);
});

test('project import and save use frontend pipeline and native readback', async () => {
  const { execute, original, calls } = fixture();
  const requested = { ...original, triggerGroups: [{ id: 'new-group', state: { blocks: { blocks: [] } } }] };
  const applied = await execute('applyProject', { mapId: '42', projectId: 'code1', expectedProject: original, project: requested });
  assert.equal(applied.applied, true); assert.equal(applied.saved, false);
  const saved = await execute('saveProject', { mapId: '42', projectId: 'code1', expectedProject: applied.project });
  assert.equal(saved.saved, true);
  assert.ok(calls.includes('Stash')); assert.ok(calls.includes('GetCode'));
  assert.equal(calls.includes('SaveCode'), false);
});

test('native resource label refresh preserves binding identity while ordinary text and changed IDs still fail',async()=>{
 const block={type:'Variable_Getter_Dynamic_Element',id:'b1',fields:{varName:{dataId:"'237'",value:'237',text:'文字显示器',originText:'元件',isSceneId:true}},inputs:{text:{shadow:{type:'text',fields:{TEXT:'WORLD READY'}}}}};
 const refresh=value=>{const b=value.triggerGroups[0]?.state.blocks.blocks[0];if(b)b.fields.varName.text='写字板';return value;};
 const good=fixture(refresh),requested={...good.original,triggerGroups:[{id:'g',state:{blocks:{blocks:[block]}}}]};
 const applied=await good.execute('applyProject',{mapId:'42',projectId:'code1',expectedProject:good.original,project:requested});
 assert.equal(applied.applied,true);assert.equal(applied.project.triggerGroups[0].state.blocks.blocks[0].fields.varName.value,'237');
 assert.equal(applied.project.triggerGroups[0].state.blocks.blocks[0].fields.varName.text,'写字板');
 await good.execute('saveProject',{mapId:'42',projectId:'code1',expectedProject:requested});
 for(const change of ['binding','text']){
  const bad=fixture(value=>{value=refresh(value);const b=value.triggerGroups[0]?.state.blocks.blocks[0];if(b){if(change==='binding')b.fields.varName.value='999';else b.inputs.text.shadow.fields.TEXT='changed';}return value;});
  await assert.rejects(bad.execute('applyProject',{mapId:'42',projectId:'code1',expectedProject:bad.original,project:{...bad.original,triggerGroups:requested.triggerGroups}}),change==='binding'?/varName.value.*previous canvas restored/:/fields.TEXT.*previous canvas restored/);
 }
});

test('canvas comparison accepts shadow toolbox kind metadata and rejects a changed numeric field', async()=>{
 const f=fixture();
 const block={type:'test_event',id:'event',x:40,y:40,inputs:{value:{shadow:{kind:'BLOCK',type:'math_number',id:'n',fields:{NUM:3}}},index:{shadow:{type:'pin_array_number',id:'index',extraState:{blockName:'循环次数',argName:'argIndex2',outputType:'Number'}}}}};
 const project={...f.original,triggerGroups:[{id:'g',state:{blocks:{blocks:[block]}}}]};
 await f.execute('applyProject',{mapId:'42',projectId:'code1',expectedProject:f.original,project});
 const live=structuredClone(project.triggerGroups[0].state);
 delete live.blocks.blocks[0].inputs.value.shadow.kind;
 live.blocks.blocks[0].inputs.index.shadow.extraState.blockName='循环次数2';
 live.blocks.blocks[0].x=77;live.blocks.blocks[0].y=120;
 f.m.s.projectStore.getCurrTriggerGroup=()=>({id:'g'});
 f.m.s.editorStore.workspace={};
 f.window.Blockly.serialization={workspaces:{save:()=>live}};
 let info=await f.execute('editorInfo',{});
 assert.equal(info.canvasConsistent,true);assert.equal(info.canvasDifference,null);
 live.blocks.blocks[0].inputs.value.shadow.fields.NUM=4;
 info=await f.execute('editorInfo',{});
 assert.equal(info.canvasConsistent,false);assert.match(info.canvasDifference,/fields.NUM/);
 await assert.rejects(f.execute('saveProject',{mapId:'42',projectId:'code1',expectedProject:project}),/canvas and exported project differ/);
 assert.equal(f.calls.includes('Stash'),false);
 live.blocks.blocks[0].inputs.value.shadow.fields.NUM=3;
 live.blocks.blocks[0].inputs.index.shadow.extraState.argName='argIndex3';
 info=await f.execute('editorInfo',{});
 assert.equal(info.canvasConsistent,false);assert.match(info.canvasDifference,/extraState.argName/);
});
