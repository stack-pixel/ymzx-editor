import test from 'node:test';
import assert from 'node:assert/strict';
import {windowPoint,controlWidget} from './native-ui-control.mjs';
import {nativeTextValue} from './native-text.mjs';
const window={left:625,top:148,width:1618,height:947,clientLeft:634,clientTop:186,clientWidth:1600,clientHeight:900};
test('native desktop centers need only window translation; DPI scaling is already included',()=>{
 assert.deepEqual(windowPoint({X:1425,Y:568},window),{x:800,y:420});
 assert.throws(()=>windowPoint({X:630,Y:180},window),/outside/);
 assert.throws(()=>windowPoint({X:2250,Y:568},window),/outside/);
 assert.throws(()=>windowPoint({X:1425,Y:568},{...window,clientWidth:NaN}),/geometry/);
});
test('invalid UI requests cannot reach native calls or input',async()=>{
 await assert.rejects(controlWidget('fill','/live','field','line\nbreak'),/Single-line/);
 await assert.rejects(controlWidget('drag','/live','field',{x:NaN,y:0}),/point/);
 await assert.rejects(controlWidget('unknown','/live','field'),/Expected/);
});
test('native text wrappers decode escapes while unknown notation remains untouched',()=>{
 assert.equal(nativeTextValue('INVTEXT("Ready")'),'Ready');
 assert.equal(nativeTextValue('NSLOCTEXT("namespace", "key", "中文\\n文字")'),'中文\n文字');
 const raw='INVTEXT(console.log("unexpected"))';assert.equal(nativeTextValue(raw),raw);
 assert.equal(nativeTextValue('LOCTABLE("table","key")'),'LOCTABLE("table","key")');
});
