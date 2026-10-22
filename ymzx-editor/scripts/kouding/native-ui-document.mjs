// Read the observed UI records from a normally saved EditorMapDescription.des.
// Unknown protobuf fields are never rewritten. Native references must validate IDs.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readWire} from './protobuf-wire.mjs';
function one(fields,number,wire){
 const matches=fields.filter(f=>f.field===number&&f.wire===wire);
 if(matches.length!==1)throw Error('Unsupported UI document schema at field '+number);
 return matches[0];
}
export function decodeUIRecords(bytes){
 let fields=readWire(bytes);
 for(const number of [1,3,5,1])fields=readWire(one(fields,number,2).bytes);
 const records=[];
 function record(bytes,parentUid=null,depth=0){
  if(depth>16||records.length>=10000)throw Error('UI hierarchy exceeds bounds');
  const row=readWire(bytes),id=one(row,2,0).value,type=one(row,1,0).value;
  const strings=n=>{const found=row.filter(f=>f.field===n&&f.wire===2);if(found.length>1)throw Error('Duplicate UI string');return found[0]?.bytes.toString('utf8')??null;};
  const parent=row.filter(f=>f.field===9998&&f.wire===0);if(parent.length>1||parentUid!==null&&(parent.length!==1||parent[0].value!==parentUid)||parentUid===null&&parent.length&&parent[0].value!=='0')throw Error('UI parent UID differs from saved hierarchy');
  const children=row.filter(f=>f.field===9999&&f.wire===2);if(children.length&&type!=='3')throw Error('Child records found on an unverified group type');
  const rectangles=row.filter(f=>f.field===13&&f.wire===2);let rect=null;
  if(rectangles.length>1)throw Error('Duplicate UI rectangle');
  if(rectangles.length){const r=readWire(rectangles[0].bytes);rect=Object.fromEntries([['left',1],['top',2],['width',3],['height',4]].map(([key,n])=>[key,one(r,n,5).float]));if(Object.values(rect).some(v=>!Number.isFinite(v))||rect.width<0||rect.height<0)throw Error('Invalid UI rectangle');}
  const result={uid:id,observedType:type,name:strings(10011),text:strings(5),assetName:strings(19),parentUid,childUids:[],rect,recordHash:createHash('sha256').update(bytes).digest('hex')};
  records.push(result);
  for(const child of children)result.childUids.push(record(child.bytes,id,depth+1));
  return id;
 }
 for(const f of fields.filter(f=>f.field===7&&f.wire===2))record(f.bytes);
 if(new Set(records.map(r=>r.uid)).size!==records.length)throw Error('Duplicate persistent UI UID');
 return records;
}
export function readUIDocument(file,mapId){
 if(typeof mapId!=='string'||!/^\d{1,32}$/.test(mapId))throw Error('Exact map ID string required');
 const absolute=path.resolve(file);
 if(path.basename(absolute)!=='EditorMapDescription.des'||path.basename(path.dirname(absolute))!==mapId)throw Error('Document path does not identify the requested map');
 const bytes=fs.readFileSync(absolute);
 return {capturedAt:new Date().toISOString(),readOnly:true,mapId,source:absolute,sha256:createHash('sha256').update(bytes).digest('hex'),records:decodeUIRecords(bytes),referenceVerified:false};
}
export async function waitUIDocument(file,mapId,expected,{timeoutMs=15000,absentUids=[]}={}){
 if(!Array.isArray(expected)||!expected.length||expected.length>100||expected.some(e=>!e||typeof e.name!=='string'||!e.name||Object.keys(e).some(k=>!['name','uid','text','observedType','assetName'].includes(k))||Object.values(e).some(v=>typeof v!=='string'))||!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw Error('Bounded expected UI record fields required');
 if(!Array.isArray(absentUids)||absentUids.length>100||absentUids.some(id=>typeof id!=='string'||!/^\d{1,32}$/.test(id)))throw Error('Bounded absent UID strings required');
 const deadline=Date.now()+timeoutMs;let previousHash,lastError;
 while(Date.now()<deadline){
  try{
   const value=readUIDocument(file,mapId);
   const matches=expected.every(e=>value.records.filter(r=>Object.entries(e).every(([key,v])=>r[key]===v)).length===1)&&!value.records.some(r=>absentUids.includes(r.uid));
   if(matches&&value.sha256===previousHash)return {...value,expectedRecordsVerified:true};
   previousHash=matches?value.sha256:undefined;
  }catch(error){lastError=error.message;}
  await new Promise(resolve=>setTimeout(resolve,300));
 }
 throw Error('Saved UI records did not stabilize with expected content'+(lastError?': '+lastError:''));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const [file,mapId,out]=process.argv.slice(2);const result=readUIDocument(file,mapId);if(out){fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({file:out,mapId,records:result.records.length}));}else console.log(JSON.stringify(result,null,2));}catch(error){console.error(error.message);process.exitCode=1;}
}
