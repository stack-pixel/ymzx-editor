// Property rows are pooled: resolve their labels again after every edit.
import {widgetRoots} from './native-ui-inspect.mjs';
import {getter} from './native-remote-getters.mjs';
import {nativeTextValue} from './native-text.mjs';
export async function findProperty(panelRoot,title){
 if(typeof title!=='string'||!title||title.length>120)throw Error('Exact property title required');
 const inventory=await widgetRoots();if(!inventory.widgets.includes(panelRoot))throw Error('Property panel is stale');
 const tree=await getter(panelRoot,'FindAllWidgetsRecursive',{Root:panelRoot});
 if(tree.status!==200||!Array.isArray(tree.data.ReturnValue))throw Error('Property panel read failed');
 const paths=[...new Set(tree.data.ReturnValue)],matches=[];
 for(const p of paths.filter(p=>p.endsWith('.w_txt_Title')&&/UI_UGC_AdvanceItem_(?:TextInput_(?:(?:Int|Float|History)_)?|Slider_)C_\d+\.WidgetTree\./.test(p))){
  const text=await getter(p,'GetText');if(text.status!==200||nativeTextValue(text.data.ReturnValue)!==title)continue;
  const size=await getter(panelRoot,'GetWidgetLocSize',{Widget:p});if(!(size.data.ReturnValue?.X>0&&size.data.ReturnValue?.Y>0))continue;
  const root=p.split('.WidgetTree.')[0],slider=/Slider_C_/.test(root),kind=slider||/TextInput_(Int|Float)_C_/.test(root)?'number':'text';
  const values=paths.filter(q=>q.startsWith(root+'.WidgetTree.')&&q.endsWith(slider?'.w_txt_btnValue':kind==='number'?'.w_txt_content':'.w_editBox_input'));
  if(values.length!==1)throw Error('Property value is missing or ambiguous');
  matches.push({world:inventory.world,panelRoot,title,root,kind,selector:values[0]});
 }
 if(matches.length!==1)throw Error('Rendered property title is missing or ambiguous: '+title);
 const after=await widgetRoots();if(after.world!==inventory.world||!after.widgets.includes(panelRoot))throw Error('Property panel changed during inspection');
 return matches[0];
}
