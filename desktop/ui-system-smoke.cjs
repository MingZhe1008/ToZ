const fs=require('node:fs');
const path=require('node:path');
module.exports=async({store,mainWindow,widgetWindow,getSettings,broadcast,outputDirectory})=>{
  const checks=[],layouts=[],errors=[];
  const js=(window,code)=>window.webContents.executeJavaScript(code);
  const check=(pass,label)=>{if(!pass)throw new Error(label);checks.push(label);};
  const wait=async fn=>{for(let i=0;i<100;i++){if(await fn())return;await new Promise(resolve=>setTimeout(resolve,80));}throw new Error('系统界面等待超时');};
  const shot=async(window,name)=>{window.show();await js(window,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');fs.writeFileSync(path.join(outputDirectory,name),(await window.webContents.capturePage()).toPNG());};
  mainWindow.webContents.on('console-message',d=>{if(d.level==='error')errors.push(d.message);});
  check(await js(mainWindow,`[...document.querySelectorAll('.desktop-titlebar [data-menu]')].map(b=>b.textContent).join('/')==='ToZ/任务/视图/帮助'`),'标题栏提供 ToZ / 任务 / 视图 / 帮助');
  await js(mainWindow,`document.querySelector('[data-menu="toz"]').click()`);
  check(await js(mainWindow,`!!document.querySelector('[data-context-command="app-settings"]')&&!!document.querySelector('[data-context-command="app-import"]')&&document.querySelector('[data-menu="toz"]').getAttribute('aria-expanded')==='true'`),'ToZ 菜单包含设置、备份和退出的真实入口');
  await shot(mainWindow,'menu-toz.png');
  await js(mainWindow,`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))`);
  check(await js(mainWindow,`document.querySelector('[data-menu="task"]').getAttribute('aria-expanded')==='true'&&!!document.querySelector('[data-context-command="app-new"]')`),'菜单左右方向键切换分组');
  await js(mainWindow,`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  check(await js(mainWindow,`document.activeElement.dataset.menu==='task'&&document.querySelector('[data-menu="task"]').getAttribute('aria-expanded')==='false'`),'Escape 收起菜单并还原焦点');
  await js(mainWindow,`document.querySelector('[data-menu="view"]').click();document.querySelector('[data-context-command="app-calendar"]').click()`);
  check(await js(mainWindow,`!document.querySelector('#calendar-view').hidden`),'视图菜单切换真实日历');
  await js(mainWindow,`document.querySelector('[data-menu="help"]').click();document.querySelector('[data-context-command="app-data"]').click()`);
  await wait(()=>getSettings()&&!getSettings().webContents.isLoading());
  const settings=getSettings();settings.webContents.on('console-message',d=>{if(d.level==='error')errors.push(d.message);});
  await wait(async()=>await js(settings,`document.querySelector('#settings-dialog').open&&!document.querySelector('#settings-data').hidden`));
  check(await js(mainWindow,`!document.querySelector('#settings-dialog').open`),'主窗口的设置入口打开独立窗口');
  check(await js(settings,`window.toz.surface==='settings'&&document.querySelectorAll('.settings-tabs [role=tab]').length===4&&!!document.querySelector('[data-native-action="import"]')`),'独立设置包含四个分类与真实恢复入口');
  await js(settings,`document.querySelector('#settings-data [data-action="trash"]').click()`);
  check(await js(settings,`document.querySelector('#trash-dialog').open&&document.querySelector('#settings-dialog').open`),'设置内打开回收站保留设置窗口');
  await js(settings,`document.querySelector('#trash-dialog [data-close]').click()`);
  check(getSettings()===settings&&!settings.isDestroyed(),'关闭回收站可返回设置');
  for(const dark of [true,false]){
    const state=store.snapshot();state.dark=dark;store.commit(state,state.version);broadcast();
    await wait(async()=>await js(settings,`document.documentElement.dataset.theme==='${dark?'dark':'light'}'`));
    for(const size of [[980,700],[680,480]]){
      settings.setSize(...size);await wait(async()=>await js(settings,`Math.abs(innerWidth-${size[0]})<5`));
      const layout=await js(settings,`(()=>{const d=document.querySelector('#settings-dialog'),body=d.querySelector('.dialog-body'),tabs=d.querySelector('.settings-tabs'),r=d.getBoundingClientRect();body.scrollTop=body.scrollHeight;return{width:innerWidth,height:innerHeight,top:r.top,bottom:r.bottom,noOverflow:document.documentElement.scrollWidth<=innerWidth,bodyScrolls:body.scrollHeight>body.clientHeight,tabsVisible:tabs.getBoundingClientRect().top>=38};})()`);
      layouts.push(layout);check(layout.noOverflow&&layout.top===38&&layout.bottom<=layout.height&&layout.tabsVisible,`${dark?'深':'浅'}色 ${size.join('×')} 设置内容独立滚动、侧栏固定 ${JSON.stringify(layout)}`);
    }
    settings.setSize(980,700);await js(settings,`document.querySelector('#settings-dialog .dialog-body').scrollTop=0`);await shot(settings,`settings-data-${dark?'dark':'light'}.png`);
  }
  const state=store.snapshot();state.dark=true;store.commit(state,state.version);broadcast();
  mainWindow.hide();await js(widgetWindow,`window.toz.command('open-settings',{tab:'appearance'})`);
  check(getSettings()===settings&&!mainWindow.isVisible(),'从浮窗打开设置复用窗口，不唤起主窗口');
  await wait(async()=>await js(settings,`!document.querySelector('#settings-appearance').hidden`));
  await js(settings,`document.querySelector('[data-reading="largeText"]').click()`);await wait(()=>store.settings().largeText);
  await wait(async()=>await js(widgetWindow,`document.documentElement.classList.contains('large-text')`));
  check(true,'独立设置的较大文字同步浮窗');
  await js(settings,`document.querySelector('[data-settings-tab="startup"]').click()`);
  check(await js(settings,`!!document.querySelector('[data-preference="closeToTray"]')&&!document.querySelector('#settings-startup').hidden`),'启动与窗口保留真实系统选项');
  settings.close();await wait(()=>!getSettings());check(!mainWindow.isVisible(),'关闭设置只关闭设置窗口');
  await js(widgetWindow,`window.toz.command('open-settings',{tab:'about'})`);await wait(()=>getSettings()&&!getSettings().webContents.isLoading());
  await wait(async()=>await js(getSettings(),`!document.querySelector('#settings-about').hidden`));
  check(getSettings()!==settings,'关闭后可重新创建设置窗口');
  check(errors.length===0,'菜单和独立设置定向流程无控制台错误');
  return{checks,layouts,errors,dataDirectory:store.directory,scope:'menus and standalone settings only; no complete smoke, real installation or startup changes'};
};
