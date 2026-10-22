import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {findProperty} from './native-property-inspect.mjs';
import {setNumericField} from './native-numeric-control.mjs';
import {controlWidget} from './native-ui-control.mjs';
export async function editProperty(panelRoot,title,value){
 const property=await findProperty(panelRoot,title);
 if(property.kind==='number')return setNumericField(property.root,value,{panelRoot,expectedTitle:title});
 return controlWidget('fill',property.root,property.selector,value,{resolveAfter:()=>findProperty(panelRoot,title)});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(await editProperty(...process.argv.slice(2)),null,2));}catch(error){console.error(error.message);process.exitCode=1;}
}
