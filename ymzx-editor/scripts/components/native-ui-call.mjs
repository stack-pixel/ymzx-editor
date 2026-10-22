import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
// Native reflected calls only. The supplied complete argument list is validated.
import {query} from './native-remote-read.mjs';
import {validateNativeArguments} from './native-reflection-validation.mjs';
export async function call(objectPath,functionName,parameters={}) {
 const s=await query('/remote/object/describe',{objectPath});
 if(s.status!==200)throw Error('Object absent: '+objectPath);
 const f=s.data.Functions.find(f=>f.Name===functionName);
 if(!f)throw Error('Function absent: '+functionName);
 validateNativeArguments(f,parameters);
 const r=await fetch('http://127.0.0.1:30010/remote/object/call',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({objectPath,functionName,parameters,generateTransaction:false}),signal:AbortSignal.timeout(10000)});
 const data=await r.json();
 if(!r.ok)throw Error(functionName+': '+r.status+' '+JSON.stringify(data));
 return {status:r.status,data};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [objectPath,functionName,parametersFile,...extra]=process.argv.slice(2);
 try{
  if(objectPath==='help'||!objectPath){console.log('Use OBJECT_PATH FUNCTION_NAME [PARAMETERS_JSON_FILE]; complete reflected arguments required');}
  else{
   if(!objectPath.startsWith('/')||objectPath.length>4096||!functionName||!/^[A-Za-z_]\w*$/.test(functionName)||extra.length)throw Error('Expected current object path, native function name, and optional parameters JSON file');
   if(parametersFile&&fs.statSync(parametersFile).size>1048576)throw Error('Parameters file exceeds 1MiB');
   const parameters=parametersFile?JSON.parse(fs.readFileSync(parametersFile,'utf8').replace(/^\uFEFF/,'')):{};
   if(!parameters||Array.isArray(parameters)||typeof parameters!=='object')throw Error('Parameters must be a JSON object');
   console.log(JSON.stringify(await call(objectPath,functionName,parameters),null,2));
  }
 }catch(error){console.error(JSON.stringify({error:error.message}));process.exitCode=1;}
}
