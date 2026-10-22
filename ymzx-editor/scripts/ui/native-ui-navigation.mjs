// Native editor navigation. No web page, JavaScript, OS input or Kouding bridge.
import fs from 'node:fs';
import {widgetRoots} from './native-ui-inspect.mjs';
import {getter} from './native-remote-getters.mjs';
import {query} from './native-remote-read.mjs';
import {invokeButton} from './native-ui-delegate.mjs';
import {validateNativeArguments} from './native-reflection-validation.mjs';
const library='/Script/MoeGameCore.Default__MoeBlueprintLibrary';
async function onlyRoot(pattern) {
 const candidates=(await widgetRoots(pattern)).widgets, visible=[];
 for(const p of candidates) if((await getter(p,'IsVisible')).data.ReturnValue) visible.push(p);
 if(visible.length!==1) throw Error('Expected one visible native window: '+pattern);
 return visible[0];
}
export async function closeNativeBrowser() {
 const root=await onlyRoot('\\.UI_EditorWebView_C_[0-9]+$');
 const objectPath=root+'.WidgetTree.UI_CommonBtn_Back.WidgetTree.w_btn_CommonBtn';
 const tree=await getter(root,'FindAllWidgetsRecursive',{Root:root});
 if(!tree.data.ReturnValue.includes(objectPath)) throw Error('Observed native back button is absent');
 const schema=await query('/remote/object/describe',{objectPath});
 if(schema.data.Class!=='/Script/UMG.Button'||!(await getter(objectPath,'GetIsEnabled')).data.ReturnValue) throw Error('Native back button is unavailable');
 const s=await query('/remote/object/describe',{objectPath:library});
 const fn=s.data.Functions.find(f=>f.Name==='TriggerButtonClicked'),parameters={Button:objectPath};
 validateNativeArguments(fn,parameters);
 // The native back control is intentionally unrendered in this window mode.
 // Its observed OnInitializedEvent binding closes the window without a pointer event.
 const record={at:new Date().toISOString(),root,objectPath,source:'UI_EditorWebView.lua OnInitializedEvent -> OnClickedBtnBack -> CloseWebview',operation:fn.Name,nativeDelegateOnly:true,dispatched:false};
 const file='evidence/ui-native-close-window-'+Date.now()+'.json';
 fs.writeFileSync(file,JSON.stringify(record,null,2),{flag:'wx'});
 const r=await fetch('http://127.0.0.1:30010/remote/object/call',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({objectPath:library,functionName:fn.Name,parameters,generateTransaction:false}),signal:AbortSignal.timeout(10000)});
 record.status=r.status;record.response=await r.json();record.dispatched=r.ok;
 await new Promise(a=>setTimeout(a,300));
 record.visibleAfter=(await getter(root,'IsVisible')).data.ReturnValue;
 fs.writeFileSync(file,JSON.stringify(record,null,2));
 if(!r.ok||record.visibleAfter!==false) throw Error('Native close was not verified: '+file);
 return {file,...record};
}
export async function openNativeUIEditor() {
 const top=await onlyRoot('\\.UI_UGCEditor_ControlPanel_TopLeft_C_[0-9]+$');
 const menu=await invokeButton(top+'.WidgetTree.UI_UGC_SwitcherButton_moreOperation.WidgetTree.w_btn_click');
 const tools=await onlyRoot('\\.UI_UGCEditor_Tools_C_[0-9]+$');
 const entry=await invokeButton(tools+'.WidgetTree.UI_UGC_SwitcherButton_UIEditor.WidgetTree.w_btn_click');
 const root=await onlyRoot('\\.UI_UGC_UIEditor_C_[0-9]+$');
 return {root,menuRecord:menu.file,entryRecord:entry.file,visibleVerified:true};
}
if(process.argv[1]?.endsWith('native-ui-navigation.mjs')) {
 const mode=process.argv[2];
 if(!['close-browser','open-ui'].includes(mode)) throw Error('Use close-browser or open-ui');
 console.log(JSON.stringify(await (mode==='close-browser'?closeNativeBrowser():openNativeUIEditor()),null,2));
}
