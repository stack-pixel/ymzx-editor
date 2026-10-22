// Decode Unreal's FText wire notation without evaluating native expressions.
export function nativeTextValue(raw) {
 if(typeof raw!=='string')return raw;
 const match=raw.match(/^(INVTEXT|NSLOCTEXT|LOCTEXT)\(([\s\S]*)\)$/);
 if(!match)return raw;
 try{
  const args=JSON.parse('['+match[2]+']');
  const counts={INVTEXT:1,NSLOCTEXT:3,LOCTEXT:2};
  return args.length===counts[match[1]]&&args.every(v=>typeof v==='string')?args.at(-1):raw;
 }catch{return raw;}
}
