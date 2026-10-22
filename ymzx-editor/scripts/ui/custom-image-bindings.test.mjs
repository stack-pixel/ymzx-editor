import test from 'node:test';
import assert from 'node:assert/strict';
import {extractCustomImageBindings,bindingsLua} from './custom-image-bindings.mjs';
const doc={mapId:'10000000000000101',sha256:'fixture',source:'fixture',records:[{uid:'100132',observedType:'1',assetName:'#_*_#10000000000000201'}]};
const control={key:'backpack',uid:'100132',hasBakedCaption:true};
test('saved long resource IDs stay exact strings in JSON and Lua',()=>{
 const r=extractCustomImageBindings(doc,{controls:[control]});
 assert.equal(r.bindings[0].resourceId,'10000000000000201');
 assert.match(bindingsLua(r),/\[100132\] = "10000000000000201"/);
});
test('missing, duplicate, unsafe or mismatched targets cannot produce mappings',()=>{
 for(const controls of [[control,control],[{...control,uid:'99'}],[{...control,uid:'9007199254740993'}],[{...control,expectedResourceId:'10000000000000202'}],[{...control,expectedResourceId:10000000000000201}]])assert.throws(()=>extractCustomImageBindings(doc,{controls}));
});
test('built-in assets and unsupported control types do not become invented custom IDs',()=>{
 for(const record of [{...doc.records[0],assetName:'30010005'},{...doc.records[0],observedType:'2'},{...doc.records[0],assetName:'#_*_#not-real'}])assert.throws(()=>extractCustomImageBindings({...doc,records:[record]},{controls:[control]}));
});
