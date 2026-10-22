// Audit final rendered rectangles only. Does not edit layouts or call the game.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const number=(v,name,minimum=0)=>{
 if(typeof v!=='number'||!Number.isFinite(v)||v<minimum)throw Error('Invalid '+name);
 return v;
};
export function auditLayout(input){
 if(!input||!Array.isArray(input.widgets)||input.widgets.length>10000)throw Error('widgets array required, maximum 10000');
 const width=number(input.viewport?.width,'viewport.width',Number.MIN_VALUE),height=number(input.viewport?.height,'viewport.height',Number.MIN_VALUE);
 const insets=Object.fromEntries(['left','top','right','bottom'].map(k=>[k,number(input.safeInsets?.[k]??0,'safeInsets.'+k)]));
 const safe={x:insets.left,y:insets.top,width:width-insets.left-insets.right,height:height-insets.top-insets.bottom};
 if(safe.width<=0||safe.height<=0)throw Error('Safe area is empty');
 const pixelTolerance=number(input.pixelTolerance??0.5,'pixelTolerance'),aspectTolerance=number(input.aspectTolerance??0.02,'aspectTolerance');
 if(pixelTolerance>2||aspectTolerance>0.05)throw Error('Tolerance exceeds supported audit range');
 const seen=new Map();
 for(const w of input.widgets){
  if(!w||typeof w.id!=='string'||!w.id||seen.has(w.id))throw Error('Unique string widget ids required');
  if(w.visible!==undefined&&typeof w.visible!=='boolean')throw Error('visible must be boolean');
  for(const k of ['x','y'])if(typeof w[k]!=='number'||!Number.isFinite(w[k]))throw Error('Invalid widget '+k);
  for(const k of ['width','height'])number(w[k],'widget.'+k);
  if(w.image){number(w.image.width,'image.width',Number.MIN_VALUE);number(w.image.height,'image.height',Number.MIN_VALUE);}
  seen.set(w.id,w);
 }
 const violations=[];
 const inside=(w,r)=>w.x>=r.x-pixelTolerance&&w.y>=r.y-pixelTolerance&&w.x+w.width<=r.x+r.width+pixelTolerance&&w.y+w.height<=r.y+r.height+pixelTolerance;
 let checkedWidgets=0,checkedImages=0;
 for(const w of input.widgets){
  if(w.visible===false)continue;checkedWidgets++;
  if(!(w.width>0&&w.height>0))violations.push({id:w.id,rule:'zero-rendered-size'});
  if(!inside(w,safe))violations.push({id:w.id,rule:'outside-safe-area'});
  if(w.parentId!==undefined){
   const parent=seen.get(w.parentId);
   if(!parent||parent.visible===false)violations.push({id:w.id,rule:'missing-visible-parent'});
   else if(!inside(w,parent))violations.push({id:w.id,rule:'outside-parent'});
  }
  if(w.image){
   checkedImages++;
   const relativeAspectError=w.height>0?Math.abs((w.width/w.height)/(w.image.width/w.image.height)-1):null;
   if(relativeAspectError===null||relativeAspectError>aspectTolerance)violations.push({id:w.id,rule:'image-aspect-distortion',relativeAspectError});
  }
 }
 return {passed:violations.length===0,checkedWidgets,checkedImages,safeArea:safe,pixelTolerance,aspectTolerance,violations,scope:'Geometry and image aspect only; no game rendering, click, text readability or general occlusion proof.'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [source,out,...rest]=process.argv.slice(2);if(!source||rest.length)throw Error('Use ui-layout-audit INPUT_JSON [OUTPUT_JSON]');
  const result=auditLayout(JSON.parse(fs.readFileSync(source,'utf8').replace(/^\uFEFF/,'')));
  if(out)fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(out?{file:out,...result}:result,null,2));
  if(!result.passed)process.exitCode=2;
 }catch(error){console.error(JSON.stringify({error:error.message}));process.exitCode=1;}
}
