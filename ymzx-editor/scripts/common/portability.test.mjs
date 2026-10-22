import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const skill=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const env={...process.env,YMZX_STATE_DIR:''};
const run=(file,...args)=>spawnSync(process.execPath,[path.join(skill,'scripts',file),...args],{encoding:'utf8',cwd:os.tmpdir(),env});
test('native module runners are callable from another directory without state or game for discovery',()=>{
 for(const category of ['ui','components']){
  const result=run(category+'/run.mjs','help');assert.equal(result.status,0,result.stderr);
  const help=JSON.parse(result.stdout);assert(help.tools.includes('native-ui-control'));assert(help.tools.includes('native-ui-call'));
  assert.equal(run(category+'/run.mjs','native-ui-control','click','/current','Button').status,1);
  assert.equal(run(category+'/run.mjs','../../outside').status,1);
 }
});
test('native UI and component dependency closures need neither Kouding nor host automation libraries',()=>{
 const inspected=new Set();
 function visit(file){
  if(inspected.has(file))return;inspected.add(file);const source=fs.readFileSync(file,'utf8');
  for(const m of source.matchAll(/(?:from\s*|import\s*\()(['"])([^'"\n]+)\1/g)){
   const spec=m[2];if(spec.startsWith('node:'))continue;
   assert(spec.startsWith('.'),'External dependency: '+spec);
   const dependency=path.resolve(path.dirname(file),spec);
   assert(dependency.startsWith(skill+path.sep),'Dependency outside package');
   assert(!dependency.includes(path.sep+'kouding'+path.sep),'Kouding dependency in native module');
   visit(dependency);
  }
 }
 for(const category of ['ui','components'])for(const name of fs.readdirSync(path.join(skill,'scripts',category)).filter(n=>n.endsWith('.mjs')&&!n.endsWith('.test.mjs')))visit(path.join(skill,'scripts',category,name));
 assert(inspected.size>20);
});
test('native-call CLI rejects malformed targets and non-object parameter files before contacting game',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ymzx-native-call-'));
 t.after(()=>{const resolved=path.resolve(dir);assert(path.relative(os.tmpdir(),resolved).startsWith('ymzx-native-call-'));fs.rmSync(resolved,{recursive:true,force:true});});
 const params=path.join(dir,'parameters.json');fs.writeFileSync(params,'[]');
 for(const category of ['ui','components']){
  assert.equal(run(category+'/native-ui-call.mjs','help').status,0);
  assert.match(run(category+'/native-ui-call.mjs','relative','Function').stderr,/Expected current/);
  assert.match(run(category+'/native-ui-call.mjs','/current','Function',params).stderr,/JSON object/);
 }
});
