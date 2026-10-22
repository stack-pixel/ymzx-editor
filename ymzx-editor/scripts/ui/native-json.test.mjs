import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNativeJson} from './native-json.mjs';
test('native IDs retain every digit and never collide after JSON decoding',()=>{
 const parsed=parseNativeJson('{"GameUID":10000000000000001,"Other":10000000000000002,"negative":-9223372036854775808,"max":9223372036854775807}');
 assert.equal(parsed.GameUID,'10000000000000001');assert.equal(parsed.Other,'10000000000000002');assert.notEqual(parsed.GameUID,parsed.Other);
 assert.equal(parsed.negative,'-9223372036854775808');assert.equal(parsed.max,'9223372036854775807');
});
test('transforms, safe IDs, decimals, booleans and string contents keep their types',()=>{
 const raw='{"id":4947,"safe":9007199254740991,"safeNegative":-9007199254740991,"x":-12.25,"r":1.25e-3,"enabled":true,"text":"ID 10000000000000001 \\"quote\\"","path":"C:\\\\Maps"}';
 assert.deepEqual(parseNativeJson(raw),JSON.parse(raw));
 const data=parseNativeJson('[0,-0,3.5,9223372036854775807,"9223372036854775807",null]');assert.equal(typeof data[3],'string');assert(Object.is(data[1],-0));
});
test('invalid JSON stays rejected rather than being repaired into valid data',()=>{
 for(const raw of ['{','{"x":01}','{"x":NaN}','{"x":undefined}','{"x":9223372036854775807abc}','"unterminated','[1,]'])assert.throws(()=>parseNativeJson(raw));
});
