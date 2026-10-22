// Resolve each menu from this session. UObject paths are never persisted as IDs.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {widgetRoots} from './native-ui-inspect.mjs';
import {getter} from './native-remote-getters.mjs';
import {controlWidget} from './native-ui-control.mjs';
async function visibleRoot(pattern){
 const inventory=await widgetRoots(pattern),matches=[];
 for(const r of inventory.widgets){const v=await getter(r,'IsVisible'),s=await getter(r,'GetWidgetLocSize',{Widget:r});if(v.data.ReturnValue===true&&s.data.ReturnValue?.X>0&&s.data.ReturnValue?.Y>0)matches.push(r);}
 if(matches.length!==1)throw Error('Editor window is missing or ambiguous: '+pattern);
 return matches[0];
}
export async function openEditor(mode){
 if(!['coding','ui','components'].includes(mode))throw Error('Expected coding, ui or components editor');
 const top=await visibleRoot('ControlPanel_TopLeft_C_\\d+$');
 const menu=await controlWidget('click',top,'UI_UGC_SwitcherButton_moreOperation');
 const tools=await visibleRoot('UI_UGCEditor_Tools_C_\\d+$');
 const selector={coding:'UI_UGC_SwitcherButton_UGCProgramme',ui:'UI_UGC_SwitcherButton_UIEditor',components:'UI_UGC_SwitcherButton_ComponeneManager'}[mode];
 const entry=await controlWidget('click',tools,selector);
 let reminderJournal;
 if(mode==='coding'){
  const reminders=await widgetRoots('SettingRemind_Pop_JoinMidway_C_\\d+$');
  for(const reminder of reminders.widgets){
   const v=await getter(reminder,'IsVisible'),s=await getter(reminder,'GetWidgetLocSize',{Widget:reminder});
   if(v.data.ReturnValue===true&&s.data.ReturnValue?.X>0&&s.data.ReturnValue?.Y>0)reminderJournal=(await controlWidget('click',reminder,'UI_CommonBtn_Confirm')).file;
  }
 }
 return {mode,menuJournal:menu.file,entryJournal:entry.file,reminderJournal,requested:true,resultVerified:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(await openEditor(process.argv[2]),null,2));}catch(error){console.error(error.message);process.exitCode=1;}
}
