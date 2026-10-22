export function mountDesktopSettings(toast){
  if(!window.toz)return;
  const dialog=document.querySelector('#settings-dialog');
  const body=dialog.querySelector('.dialog-body');
  dialog.querySelector('h2').textContent='设置';
  const section=document.createElement('div');section.className='native-settings';section.id='native-settings';
  section.innerHTML=[
    ['autoLaunch','开机自启动','登录 Windows 后自动运行 ToZ'],
    ['startMinimized','自启动时收至托盘','开机时保留浮窗，不弹出主界面'],
    ['closeToTray','关闭主窗口时收至托盘','从托盘菜单选择退出可完全关闭'],
    ['widgetVisible','显示桌面浮窗','在桌面查看今日与遗留待办'],
    ['widgetPinned','浮窗始终置顶','显示在其他普通窗口上方']
  ].map(([key,title,note])=>`<div class="setting-row"><div><b>${title}</b><small>${note}</small></div><label class="native-switch"><input type="checkbox" data-preference="${key}" aria-label="${title}"><span></span></label></div>`).join('');
  body.prepend(section);
  dialog.querySelector('.reset-button')?.remove();
  dialog.querySelector('.prototype-note').remove();
  const actions=document.createElement('div');actions.className='native-actions';
  actions.innerHTML='<button class="button secondary" data-native-action="desktop-shortcut">创建桌面快捷方式</button><button class="button secondary" data-native-action="open-data">打开数据目录</button><button class="button secondary" data-native-action="import">恢复 / 导入备份</button><button class="button secondary" data-native-action="click-through">浮窗鼠标穿透</button><button class="button secondary" data-native-action="quit">退出 ToZ</button>';
  body.append(actions);
  const info=document.createElement('div');info.className='native-info';info.innerHTML='数据仅保存在本机 SQLite 数据库。每日自动备份保留 14 天。<br>Ctrl+Alt+T 可显示浮窗并解除鼠标穿透。<div class="native-data-path" id="native-data-path"></div>';body.append(info);
  section.addEventListener('change',async event=>{
    const input=event.target.closest('[data-preference]');if(!input)return;input.disabled=true;
    try{await window.toz.configure({[input.dataset.preference]:input.checked});toast('设置已保存');}catch(error){input.checked=!input.checked;toast(error.message);}finally{input.disabled=false;await refreshDesktopSettings();}
  });
  actions.addEventListener('click',async event=>{
    const button=event.target.closest('[data-native-action]');if(!button)return;
    try{const result=await window.toz.command(button.dataset.nativeAction,button.dataset.nativeAction==='click-through'?true:undefined);if(result===true)toast(button.dataset.nativeAction==='click-through'?'已开启鼠标穿透，Ctrl+Alt+T 可恢复':'操作已完成');}catch(error){toast(error.message);}
  });
}
export async function refreshDesktopSettings(){
  if(!window.toz)return;
  const settings=await window.toz.settings();
  document.querySelectorAll('[data-preference]').forEach(input=>{input.checked=!!settings[input.dataset.preference];});
  document.querySelector('#native-data-path').textContent=`版本 ${settings.version} · ${settings.dataPath}${settings.autoLaunch&&!settings.startupEnabled?' · 自启动已被 Windows 系统禁用，请在任务管理器中启用':''}`;
  return settings;
}
