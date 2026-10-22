import test from 'node:test';
import assert from 'node:assert/strict';
import {invokeButton} from './native-ui-delegate.mjs';
test('non-button Widgets are rejected before sending any mutation',async t=>{
 const original=globalThis.fetch;let calls=0;
 t.after(()=>{globalThis.fetch=original;});
 globalThis.fetch=async(url,options)=>{calls++;assert.equal(new URL(url).pathname,'/remote/object/describe');return {status:200,text:async()=>JSON.stringify({Class:'/Script/UMG.Widget',Functions:[{Name:'SetIsEnabled'}]})};};
 await assert.rejects(()=>invokeButton('/Engine/Transient.Test.WidgetTree.Panel_Ugc_Btn_Tab'),/UMG.Button/);
 assert.equal(calls,1);
});
