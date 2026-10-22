const tabs=['appearance','startup','data','about'];
export function selectSettingsTab(tab='appearance',{focus=false}={}){
  const selected=tabs.includes(tab)?tab:'appearance';
  document.querySelectorAll('[data-settings-tab]').forEach(button=>{
    const active=button.dataset.settingsTab===selected;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
    if(active&&focus)button.focus();
  });
  document.querySelectorAll('.settings-panel').forEach(panel=>panel.hidden=panel.id!==`settings-${selected}`);
  const body=document.querySelector('#settings-dialog .dialog-body');if(body)body.scrollTop=0;
}
export function mountDesktopSettings(toast,{setReading}={}){
  const dialog=document.querySelector('#settings-dialog');
  dialog.querySelector('.settings-tabs').addEventListener('click',event=>{const button=event.target.closest('[data-settings-tab]');if(button)selectSettingsTab(button.dataset.settingsTab);});
  dialog.querySelector('.settings-tabs').addEventListener('keydown',event=>{
    const button=event.target.closest('[data-settings-tab]');if(!button||!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const index=tabs.indexOf(button.dataset.settingsTab),delta=['ArrowUp','ArrowLeft'].includes(event.key)?-1:1;
    selectSettingsTab(tabs[event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+delta+tabs.length)%tabs.length],{focus:true});
  });
  dialog.addEventListener('change',async event=>{
    const input=event.target.closest('[data-reading]');if(!input)return;input.disabled=true;
    try{await setReading(input.dataset.reading,input.checked);toast('阅读设置已保存');}catch(error){input.checked=!input.checked;toast(error.message);}finally{input.disabled=false;}
  });
  selectSettingsTab();
  if(!window.toz)return;
  const section=dialog.querySelector('#native-settings');
  section.innerHTML=[
    ['autoLaunch','登录后自动启动','仅为当前 Windows 账户设置'],
    ['startMinimized','自启动时收至托盘','保留浮窗，不弹出主界面'],
    ['closeToTray','关闭主窗口时收至托盘','从托盘选择“退出 ToZ”才会完全退出'],
    ['widgetVisible','显示桌面浮窗','在桌面查看今日与遗留待办'],
    ['widgetPinned','窗口始终置顶','仅控制浮窗窗口，不改变任务置顶']
  ].map(([key,title,note])=>`<div class="setting-row"><div><b>${title}</b><small>${note}</small></div><label class="native-switch"><input type="checkbox" data-preference="${key}" aria-label="${title}"><span></span></label></div>`).join('');
  dialog.querySelector('.browser-only-note')?.remove();
  dialog.querySelector('.reset-button')?.remove();
  dialog.querySelector('#native-window-actions').innerHTML='<button class="button secondary" data-native-action="desktop-shortcut">创建桌面快捷方式</button><button class="button secondary" data-native-action="click-through">开启鼠标穿透</button><button class="button secondary" data-native-action="recover-interaction">恢复浮窗交互</button>';
  dialog.querySelector('#native-data-actions').innerHTML='<button class="button secondary" data-native-action="open-data">打开数据目录</button><button class="button secondary" data-native-action="import">恢复 / 导入备份…</button>';
  dialog.querySelector('#native-about-actions').innerHTML='<button class="button secondary" data-native-action="quit">退出 ToZ</button>';
  section.addEventListener('change',async event=>{
    const input=event.target.closest('[data-preference]');if(!input)return;input.disabled=true;
    try{await window.toz.configure({[input.dataset.preference]:input.checked});toast('设置已保存');}catch(error){toast(error.message);}finally{input.disabled=false;await refreshDesktopSettings();}
  });
  dialog.addEventListener('click',async event=>{
    const button=event.target.closest('[data-native-action]');if(!button)return;
    try{const action=button.dataset.nativeAction,result=await window.toz.command(action==='recover-interaction'?'click-through':action,action==='click-through'?true:action==='recover-interaction'?false:undefined);if(result===true)toast(action==='click-through'?'已开启鼠标穿透，Ctrl+Alt+T 或托盘可恢复':action==='recover-interaction'?'已恢复浮窗交互':'操作已完成');await refreshDesktopSettings();}catch(error){toast(error.message);}
  });
}
export async function refreshDesktopSettings(){
  if(!window.toz)return;
  const settings=await window.toz.settings();
  document.querySelectorAll('[data-preference]').forEach(input=>{input.checked=!!settings[input.dataset.preference];});
  document.querySelector('#native-data-path').textContent=settings.dataPath;
  document.querySelector('#native-version').textContent=`ToZ ${settings.version} · Windows 离线客户端`;
  document.querySelector('#startup-warning').textContent=settings.autoLaunch&&!settings.startupEnabled?'自启动已被 Windows 禁用，请在任务管理器的“启动应用”中启用 ToZ。':'';
  return settings;
}
