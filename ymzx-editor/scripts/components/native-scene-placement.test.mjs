import test from 'node:test';
import assert from 'node:assert/strict';
import {actorIn,validatePlacements,verifyOriginals,windowPoint} from './native-scene-placement.mjs';
const pose={Translation:{X:0,Y:0,Z:0},Scale3D:{X:1,Y:1,Z:1},Rotation:{X:0,Y:0,Z:0,W:1}};
const before={world:'/Game/Test.LetsGo_Level_UGCEditor',objects:[{id:'207',objectPath:'/Game/Test:PersistentLevel.Cube_1',transform:pose}]};
test('Scene identity rejects runtime worlds, absent, duplicate and system IDs',()=>{
 assert.equal(actorIn(before,'207').objectPath,before.objects[0].objectPath);
 for(const id of ['0','-99','208','2147483648',207])assert.throws(()=>actorIn(before,id));
 assert.throws(()=>actorIn({...before,world:'/Game/Play'},'207'));
 assert.throws(()=>actorIn({...before,objects:[...before.objects,...before.objects]},'207'));
});
test('Only owned placements with exact finite transform fields pass',()=>{
 const c={id:'228',position:[600,700,0],rotation:[0,0,30],scale:[3,2,.6]};
 assert.deepEqual(validatePlacements([c],['228']),[c]);
 for(const changes of [[],[c,c],[{...c,id:'207'}],[{...c,scale:[0,1,1]}],[{...c,position:[Infinity,0,0]}],[{...c,rotation:[0,NaN,0]}],[{...c,execute:'code'}]])assert.throws(()=>validatePlacements(changes,['228']));
});
test('Original guard detects removal, same-ID object replacement and concurrent movement',()=>{
 verifyOriginals(before,structuredClone(before));
 const replacement=structuredClone(before);replacement.objects[0].objectPath+='_new';assert.throws(()=>verifyOriginals(before,replacement));
 const moved=structuredClone(before);moved.objects[0].transform.Translation.X=1;assert.throws(()=>verifyOriginals(before,moved));
 assert.throws(()=>verifyOriginals(before,{...before,objects:[]}));
 assert.throws(()=>verifyOriginals(before,{...before,world:'/Game/Other'}));
});
test('Scene projection maps desktop physical client origin into whole-window input',()=>{
 const c={width:1294,height:758,left:3233,top:335,clientLeft:3242,clientTop:373,clientWidth:1276,clientHeight:711};
 assert.deepEqual(windowPoint(c,{X:3242,Y:373},{X:503.804,Y:375.228}),{x:513,y:413});
 assert.throws(()=>windowPoint(c,{X:2161,Y:249},{X:503,Y:375}));
 for(const p of [{X:-1,Y:50},{X:1280,Y:50},{X:500,Y:712},{X:NaN,Y:0}])assert.throws(()=>windowPoint(c,{X:3242,Y:373},p));
});
