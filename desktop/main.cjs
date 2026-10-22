const {app,BrowserWindow,ipcMain,Tray,Menu,nativeImage,screen,dialog,shell,globalShortcut} = require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {Store}=require('./store.cjs');
const {createStartup}=require('./startup.cjs');
const {resizeWidgetHeight}=require('./widget-size.cjs');
const APP_ID='com.toz.desktop';
const smoke=process.argv.includes('--smoke-test');
const dataArg=process.argv.find(a=>a.startsWith('--toz-data='));
if(dataArg)app.setPath('userData',path.resolve(dataArg.slice(11)));
app.setName('ToZ');app.setAppUserModelId(APP_ID);
let mainWindow,widgetWindow,quickAddWindow,tray,store,startup,quitting=false,widgetIgnore=false;
const rendererReports=new Map();
const miniSamples=new Set();
const iconPath=path.join(__dirname,'..','build','icon.png');
const smokeResult=process.argv.find(a=>a.startsWith('--smoke-result='))?.slice(15);
const lock=app.requestSingleInstanceLock();
if(!lock){app.quit();}else{
  app.on('second-instance',()=>showMain());
  app.whenReady().then(start).catch(error=>{if(smokeResult)fs.writeFileSync(smokeResult,JSON.stringify({ok:false,error:error.stack}));else dialog.showErrorBox('ToZ 启动失败',error.message);app.exit(1);});
}
function startupState(){return startup.state();}
function showMain(command){if(!mainWindow)return;if(mainWindow.isMinimized())mainWindow.restore();mainWindow.show();mainWindow.focus();if(command)mainWindow.webContents.send('toz:ui-command',command);}
function titleBarTheme(dark){return {color:dark?'#252528':'#f2f2f7',symbolColor:dark?'#f5f5f7':'#1d1d1f',height:34};}
function applyTheme(){const dark=store.snapshot().dark;for(const window of [mainWindow,quickAddWindow])if(window&&!window.isDestroyed()){window.setBackgroundColor(dark?'#1c1c1e':'#ffffff');window.setTitleBarOverlay(titleBarTheme(dark));}}
function broadcast(){applyTheme();const snapshot=store.snapshot();for(const w of [mainWindow,widgetWindow,quickAddWindow])if(w&&!w.isDestroyed())w.webContents.send('toz:state',snapshot);}
function secure(window){window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('file:'))event.preventDefault();});}
function fitBounds(bounds,fallback){
  const displays=screen.getAllDisplays();
  if(bounds&&Number.isFinite(bounds.x)&&Number.isFinite(bounds.y)&&displays.some(({workArea:a})=>bounds.x+60>a.x&&bounds.x<a.x+a.width-60&&bounds.y+40>a.y&&bounds.y<a.y+a.height-40)){
    const area=screen.getDisplayMatching(bounds).workArea;
    const width=Math.min(bounds.width||fallback.width,area.width),height=Math.min(bounds.height||fallback.height,area.height);
    return {...fallback,...bounds,width,height,x:Math.max(area.x,Math.min(bounds.x,area.x+area.width-width)),y:Math.max(area.y,Math.min(bounds.y,area.y+area.height-height))};
  }
  return fallback;
}
function createWindows(){
  const primary=screen.getPrimaryDisplay().workArea;
  const common={preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:!smoke,additionalArguments:smoke?['--toz-smoke']:[]};
  mainWindow=new BrowserWindow({...fitBounds(store.meta('mainBounds',null),{width:Math.min(1200,primary.width-24),height:Math.min(820,primary.height-24)}),minWidth:960,minHeight:600,title:'ToZ',titleBarStyle:'hidden',titleBarOverlay:{color:'#f2f2f7',symbolColor:'#1d1d1f',height:34},icon:iconPath,backgroundColor:'#ffffff',show:false,autoHideMenuBar:true,webPreferences:common});
  widgetWindow=new BrowserWindow({...fitBounds(store.meta('widgetBounds',null),{x:primary.x+primary.width-356,y:primary.y+80,width:336,height:550}),minWidth:280,maxWidth:480,minHeight:64,maxHeight:900,frame:false,maximizable:false,transparent:true,backgroundColor:'#00000000',hasShadow:false,show:false,skipTaskbar:true,resizable:true,alwaysOnTop:store.settings().widgetPinned,icon:iconPath,webPreferences:{...common,additionalArguments:[...(common.additionalArguments||[]),'--toz-widget']}});
  secure(mainWindow);secure(widgetWindow);
  // Drag regions receive non-client mouse messages instead of DOM dblclick.
  widgetWindow.hookWindowMessage(0x00A3,wParam=>{if(wParam.readUInt32LE(0)===2)setImmediate(()=>setWidgetCollapsed(!store.settings().widgetCollapsed));});
  applyTheme();
  mainWindow.loadFile(path.join(__dirname,'..','prototype','index.html'));
  widgetWindow.loadFile(path.join(__dirname,'..','prototype','index.html'));
  mainWindow.on('close',event=>{if(!quitting){event.preventDefault();if(store.settings().closeToTray)mainWindow.hide();else app.quit();}});
  widgetWindow.on('close',event=>{if(!quitting){event.preventDefault();store.updateSettings({widgetVisible:false});widgetWindow.hide();rebuildTray();}});
  let timer;
  const remember=()=>{clearTimeout(timer);timer=setTimeout(()=>{if(!quitting){if(!mainWindow.isMinimized()&&!mainWindow.isMaximized())store.setMeta('mainBounds',mainWindow.getBounds());store.setMeta('widgetBounds',widgetWindow.getBounds());}},350);};
  for(const w of [mainWindow,widgetWindow]){w.on('move',remember);w.on('resize',remember);}
  mainWindow.once('ready-to-show',()=>{if(!smoke&&!(process.argv.includes('--autostart')&&store.settings().startMinimized))showMain();});
  widgetWindow.once('ready-to-show',()=>{applyWidget();});
  screen.on('display-removed',()=>{for(const w of [mainWindow,widgetWindow]){const bounds=w.getBounds(),fit=fitBounds(bounds,{...bounds,x:screen.getPrimaryDisplay().workArea.x+40,y:screen.getPrimaryDisplay().workArea.y+40});w.setBounds(fit);}});
}
async function openQuickAdd(date){
  if(quickAddWindow&&!quickAddWindow.isDestroyed()){
    if(quickAddWindow.isMinimized())quickAddWindow.restore();
    quickAddWindow.show();quickAddWindow.focus();return true;
  }
  const anchor=widgetWindow.getBounds(),area=screen.getDisplayMatching(anchor).workArea;
  const width=Math.min(500,area.width),height=Math.min(780,area.height);
  const x=Math.max(area.x,Math.min(anchor.x-width-12,area.x+area.width-width));
  const y=Math.max(area.y,Math.min(anchor.y,area.y+area.height-height));
  const dark=store.snapshot().dark;
  const window=new BrowserWindow({x,y,width,height,minWidth:360,minHeight:420,title:'新建待办 · ToZ',titleBarStyle:'hidden',titleBarOverlay:titleBarTheme(dark),icon:iconPath,show:false,autoHideMenuBar:true,backgroundColor:dark?'#1c1c1e':'#f9f9fb',alwaysOnTop:store.settings().widgetPinned,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,additionalArguments:[...(smoke?['--toz-smoke']:[]),'--toz-quick-add']}});
  quickAddWindow=window;secure(window);
  window.on('closed',()=>{if(quickAddWindow===window)quickAddWindow=null;rendererReports.delete('quick-add');});
  try{await window.loadFile(path.join(__dirname,'..','prototype','index.html'),{query:{date:date||''}});}
  catch(error){if(!window.isDestroyed())window.destroy();throw error;}
  if(!window.isDestroyed()){window.setTitle('新建待办 · ToZ');window.show();window.focus();}
  return true;
}
function applyWidget(){const settings=store.settings();widgetWindow.setAlwaysOnTop(settings.widgetPinned);if(!smoke){if(settings.widgetVisible)widgetWindow.showInactive();else widgetWindow.hide();}if(settings.widgetCollapsed)resizeWidgetHeight(widgetWindow,68);}
function rebuildTray(){if(!tray)return;const settings=store.settings();tray.setContextMenu(Menu.buildFromTemplate([
  {label:'打开 ToZ',click:()=>showMain()},
  {label:settings.widgetVisible?'隐藏桌面浮窗':'显示桌面浮窗',click:()=>{store.updateSettings({widgetVisible:!settings.widgetVisible});applyWidget();rebuildTray();broadcast();}},
  {label:'浮窗置顶',type:'checkbox',checked:settings.widgetPinned,click:item=>{store.updateSettings({widgetPinned:item.checked});applyWidget();broadcast();}},
  {label:'解除鼠标穿透',enabled:widgetIgnore,click:()=>setIgnore(false)},
  {type:'separator'},{label:'设置',click:()=>showMain({action:'settings'})},{label:'打开数据目录',click:()=>shell.openPath(store.directory)},
  {type:'separator'},{label:'退出 ToZ',click:()=>app.quit()}
]));}
function setIgnore(value){widgetIgnore=value;widgetWindow.setIgnoreMouseEvents(value,{forward:true});rebuildTray();}
function toggleWidget(){const visible=!store.settings().widgetVisible;store.updateSettings({widgetVisible:visible});if(visible)setIgnore(false);applyWidget();if(visible){widgetWindow.showInactive();widgetWindow.moveTop();}rebuildTray();broadcast();return visible;}
function setWidgetCollapsed(value){
  if(value&&widgetWindow.getContentSize()[1]>100)store.setMeta('widgetExpandedHeight',widgetWindow.getContentSize()[1]);
  store.updateSettings({widgetCollapsed:!!value});
  resizeWidgetHeight(widgetWindow,value?68:store.meta('widgetExpandedHeight',550));broadcast();
}
function trusted(event){return [mainWindow,widgetWindow,quickAddWindow].some(w=>w&&!w.isDestroyed()&&w.webContents===event.sender);}
function handlers(){
  ipcMain.on('toz:read',event=>{event.returnValue=trusted(event)?{ok:true,snapshot:store.snapshot()}:{ok:false,error:'无效窗口'};});
  ipcMain.on('toz:commit',(event,{snapshot,version})=>{
    try{if(!trusted(event))throw new Error('无效窗口');const saved=store.commit(snapshot,version);event.returnValue={ok:true,snapshot:saved,backupError:store.backupError};broadcast();}catch(error){event.returnValue={ok:false,error:error.message,snapshot:store.snapshot()};}
  });
  const handle=(channel,fn)=>ipcMain.handle(channel,async(event,...args)=>{if(!trusted(event))throw new Error('无效窗口');return fn(...args);});
  ipcMain.on('toz:purge',(event,{request,version})=>{
    try{if(!trusted(event))throw new Error('无效窗口');const result=store.purge(request,version);event.returnValue={ok:true,...result};broadcast();}catch(error){event.returnValue={ok:false,error:error.message,snapshot:store.snapshot()};}
  });
  handle('toz:settings',()=>({...store.settings(),...startupState(),dataPath:store.directory,version:app.getVersion(),packaged:app.isPackaged,clickThrough:widgetIgnore}));
  handle('toz:configure',patch=>{
    if(!patch||typeof patch!=='object')throw new Error('无效设置');
    const {autoLaunch,...rest}=patch;
    if(autoLaunch!==undefined){if(!app.isPackaged&&!smoke)throw new Error('请在安装版中设置开机自启动');startup.set(autoLaunch);}
    if(Object.keys(rest).length)store.updateSettings(rest);
    applyWidget();rebuildTray();broadcast();
    return {...store.settings(),...startupState(),dataPath:store.directory,version:app.getVersion(),packaged:app.isPackaged,clickThrough:widgetIgnore};
  });
  handle('toz:command',async(name,arg)=>{
    switch(name){
      case 'smoke-ready':if(smoke){rendererReports.set(arg.surface,arg);if(arg.surface==='widget'&&arg.collapsed&&arg.miniTask)miniSamples.add(arg.miniTask);}return true;
      case 'open-main':showMain(arg);return true;
      case 'open-quick-add':return openQuickAdd(arg?.date);
      case 'close-quick-add':quickAddWindow?.close();return true;
      case 'toggle-widget':toggleWidget();return true;
      case 'show-widget':store.updateSettings({widgetVisible:true});setIgnore(false);applyWidget();widgetWindow.showInactive();widgetWindow.moveTop();rebuildTray();broadcast();return true;
      case 'hide-widget':store.updateSettings({widgetVisible:false});applyWidget();rebuildTray();broadcast();return true;
      case 'click-through':setIgnore(!!arg);return true;
      case 'collapse-widget':setWidgetCollapsed(!!arg);return true;
      case 'quit':app.quit();return true;
      case 'open-data':return shell.openPath(store.directory);
      case 'desktop-shortcut':if(!app.isPackaged)throw new Error('请使用安装版创建快捷方式');return shell.writeShortcutLink(path.join(app.getPath('desktop'),'ToZ.lnk'),{target:process.execPath,cwd:path.dirname(process.execPath),description:'ToZ 离线待办',icon:process.execPath,iconIndex:0,appUserModelId:APP_ID});
      case 'export':{
        const choice=await dialog.showSaveDialog(mainWindow,{title:'导出完整备份',defaultPath:`ToZ-备份-${new Date().toLocaleDateString('sv-SE')}.json`,filters:[{name:'ToZ 备份',extensions:['json']}]});
        if(choice.canceled)return false;
        const snapshot=store.snapshot();if(arg?.taskId){snapshot.tasks=snapshot.tasks.filter(t=>t.id===arg.taskId);snapshot.preferences.taskOrder=snapshot.tasks.map(t=>t.id);snapshot.recurrences=snapshot.recurrences.filter(s=>snapshot.tasks.some(t=>t.repeatId===s.id)).map(s=>({...s,active:false}));}fs.writeFileSync(choice.filePath,JSON.stringify({...snapshot,settings:store.settings(),exportedAt:new Date().toISOString()},null,2));return true;
      }
      case 'import':{
        const choice=await dialog.showOpenDialog(mainWindow,{title:'恢复 ToZ / 导入原型数据',filters:[{name:'ToZ 备份',extensions:['json']}],properties:['openFile']});
        if(choice.canceled)return false;
        const filename=choice.filePaths[0];if(fs.statSync(filename).size>50*1024*1024)throw new Error('备份超过 50 MB');
        const snapshot=JSON.parse(fs.readFileSync(filename,'utf8'));
        const {validateSnapshot}=require('./store.cjs');if(snapshot.schema!==1)throw new Error('不支持此备份版本');validateSnapshot(snapshot);
        const confirm=await dialog.showMessageBox(mainWindow,{type:'question',buttons:['取消','恢复数据'],defaultId:0,cancelId:0,title:'恢复数据',message:`恢复 ${snapshot.tasks.length} 项任务及其全部历史？`,detail:'将替换当前任务。恢复前会自动保存一份当前数据的安全副本。系统自启动等本机设置保持不变。'});
        if(confirm.response!==1)return false;store.restore(snapshot);broadcast();return true;
      }
      default:throw new Error('未知操作');
    }
  });
}
async function start(){
  store=new Store(app.getPath('userData'));store.ensureRecurring();
  const recurrenceTimer=setInterval(()=>{try{if(store.ensureRecurring())broadcast();}catch(error){console.error('周期排期：'+error.message);}},30000);
  app.on('will-quit',()=>clearInterval(recurrenceTimer));
  startup=createStartup(app);
  Menu.setApplicationMenu(null);handlers();createWindows();
  if(!smoke){tray=new Tray(nativeImage.createFromPath(iconPath).resize({width:20,height:20}));tray.setToolTip('ToZ · 离线待办');tray.on('double-click',()=>showMain());rebuildTray();globalShortcut.register('CommandOrControl+Alt+T',()=>{setIgnore(false);store.updateSettings({widgetVisible:true});applyWidget();});}
  app.on('before-quit',()=>{quitting=true;});
  app.on('will-quit',()=>{globalShortcut.unregisterAll();store.close();});
  if(smoke){
    const errors=[];for(const w of [mainWindow,widgetWindow]){w.webContents.on('console-message',details=>{if(details.level==='error')errors.push(details.message);});w.webContents.on('render-process-gone',(_,details)=>errors.push(details.reason));}
    await Promise.all([mainWindow.webContents.isLoading()?new Promise(resolve=>mainWindow.webContents.once('did-finish-load',resolve)):null,widgetWindow.webContents.isLoading()?new Promise(resolve=>widgetWindow.webContents.once('did-finish-load',resolve)):null]);
    // This is an app-owned smoke test, with a separate data path and no OS startup changes.
    await new Promise(resolve=>setTimeout(resolve,1000));
    let startupCheck=null;
    if(process.argv.includes('--startup-test')){
      const name='ToZ-QA-'+crypto.randomUUID();
      const probe=createStartup(app,{name,executable:path.join(store.directory,'含 空格 路径','ToZ.exe')});
      try{const enabled=probe.set(true),disabled=probe.set(false);startupCheck={enabled,disabled,ok:enabled.autoLaunch&&enabled.startupEnabled&&!disabled.autoLaunch};}
      catch(error){errors.push('自启动验证：'+error.message);startupCheck={ok:false,error:error.message,plain:app.getLoginItemSettings({path:path.join(store.directory,'含 空格 路径','ToZ.exe'),args:['--autostart']}),quoted:app.getLoginItemSettings({path:'"'+path.join(store.directory,'含 空格 路径','ToZ.exe')+'"',args:['--autostart']})};}
      finally{app.setLoginItemSettings({name,path:path.join(store.directory,'含 空格 路径','ToZ.exe'),args:['--autostart'],openAtLogin:false,enabled:false});const {execFileSync}=require('node:child_process');try{execFileSync(path.join(process.env.SystemRoot,'System32','reg.exe'),['delete','HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run','/v',name,'/f'],{windowsHide:true,stdio:'ignore'});}catch{}}
    }
    const current=store.snapshot(),today=new Date().toLocaleDateString('sv-SE'),initialDark=store.snapshot().dark;
    const endDate=new Date(today+'T12:00:00Z');endDate.setUTCDate(endDate.getUTCDate()+5);const end=endDate.toISOString().slice(0,10);
    if(!current.tasks.some(t=>t.id==='span-smoke-task'))current.tasks.unshift({id:'span-smoke-task',title:'从今天起每天推进，五天后截止',project:'ToZ',note:'验证开始后不会因为截止日尚未来临而移出今日。',planStart:today,plan:end,initialPlan:end,started:today,done:false,completedDate:null,subtasks:[],events:[{id:crypto.randomUUID(),type:'create',date:today,at:new Date().toISOString()}]});
    if(!current.projects.includes('测试自定义分区'))current.projects.push('测试自定义分区');
    const id='desktop-smoke-task',existing=current.tasks.find(t=>t.id===id);
    if(existing){existing.title='验证本地保存与双窗口同步';existing.events.push({id:crypto.randomUUID(),type:'edit',date:today,at:new Date().toISOString()});}
    else current.tasks.unshift({id,title:'验证本地保存与双窗口同步',note:'这是独立测试数据目录中的任务，不会写入正式数据。',project:'ToZ',plan:today,initialPlan:today,started:today,done:false,completedDate:null,subtasks:[{id:'smoke-child',title:'核对子任务展开与勾选',done:false}],events:[{id:crypto.randomUUID(),type:'create',date:today,at:new Date().toISOString()}]});
    if(!current.tasks.some(t=>t.id==='done-smoke-task'))current.tasks.push({id:'done-smoke-task',title:'已完成：核对今日任务与计划日期',note:'验证完成状态仍清晰可读。',project:'ToZ',plan:today,initialPlan:today,started:today,done:true,completedDate:today,subtasks:[],events:[{id:crypto.randomUUID(),type:'create',date:today,at:new Date().toISOString()},{id:crypto.randomUUID(),type:'complete',date:today,at:new Date().toISOString()}]});
    const {createSeries,materializeSeries}=require('../prototype/recurrence.mjs');
    if(!current.recurrences.some(s=>s.title==='每周检查进度（周期验证）')){
      const series=createSeries({title:'每周检查进度（周期验证）',note:'每期独立保存。',project:'ToZ',planStart:today,plan:today},{unit:'week',interval:1,weekdays:[(new Date(today+'T00:00:00Z').getUTCDay()+6)%7]},end);
      current.recurrences.push(series);current.tasks.push(...materializeSeries([series],current.tasks,end,today));
    }
    const {lunarDate}=require('../prototype/lunar.mjs'),lunarToday=lunarDate(today);
    if(!current.recurrences.some(s=>s.title==='农历年度安排（周期验证）')){
      const series=createSeries({title:'农历年度安排（周期验证）',note:'离线农历换算。',project:'ToZ',planStart:today,plan:today},{unit:'year',interval:1,calendar:'lunar',lunar:{month:Math.abs(lunarToday.month),day:lunarToday.day,leap:'both'}});
      current.recurrences.push(series);current.tasks.push(...materializeSeries([series],current.tasks,end,today));
    }
    current.preferences.projectColors.ToZ='#30b0c7';current.preferences.widgetProject='ToZ';current.preferences.menuOrder=['today','gantt','calendar','upcoming','all','done','delayed'];
    current.tasks.find(t=>t.id===id).top=true;current.preferences.taskOrder=[id,...current.tasks.map(t=>t.id).filter(key=>key!==id)];
    const saved=store.commit(current,current.version);broadcast();
    await new Promise(resolve=>setTimeout(resolve,600));
    const synchronized=['main','widget'].every(surface=>rendererReports.get(surface)?.version===saved.version&&rendererReports.get(surface)?.tasks===saved.tasks.length);
    if(!synchronized)errors.push('双窗口未确认数据库更新');
    const recurringSynced=['main','widget'].every(surface=>rendererReports.get(surface)?.recurringSeries===saved.recurrences.length&&rendererReports.get(surface)?.recurringTasks===saved.tasks.filter(t=>t.repeatId&&!t.cancelled).length);
    if(!recurringSynced)errors.push('周期规则或实例未在双窗口同步');
    const widgetSubtasksReady=rendererReports.get('widget')?.widgetSubtaskToggles>=1&&rendererReports.get('widget')?.widgetOpenSubtasks===0;
    if(!widgetSubtasksReady)errors.push('浮窗缺少子任务入口或默认状态未收起');
    const spanTaskVisible=['main','widget'].every(surface=>rendererReports.get(surface)?.todayTaskIDs?.includes('span-smoke-task'));
    if(!spanTaskVisible)errors.push('已开始的未来截止任务未进入今日');
    const projectPreferencesSynced=['main','widget'].every(surface=>{const r=rendererReports.get(surface);return r?.widgetProject==='ToZ'&&r?.projectColors?.ToZ==='#30b0c7'&&r?.menuOrder?.join(',')===saved.preferences.menuOrder.join(',');});
    const taskPinSynced=['main','widget'].every(surface=>rendererReports.get(surface)?.topTaskIDs?.[0]===id);
    if(!projectPreferencesSynced||!taskPinSynced)errors.push('分区设置、顺序或任务置顶未同步');
    mainWindow.webContents.send('toz:ui-command',{action:'calendar'});await new Promise(resolve=>setTimeout(resolve,300));
    const lunarAndCalendar=await mainWindow.webContents.executeJavaScript(`(() => ({lunar:document.querySelectorAll('.calendar-lunar').length,spanning:[...document.querySelectorAll('.calendar-span')].some(e=>{const s=getComputedStyle(e);return Number(s.gridColumnEnd)-Number(s.gridColumnStart)>1;})}))()`);
    const lunarReady=lunarAndCalendar.lunar>=28&&['main','widget'].every(surface=>rendererReports.get(surface)?.lunarSeries>=1),calendarSpans=lunarAndCalendar.spanning;
    if(!lunarReady||!calendarSpans)errors.push('农历日期或日历跨日时间条缺失');
    const calendarImage=await mainWindow.webContents.capturePage();mainWindow.webContents.send('toz:ui-command',{action:'today'});await new Promise(resolve=>setTimeout(resolve,250));
    const originalSize=mainWindow.getSize(),sidebarLayouts=[];
    for(const [width,height] of [[1200,820],[1100,700],[1200,960]]){
      mainWindow.setSize(width,height);await new Promise(resolve=>setTimeout(resolve,150));
      sidebarLayouts.push(await mainWindow.webContents.executeJavaScript(`(() => {
        const side=document.querySelector('.sidebar'),sections=document.querySelector('#project-nav'),style=getComputedStyle(sections);
        return {windowHeight:innerHeight,sidebarHeight:side.clientHeight,sidebarScrollHeight:side.scrollHeight,sectionHeight:sections.clientHeight,sectionScrollHeight:sections.scrollHeight,sectionOverflow:style.overflowY,sectionMaxHeight:style.maxHeight,heading:sections.querySelector('.eyebrow').textContent,decoration:getComputedStyle(document.querySelector('.quiet-note')).display,widgetAll:document.querySelector('#widget-project option').textContent};
      })()`));
    }
    mainWindow.setSize(...originalSize);await new Promise(resolve=>setTimeout(resolve,150));
    const sidebarSectionsFit=sidebarLayouts.every(r=>r.sectionOverflow==='visible'&&r.sectionMaxHeight==='none'&&r.sectionHeight>=r.sectionScrollHeight-1&&r.heading==='分区'&&r.widgetAll==='全部分区')&&sidebarLayouts[0].sidebarScrollHeight<=sidebarLayouts[0].sidebarHeight+1;
    if(!sidebarSectionsFit)errors.push('分区被内部滚动框裁切，或普通窗口未充分利用空间');
    const {editSubtask,deleteSubtask,restoreSubtask,deleteTask,restoreTask,deleteProject,restoreProject,moveTask}=require('../prototype/lifecycle.mjs');
    let lifecycleSnapshot=store.snapshot();editSubtask(lifecycleSnapshot.tasks.find(t=>t.id===id),'smoke-child','核对子任务右键改名与恢复');store.commit(lifecycleSnapshot,lifecycleSnapshot.version);broadcast();await new Promise(resolve=>setTimeout(resolve,200));
    const subtaskRenameSynced=['main','widget'].every(surface=>rendererReports.get(surface)?.smokeChildTitles?.includes('核对子任务右键改名与恢复'));
    lifecycleSnapshot=store.snapshot();deleteSubtask(lifecycleSnapshot.tasks.find(t=>t.id===id),'smoke-child');deleteTask(lifecycleSnapshot.tasks.find(t=>t.id==='span-smoke-task'));deleteProject(lifecycleSnapshot,'测试自定义分区',{mode:'move',target:'个人'});store.commit(lifecycleSnapshot,lifecycleSnapshot.version);broadcast();await new Promise(resolve=>setTimeout(resolve,200));
    const deletionSynced=['main','widget'].every(surface=>{const r=rendererReports.get(surface);return r?.deletedTasks===1&&!r?.smokeChildTitles?.length&&!r?.widgetTaskIDs?.includes('span-smoke-task')&&!r?.activeProjects?.includes('测试自定义分区');});
    lifecycleSnapshot=store.snapshot();restoreSubtask(lifecycleSnapshot.tasks.find(t=>t.id===id),'smoke-child');restoreTask(lifecycleSnapshot,'span-smoke-task');restoreProject(lifecycleSnapshot,'测试自定义分区');store.commit(lifecycleSnapshot,lifecycleSnapshot.version);broadcast();await new Promise(resolve=>setTimeout(resolve,200));
    const recoverySynced=['main','widget'].every(surface=>{const r=rendererReports.get(surface);return r?.deletedTasks===0&&r?.smokeChildTitles?.includes('核对子任务右键改名与恢复')&&r?.widgetTaskIDs?.includes('span-smoke-task')&&r?.activeProjects?.includes('测试自定义分区');});
    if(!subtaskRenameSynced||!deletionSynced||!recoverySynced)errors.push('编辑、删除或恢复未同步到双窗口');
    const moveSnapshot=store.snapshot(),originalProject=moveSnapshot.tasks.find(t=>t.id===id).project,targetProject=originalProject==='个人'?'生活':'个人';
    const contextMenuMain=await require('./context-menu-smoke.cjs')(mainWindow.webContents,'main',id);
    const contextMenuWidget=await require('./context-menu-smoke.cjs')(widgetWindow.webContents,'widget',id,true);
    const contextWidgetImage=await widgetWindow.webContents.capturePage();
    await widgetWindow.webContents.executeJavaScript(`document.querySelector('.context-submenu [aria-label=${JSON.stringify(targetProject)}]').click()`);
    await new Promise(resolve=>setTimeout(resolve,250));
    const taskMoveSynced=store.snapshot().tasks.find(t=>t.id===id).project===targetProject&&['main','widget'].every(surface=>rendererReports.get(surface)?.smokeTaskProject===targetProject);
    const taskMoveFeedback=await widgetWindow.webContents.executeJavaScript(`({status:document.querySelector('#save-status').textContent,toast:document.querySelector('#toast')?.textContent})`);
    if(!taskMoveSynced)errors.push('任务切换分区未同步到双窗口：'+JSON.stringify(taskMoveFeedback));
    const returnSnapshot=store.snapshot();moveTask(returnSnapshot,id,originalProject);store.commit(returnSnapshot,returnSnapshot.version);broadcast();await new Promise(resolve=>setTimeout(resolve,200));
    mainWindow.webContents.send('toz:ui-command',{action:'new'});await new Promise(resolve=>setTimeout(resolve,150));
    const datePickerNew=await require('./date-picker-smoke.cjs')(mainWindow.webContents,'new-form');
    mainWindow.webContents.send('toz:ui-command',{action:'reschedule',id});await new Promise(resolve=>setTimeout(resolve,150));
    const datePickerReschedule=await require('./date-picker-smoke.cjs')(mainWindow.webContents,'reschedule-form');
    const mainImage=await mainWindow.webContents.capturePage();const widgetImage=await widgetWindow.webContents.capturePage();
    const readControlColors=()=>mainWindow.webContents.executeJavaScript(`(() => {
      const colors={};
      for(const selector of ['.nav-item.active','.task-row.selected','.button.primary','.native-switch input:checked+span','.widget-tools .is-pinned']){
        const el=document.querySelector(selector);if(!el)continue;
        const style=getComputedStyle(el);colors[selector]={background:style.backgroundColor,image:style.backgroundImage};
      }
      return {theme:document.documentElement.dataset.theme,selectAppearance:getComputedStyle(document.querySelector('select')).appearance,colors};
    })()`);
    const darkControls=await readControlColors();
    const readVisualState=()=>mainWindow.webContents.executeJavaScript(`(() => {
      const form=document.querySelector('#reschedule-form'),dates=[...form.querySelectorAll('.date-trigger')].map(el=>el.getBoundingClientRect());
      const note=form.querySelector('.immutable-note').getBoundingClientRect(),grid=form.querySelector('.form-grid').getBoundingClientRect(),shortcuts=form.querySelector('.date-shortcuts').getBoundingClientRect();
      const color=selector=>getComputedStyle(document.querySelector(selector)).color;
      return {theme:document.documentElement.dataset.theme,title:color('.task-row.completed .task-title'),meta:color('.task-row.completed .task-meta'),background:getComputedStyle(document.querySelector('.app-window')).backgroundColor,check:color('.task-row.completed .check-button.done'),checkBackground:getComputedStyle(document.querySelector('.task-row.completed .check-button.done')).backgroundColor,noteGap:grid.top-note.bottom,presetGap:shortcuts.top-Math.max(...dates.map(r=>r.bottom)),dateColumns:dates.map(r=>({top:r.top,bottom:r.bottom,left:r.left,right:r.right})),overflow:form.scrollWidth>form.clientWidth};
    })()`);
    mainWindow.webContents.send('toz:ui-command',{action:'reschedule',id});
    await new Promise(resolve=>setTimeout(resolve,250));
    const darkRescheduleImage=await mainWindow.webContents.capturePage(),darkVisual=await readVisualState();
    mainWindow.webContents.send('toz:ui-command',{action:'gantt'});
    await new Promise(resolve=>setTimeout(resolve,350));
    const ganttImage=await mainWindow.webContents.capturePage(),ganttReport=rendererReports.get('main');
    const ganttReady=ganttReport?.view==='gantt'&&ganttReport?.ganttTasks===saved.tasks.length&&ganttReport?.ganttBars>=2;
    if(!ganttReady)errors.push('甘特图任务或时间条未正确显示');
    mainWindow.webContents.send('toz:ui-command',{action:'settings'});
    await new Promise(resolve=>setTimeout(resolve,400));
    const settingsImage=await mainWindow.webContents.capturePage();
    const themed=store.snapshot();themed.dark=true;store.commit(themed,themed.version);broadcast();await new Promise(resolve=>setTimeout(resolve,400));
    const darkImage=await mainWindow.webContents.capturePage(),darkWidgetImage=await widgetWindow.webContents.capturePage();
    const themeSynced=['main','widget'].every(surface=>rendererReports.get(surface)?.dark===true&&rendererReports.get(surface)?.projects.includes('测试自定义分区'));
    if(!themeSynced)errors.push('深色模式或自定义分区未同步');
    const light=store.snapshot();light.dark=false;store.commit(light,light.version);broadcast();
    await new Promise(resolve=>setTimeout(resolve,400));
    const lightImage=await mainWindow.webContents.capturePage(),lightWidgetImage=await widgetWindow.webContents.capturePage(),lightControls=await readControlColors();
    mainWindow.webContents.send('toz:ui-command',{action:'gantt'});
    mainWindow.webContents.send('toz:ui-command',{action:'reschedule',id});
    await new Promise(resolve=>setTimeout(resolve,250));
    const lightRescheduleImage=await mainWindow.webContents.capturePage(),lightVisual=await readVisualState();
    const luminance=color=>{const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
    const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
    const visualChecks=[darkVisual,lightVisual].map(state=>({...state,titleContrast:contrast(state.title,state.background),metaContrast:contrast(state.meta,state.background),checkContrast:contrast(state.check,state.checkBackground)}));
    const completionContrast=visualChecks.every(state=>state.titleContrast>=4.5&&state.metaContrast>=4.5&&state.checkContrast>=4.5);
    const rescheduleLayout=visualChecks.every(state=>state.noteGap>=16&&state.presetGap>=8&&!state.overflow);
    if(!completionContrast)errors.push('已完成任务文字或完成勾对比度不足');
    if(!rescheduleLayout)errors.push('调整计划日期字段与快捷按钮间距不足');
    const neutralControls=[darkControls,lightControls].every(theme=>Object.values(theme.colors).every(style=>{
      const rgb=style.background.match(/[\d.]+/g)?.slice(0,3).map(Number);
      return rgb&&Math.max(...rgb)-Math.min(...rgb)<=12&&style.image==='none';
    }));
    if(!neutralControls)errors.push('交互控件仍包含彩色选择背景');
    const firstToggle=toggleWidget(),secondToggle=toggleWidget();
    const visibilityToggle=firstToggle===false&&secondToggle===true&&widgetWindow.isVisible();
    if(!visibilityToggle)errors.push('悬浮框显示开关未生效');
    const dark=store.snapshot();dark.dark=true;store.commit(dark,dark.version);broadcast();
    const widgetWidth=widgetWindow.getContentSize()[0];
    setWidgetCollapsed(true);widgetWindow.showInactive();await new Promise(resolve=>setTimeout(resolve,250));
    const beforeMini=rendererReports.get('widget')?.miniTask;
    await new Promise(resolve=>setTimeout(resolve,4300));
    const afterMini=rendererReports.get('widget')?.miniTask,miniRotates=miniSamples.size>1;
    if(!miniRotates)errors.push('缩略浮窗未轮播今日任务');
    const collapsedImage=await widgetWindow.webContents.capturePage();
    const nativeDoubleClickHook=widgetWindow.isWindowMessageHooked(0x00A3);
    setWidgetCollapsed(false);widgetWindow.hide();
    for(let i=0;i<3;i++){setWidgetCollapsed(true);setWidgetCollapsed(false);}
    const widgetWidthStable=widgetWindow.getContentSize()[0]===widgetWidth;
    if(!widgetWidthStable)errors.push('重复展开收缩后浮窗宽度发生变化');
    const quickAddCheck=await require('./quick-add-smoke.cjs')({store,mainWindow,widgetWindow,getQuickAdd:()=>quickAddWindow,broadcast,outputDirectory:smokeResult?path.dirname(smokeResult):null});
    const upcomingCheck=await require('./upcoming-smoke.cjs')({store,mainWindow,broadcast,outputDirectory:smokeResult?path.dirname(smokeResult):null});
    const trashCheck=await require('./trash-smoke.cjs')({store,mainWindow,widgetWindow,broadcast,rendererReports,outputDirectory:smokeResult?path.dirname(smokeResult):null});
    if(smokeResult){fs.mkdirSync(path.dirname(smokeResult),{recursive:true});fs.writeFileSync(path.join(path.dirname(smokeResult),'client.png'),mainImage.toPNG());fs.writeFileSync(path.join(path.dirname(smokeResult),'widget.png'),widgetImage.toPNG());fs.writeFileSync(path.join(path.dirname(smokeResult),'settings.png'),settingsImage.toPNG());fs.writeFileSync(smokeResult,JSON.stringify({ok:errors.length===0,errors,version:app.getVersion(),electron:process.versions.electron,node:process.versions.node,sqlite:!!store.db,synchronized,reports:[...rendererReports.values()],windows:[{name:'main',size:mainWindow.getSize()},{name:'widget',frameless:true,transparent:true,size:widgetWindow.getSize()}],tasks:store.snapshot().tasks.length},null,2));}
    if(smokeResult){const report=JSON.parse(fs.readFileSync(smokeResult));Object.assign(report,{subtaskRenameSynced,deletionSynced,recoverySynced,sidebarSectionsFit,sidebarLayouts,projectPreferencesSynced,taskPinSynced,lunarReady,calendarSpans,startupCheck,themeSynced,initialDark,spanTaskVisible,visibilityToggle,miniRotates,beforeMini,afterMini,nativeDoubleClickHook,widgetWidthStable,ganttReady,recurringSynced,widgetSubtasksReady,neutralControls,darkControls,lightControls});fs.writeFileSync(path.join(path.dirname(smokeResult),'calendar.png'),calendarImage.toPNG());fs.writeFileSync(path.join(path.dirname(smokeResult),'gantt.png'),ganttImage.toPNG());fs.writeFileSync(path.join(path.dirname(smokeResult),'collapsed-widget.png'),collapsedImage.toPNG());fs.writeFileSync(path.join(path.dirname(smokeResult),'dark.png'),darkImage.toPNG());fs.writeFileSync(path.join(path.dirname(smokeResult),'dark-widget.png'),darkWidgetImage.toPNG());fs.writeFileSync(path.join(path.dirname(smokeResult),'light.png'),lightImage.toPNG());fs.writeFileSync(path.join(path.dirname(smokeResult),'light-widget.png'),lightWidgetImage.toPNG());fs.writeFileSync(smokeResult,JSON.stringify(report,null,2));}
    if(smokeResult){const report=JSON.parse(fs.readFileSync(smokeResult));Object.assign(report,{upcomingCheck,quickAddCheck,trashCheck,completionContrast,rescheduleLayout,visualChecks,taskMoveSynced,contextMenuMain,contextMenuWidget,datePickerNew,datePickerReschedule});fs.writeFileSync(path.join(path.dirname(smokeResult),'context-widget.png'),contextWidgetImage.toPNG());fs.writeFileSync(path.join(path.dirname(smokeResult),'reschedule-dark.png'),darkRescheduleImage.toPNG());fs.writeFileSync(path.join(path.dirname(smokeResult),'reschedule-light.png'),lightRescheduleImage.toPNG());fs.writeFileSync(smokeResult,JSON.stringify(report,null,2));}
    app.quit();
  }
}
