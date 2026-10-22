// Native component operations only; no Kouding bridge or runtime spawning.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const dir=path.dirname(fileURLToPath(import.meta.url));
const allowed=new Set(['native-scene-snapshot','native-scene-placement','native-editor-palette','native-ui-inspect','native-ui-control','native-ui-call','native-ui-delegate','native-property-control','native-property-inspect','native-numeric-control','native-remote-read','native-remote-getters']);
const [tool,...args]=process.argv.slice(2);
if(!tool||tool==='help')console.log(JSON.stringify({tools:[...allowed],state:'Set YMZX_STATE_DIR to the existing task directory. Relative paths resolve there. Full-map save/reopen is separate.'},null,2));
else if(!allowed.has(tool)){console.error('Unknown packaged component tool');process.exitCode=1;}
else if(!process.env.YMZX_STATE_DIR){console.error('Set YMZX_STATE_DIR to an explicit existing task directory');process.exitCode=1;}
else{
 const state=fs.realpathSync(process.env.YMZX_STATE_DIR);
 if(!fs.statSync(state).isDirectory())throw Error('State must be a directory');
 fs.mkdirSync(path.join(state,'evidence'),{recursive:true});
 const result=spawnSync(process.execPath,[path.join(dir,tool+'.mjs'),...args],{cwd:state,env:process.env,stdio:'inherit',shell:false});
 if(result.error)throw result.error;process.exitCode=result.status??1;
}
