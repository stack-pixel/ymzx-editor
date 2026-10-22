// Extract real custom image references from an already normally saved map.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readUIDocument} from './native-ui-document.mjs';
export function extractCustomImageBindings(doc,request){
 if(!Array.isArray(request?.controls)||!request.controls.length||request.controls.length>100)throw Error('Provide1-100 explicit controls');
 const keys=new Set(),uids=new Set();
 const bindings=request.controls.map(s=>{
  if(!s||Object.keys(s).some(k=>!['key','uid','hasBakedCaption','expectedResourceId'].includes(k))||typeof s.key!=='string'||!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(s.key)||typeof s.uid!=='string'||!/^\d+$/.test(s.uid)||!Number.isSafeInteger(Number(s.uid))||Number(s.uid)<=0||typeof s.hasBakedCaption!=='boolean')throw Error('Explicit key, safe positive UID string and hasBakedCaption required');
  if(keys.has(s.key)||uids.has(s.uid))throw Error('Duplicate key or UID');keys.add(s.key);uids.add(s.uid);
  const rows=doc.records.filter(r=>r.uid===s.uid);if(rows.length!==1)throw Error('Target UID missing or ambiguous: '+s.uid);
  const r=rows[0],m=/^#_\*_#(\d{1,32})$/.exec(r.assetName??'');
  if(!['1','4'].includes(r.observedType)||!m)throw Error('Target is not a saved Button/Picture with a registered custom image: '+s.uid);
  if(s.expectedResourceId!==undefined&&(typeof s.expectedResourceId!=='string'||s.expectedResourceId!==m[1]))throw Error('Expected resource differs from saved binding');
  return {key:s.key,uid:s.uid,resourceId:m[1],assetName:r.assetName,hasBakedCaption:s.hasBakedCaption};
 });
 return {schema:'ymzx-custom-image-bindings/1',mapId:doc.mapId,sourceSha256:doc.sha256,source:doc.source,bindings,scope:'Readback of saved authoring references; does not upload images or prove runtime rendering.'};
}
export function bindingsLua(result){
 return '-- Resource IDs remain strings. Generated from saved native UI references.\nreturn {\n'+result.bindings.map(b=>'    ['+b.uid+'] = '+JSON.stringify(b.resourceId)+', -- '+b.key).join('\n')+'\n}\n';
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [file,mapId,requestFile,out,luaOut]=process.argv.slice(2);
  if(!out||!out.endsWith('.json')||luaOut&&!luaOut.endsWith('.lua'))throw Error('Use FILE MAP_ID REQUEST_JSON OUT_JSON [OUT_LUA]');
  const doc=readUIDocument(file,mapId),request=JSON.parse(fs.readFileSync(requestFile,'utf8').replace(/^\uFEFF/,''));
  const result=extractCustomImageBindings(doc,request);
  const targets=[out,luaOut].filter(Boolean).map(p=>path.resolve(p));
  if(new Set(targets).size!==targets.length||targets.some(p=>p===path.resolve(file)||p===path.resolve(requestFile)))throw Error('Output must differ from inputs');
  for(const p of targets)if(p.replaceAll('\\','/').toLowerCase().includes('/saved/ugcleveldata/'))throw Error('Write project artifacts, never game cache files');
  fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
  if(luaOut){fs.mkdirSync(path.dirname(path.resolve(luaOut)),{recursive:true});fs.writeFileSync(luaOut,bindingsLua(result));}
  console.log(JSON.stringify({out:path.resolve(out),luaOut:luaOut?path.resolve(luaOut):undefined,bindings:result.bindings.length,mapId}));
 }catch(e){console.error(e.message);process.exitCode=1;}
}
