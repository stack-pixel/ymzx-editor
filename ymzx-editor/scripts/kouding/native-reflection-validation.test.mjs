import test from 'node:test';
import assert from 'node:assert/strict';
import {validateNativeArguments} from './native-reflection-validation.mjs';
import {getter} from './native-remote-getters.mjs';
const fn={Name:'FindAllWidgetsRecursive',Arguments:[{Name:'Root',Type:'UUserWidget*',ContainerType:'',MetaData:{}}]};
test('widget-tree reads reject missing and null roots before native invocation',()=>{
 for(const params of [{},{Root:null},{Root:''},{Root:'None'},{Root:17},{Root:'/Engine/X',extra:true}])assert.throws(()=>validateNativeArguments(fn,params));
 assert.deepEqual(validateNativeArguments(fn,{Root:'/Engine/Transient.Widget'}),{Root:'/Engine/Transient.Widget'});
});
test('native getters never submit an incomplete reflected request',async()=>{
 const original=globalThis.fetch,seen=[];
 globalThis.fetch=async(url,options)=>{seen.push(String(url));assert(String(url).endsWith('/remote/object/describe'));return {status:200,text:async()=>JSON.stringify({Functions:[fn]})};};
 try {await assert.rejects(getter('/Engine/Transient.Root','FindAllWidgetsRecursive',{}),/Missing native argument: Root/);assert.equal(seen.length,1);}finally{globalThis.fetch=original;}
});
test('native scalar arguments retain exact types and reject nonfinite numbers',()=>{
 const schema={Arguments:[{Name:'Enabled',Type:'bool'},{Name:'Rate',Type:'float'},{Name:'Count',Type:'int32'},{Name:'Id',Type:'int64'}]};
 const good={Enabled:true,Rate:1.5,Count:3,Id:'10000000000000001'};
 assert.equal(validateNativeArguments(schema,good),good);
 for(const bad of [{...good,Enabled:1},{...good,Rate:NaN},{...good,Count:1.2},{...good,Id:9007199254740992}])assert.throws(()=>validateNativeArguments(schema,bad));
});
