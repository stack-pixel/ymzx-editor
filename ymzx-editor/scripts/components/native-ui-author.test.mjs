import test from 'node:test';
import assert from 'node:assert/strict';
import {selectDisplayedRow,selectRow,authorGeometry,editSelected} from './native-ui-author.mjs';

test('virtualized selection uses displayed entries and rejects a UID mismatch before edits',async()=>{
 let clicked=[];
 const io={displayedRows:async()=>['visible'],rowText:async()=> 'Target',click:async row=>clicked.push(row),selectedUid:async()=> '42'};
 assert.equal(await selectDisplayedRow('Target','42',io),'visible');
 assert.deepEqual(clicked,['visible']);
 await assert.rejects(selectDisplayedRow('Target','43',io),/UID mismatch/);
 // The same label on an undisplayed pooled object is deliberately never queried.
 await assert.rejects(selectDisplayedRow('Hidden','42',io),/missing or ambiguous/);
});
test('recycled rows and duplicate labels cannot trigger a click',async()=>{
 let reads=0,clicks=0;
 const io={displayedRows:async()=>++reads===1?['row']:[],rowText:async()=> 'Target',click:async()=>clicks++,selectedUid:async()=> '42'};
 await assert.rejects(selectDisplayedRow('Target','42',io),/changed before/);
 io.displayedRows=async()=>['a','b'];
 await assert.rejects(selectDisplayedRow('Target','42',io),/ambiguous/);
 assert.equal(clicks,0);
});
test('missing UID and missing geometry fail before contacting native editor',async t=>{
 const original=globalThis.fetch;let requests=0;
 globalThis.fetch=async()=>{requests++;throw Error('Unexpected native request');};t.after(()=>globalThis.fetch=original);
 await assert.rejects(selectRow('Target'),/UID string required/);
 await assert.rejects(editSelected({label:'Caption',x:0,y:0,w:100,h:40}),/Explicit positive/);
 assert.equal(requests,0);
});
test('author geometry supports explicit canvas sizes and rejects distorted or invalid mappings',()=>{
 const spec={label:'Caption',designWidth:1000,designHeight:500,authorWidth:2000,authorHeight:1000,x:400,y:200,w:200,h:100};
 assert.deepEqual(authorGeometry(spec),{Width:400,Height:200,X:0,Y:0});
 assert.throws(()=>authorGeometry({...spec,authorHeight:1200}),/Nonuniform/);
 assert.throws(()=>authorGeometry({...spec,x:Infinity}),/finite rectangle/);
 assert.throws(()=>authorGeometry({...spec,w:0.001}),/precision/);
});
