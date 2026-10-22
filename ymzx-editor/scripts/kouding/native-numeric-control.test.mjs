import test from 'node:test';
import assert from 'node:assert/strict';
import {numericTokens,setNumericField} from './native-numeric-control.mjs';
test('numeric keypad input preserves signed decimals and rejects exponent or injected tokens',()=>{
 assert.deepEqual(numericTokens('-12.5'),['-','1','2','.','5']);
 for(const v of ['1e4','Infinity','12{ENTER}','01','1.1234567',1,undefined])assert.throws(()=>numericTokens(v),/decimal/);
});
test('invalid property requests stop without contacting the game',async()=>{
 await assert.rejects(setNumericField('/stale-unknown','25'),/property root/);
});
