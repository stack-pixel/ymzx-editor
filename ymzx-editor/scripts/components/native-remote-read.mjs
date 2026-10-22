// Read-only discovery of the game's existing Unreal Remote Control service.
import fs from 'node:fs';
import {parseNativeJson} from './native-json.mjs';
const base='http://127.0.0.1:30010';
export async function query(route,body){
 if(!['/remote/info','/remote/presets','/remote/object/describe','/remote/object/property','/remote/search/assets'].includes(route))throw Error('Read-only route required');
 if(route==='/remote/object/property'&&(body?.access!=='READ_ACCESS'||'propertyValue' in body))throw Error('Read access required');
 const r=await fetch(base+route,{method:body?'PUT':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});
 const raw=await r.text();let data;try{data=parseNativeJson(raw);}catch{data=raw;}
 return {status:r.status,data};
}
if(process.argv[1]?.endsWith('native-remote-read.mjs')){
 const [command,target,property]=process.argv.slice(2);
 const result=command==='describe'?await query('/remote/object/describe',{objectPath:target}):command==='property'?await query('/remote/object/property',{objectPath:target,propertyName:property||'',access:'READ_ACCESS'}):command==='assets'?await query('/remote/search/assets',{Query:target,Filter:{},Limit:30}):await query('/remote/info');
 const dest='evidence/native-remote-'+command+'-'+(target||'routes').replace(/[^a-zA-Z0-9_-]/g,'_')+'.json';fs.writeFileSync(dest,JSON.stringify(result,null,2));
 console.log(JSON.stringify({file:dest,status:result.status,name:result.data?.Name,class:result.data?.Class,properties:result.data?.Properties?.map(p=>({name:p.Name,type:p.Type})),functions:result.data?.Functions?.map(f=>f.Name),error:result.data?.errorMessage,other:result.data?.Name?undefined:result.data},null,2));
}
