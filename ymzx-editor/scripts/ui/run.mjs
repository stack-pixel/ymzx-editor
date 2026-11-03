// Run only packaged helpers, keeping evidence in the task state directory.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const dir=path.dirname(fileURLToPath(import.meta.url));
const allowed=new Set(['native-ui-startup-visibility','native-ui-inspect','native-ui-document','native-ui-navigation','native-ui-author','native-ui-delegate','native-ui-control','native-ui-call','native-property-control','native-property-inspect','native-numeric-control','native-editor-palette','native-remote-read','native-remote-getters','native-scene-snapshot','read-scene-cache','custom-image-bindings','ui-layout-audit']);
const [tool,...args]=process.argv.slice(2);
if(!tool||tool==='help'){
 console.log(JSON.stringify({tools:[...allowed],state:'Set YMZX_STATE_DIR to the existing task state directory; relative arguments resolve there.'},null,2));
}else if(!allowed.has(tool)){
 console.error('Unknown packaged tool');process.exitCode=1;
}else if(!process.env.YMZX_STATE_DIR){
 console.error('Set YMZX_STATE_DIR to an explicit existing task directory');process.exitCode=1;
}else{
 const state=fs.realpathSync(process.env.YMZX_STATE_DIR);
 if(!fs.statSync(state).isDirectory())throw Error('State must be a directory');
 fs.mkdirSync(path.join(state,'evidence'),{recursive:true});
 const result=spawnSync(process.execPath,[path.join(dir,tool+'.mjs'),...args],{cwd:state,env:process.env,stdio:'inherit',shell:false});
 if(result.error)throw result.error;
 process.exitCode=result.status??1;
}
