import test from 'node:test';
import assert from 'node:assert/strict';
import {auditLayout} from './ui-layout-audit.mjs';
const widget=(extra={})=>({id:'icon',x:20,y:20,width:104,height:104,image:{width:1254,height:1254},...extra});
const input=widgets=>({viewport:{width:1920,height:1080},safeInsets:{left:16,right:16,top:16,bottom:16},widgets});
test('square image in square rendered content passes',()=>assert(auditLayout(input([widget()])).passed));
test('historical 116 by 104 rectangle rejects square image',()=>{
 const r=auditLayout(input([widget({width:116})]));assert(!r.passed);assert(r.violations.some(v=>v.rule==='image-aspect-distortion'));
});
test('non-square source retains its own aspect',()=>assert(auditLayout(input([widget({width:116,height:58,image:{width:800,height:400}})])).passed));
test('safe edges reject left and right clipping',()=>{
 const r=auditLayout(input([widget({x:-10}),widget({id:'other',x:1850})]));assert.equal(r.violations.filter(v=>v.rule==='outside-safe-area').length,2);
});
test('child inside viewport can still overflow parent',()=>{
 const r=auditLayout(input([widget({id:'panel',image:undefined,width:400,height:300}),widget({x:350,parentId:'panel'})]));assert(r.violations.some(v=>v.rule==='outside-parent'));
});
test('hidden widgets ignored, visible zero geometry rejected',()=>{
 assert(auditLayout(input([widget({x:-500,visible:false})])).passed);
 assert(!auditLayout(input([widget({width:0})])).passed);
});
test('uniform ancestor scaling passes, nonuniform scaling fails',()=>{
 const w=widget();assert(auditLayout(input([{...w,width:156,height:156}])).passed);
 assert(!auditLayout(input([{...w,width:156,height:130}])).passed);
});
test('invalid geometry and duplicate identities rejected',()=>{
 assert.throws(()=>auditLayout(input([widget({width:NaN})])));
 assert.throws(()=>auditLayout(input([widget(),widget()])));
 assert.throws(()=>auditLayout({...input([]),safeInsets:{left:1920}}));
});
