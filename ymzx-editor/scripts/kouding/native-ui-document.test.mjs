import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {decodeUIRecords,readUIDocument,waitUIDocument} from './native-ui-document.mjs';
const vi=n=>{let v=BigInt(n),a=[];do{let x=Number(v&127n);v>>=7n;a.push(x|(v?128:0));}while(v);return Buffer.from(a);};
const field=(n,v)=>Buffer.concat([vi(n*8+2),vi(v.length),v]);
const numeric=(n,v)=>Buffer.concat([vi(n*8),vi(v)]);
const row=id=>Buffer.concat([numeric(1,2),numeric(2,id),field(5,Buffer.from('Ready')),field(10011,Buffer.from('AI_Text')),field(500,Buffer.from('unknown preserved'))]);
const doc=rows=>[1,5,3,1].reduce((bytes,n)=>field(n,bytes),Buffer.concat(rows.map(r=>field(7,r))));
test('UI protobuf keeps exact IDs and reads observed custom name/text without guessing unknown fields',()=>{
 const records=decodeUIRecords(doc([row('9007199254740993')]));
 assert.equal(records[0].uid,'9007199254740993');assert.equal(records[0].text,'Ready');assert.equal(records[0].name,'AI_Text');
});
test('UI protobuf rejects duplicate UIDs, changed nesting, and a path from another map',()=>{
 assert.throws(()=>decodeUIRecords(doc([row('1'),row('1')])),/Duplicate/);
 assert.throws(()=>decodeUIRecords(field(9,row('1'))),/schema/);
 assert.throws(()=>readUIDocument('D:/maps/123/EditorMapDescription.des','456'),/requested map/);
});
test('UI groups preserve child IDs and validate their real parent instead of dropping nested controls',()=>{
 const child=Buffer.concat([row('100048'),numeric(9998,'100107')]);
 const group=Buffer.concat([numeric(1,3),numeric(2,'100107'),field(10011,Buffer.from('AI_Group')),field(9999,child)]);
 const records=decodeUIRecords(doc([group]));
 assert.equal(records.length,2);assert.equal(records[1].parentUid,'100107');assert.deepEqual(records[0].childUids,['100048']);
 const wrong=Buffer.concat([numeric(1,3),numeric(2,'100108'),field(9999,child)]);
 assert.throws(()=>decodeUIRecords(doc([wrong])),/parent UID/);
});

function savedFixture(t,asset){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ymzx-ui-save-'));
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const map=path.join(directory,'123');fs.mkdirSync(map);
 const file=path.join(map,'EditorMapDescription.des');
 const write=value=>fs.writeFileSync(file,doc([Buffer.concat([row('42'),field(19,Buffer.from(value))])]));
 write(asset);return {file,write};
}
test('old stable image binding cannot satisfy a newly expected resource',async t=>{
 const {file}=savedFixture(t,'#_*_#100');
 await assert.rejects(waitUIDocument(file,'123',[{name:'AI_Text',uid:'42',assetName:'#_*_#200'}],{timeoutMs:400}),/did not stabilize/);
});
test('save polling waits for the actual expected image rather than stable old text',async t=>{
 const {file,write}=savedFixture(t,'#_*_#100');
 const timer=setTimeout(()=>write('#_*_#200'),450);t.after(()=>clearTimeout(timer));
 const result=await waitUIDocument(file,'123',[{name:'AI_Text',uid:'42',assetName:'#_*_#200'}],{timeoutMs:3000});
 assert.equal(result.records[0].assetName,'#_*_#200');assert.equal(result.expectedRecordsVerified,true);
});
