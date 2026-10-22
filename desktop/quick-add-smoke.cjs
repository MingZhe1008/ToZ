const fs=require('node:fs');
const path=require('node:path');
const pause=()=>new Promise(resolve=>setTimeout(resolve,100));
module.exports=async function quickAddSmoke({store,mainWindow,widgetWindow,getQuickAdd,broadcast,outputDirectory}){
  const checks=[];
  const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
  const waitFor=async predicate=>{for(let i=0;i<80;i++){if(await predicate())return;await pause();}throw new Error('快速新增验收等待超时');};
  const js=(window,code)=>window.webContents.executeJavaScript(code);
  const snapshot=store.snapshot();
  let mainShows=0;
  mainWindow.hide();
  const onShow=()=>mainShows++;mainWindow.on('show',onShow);
  const open=async()=>{
    await js(widgetWindow,`document.querySelector('.widget-add').click()`);
    await waitFor(async()=>{const w=getQuickAdd();return w&&!w.isDestroyed()&&!w.webContents.isLoading()&&await js(w,`!!document.querySelector('#new-dialog[open]')`);});
    return getQuickAdd();
  };
  const submit=window=>js(window,`document.querySelector('#new-form').requestSubmit()`);
  const layout=window=>js(window,`(() => {
    const body=document.querySelector('.quick-add-body'),close=document.querySelector('.quick-add-heading [data-close]'),submit=document.querySelector('#new-form [type=submit]');
    const bounds=el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,x:r.x+r.width/2,y:r.y+r.height/2};};
    const before=bounds(close);body.scrollTop=body.scrollHeight;
    const c=bounds(close),s=bounds(submit);
    const hit=(el,r)=>el.contains(document.elementFromPoint(r.x,r.y));
    return {width:innerWidth,height:innerHeight,scrollTop:body.scrollTop,headingFixed:before.top===c.top,closeVisible:c.top>=0&&c.bottom<=innerHeight&&hit(close,c),submitVisible:s.top>=0&&s.bottom<=innerHeight&&hit(submit,s),noOverflow:document.documentElement.scrollWidth<=innerWidth};
  })()`);
  try{
    let window=await open();
    check(!mainWindow.isVisible()&&mainShows===0,'浮窗新增不唤起主窗口');
    check(await js(window,`document.querySelector('#new-form').elements.project.value===${JSON.stringify(snapshot.preferences.widgetProject||snapshot.projects[0])}`),'默认沿用浮窗分区');
    await js(window,`document.querySelector('#new-form').elements.title.value='快速新增保留草稿'`);
    await open();check(getQuickAdd()===window&&await js(window,`document.querySelector('#new-form').elements.title.value==='快速新增保留草稿'`),'重复点击聚焦同一窗口并保留草稿');
    const layouts=[],titlebars=[];
    for(const dark of [true,false]){
      const next=store.snapshot();next.dark=dark;store.commit(next,next.version);broadcast();await pause();
      window.setSize(500,780);await pause();layouts.push(await layout(window));
      const titlebar=await js(window,`(() => {const bar=document.querySelector('.quick-add-titlebar'),style=getComputedStyle(bar),rect=bar.getBoundingClientRect(),controls=navigator.windowControlsOverlay;return {theme:document.documentElement.dataset.theme,background:style.backgroundColor,color:style.color,drag:style.getPropertyValue('-webkit-app-region'),height:rect.height,top:rect.top,overlay:!!controls?.visible,controlAreaHeight:controls?.getTitlebarAreaRect().height};})()`);
      titlebars.push(titlebar);
      check(titlebar.overlay&&titlebar.top===0&&titlebar.height===34&&titlebar.drag==='drag'&&titlebar.background===(dark?'rgb(37, 37, 40)':'rgb(242, 242, 247)')&&titlebar.color===(dark?'rgb(245, 245, 247)':'rgb(29, 29, 31)'),(dark?'深色':'浅色')+'新增标题栏与原生窗口按钮区域随应用主题同步');
      if(outputDirectory)fs.writeFileSync(path.join(outputDirectory,`quick-add-${dark?'dark':'light'}.png`),(await window.webContents.capturePage()).toPNG());
      window.setSize(380,480);await pause();layouts.push(await layout(window));
      if(outputDirectory)fs.writeFileSync(path.join(outputDirectory,`quick-add-small-${dark?'dark':'light'}.png`),(await window.webContents.capturePage()).toPNG());
    }
    check(layouts.every(r=>r.headingFixed&&r.closeVisible&&r.submitVisible&&r.noOverflow),'浅深主题与窄矮窗口标题、关闭及提交固定可用');
    window.setSize(500,780);await pause();
    await js(window,`document.querySelector('.quick-add-body').scrollTop=0;document.querySelector('#new-form [data-action="new-project"]').click();document.querySelector('#project-form').elements.name.value='快速新增验收分区';document.querySelector('#project-form').requestSubmit()`);
    check(await js(window,`document.querySelector('#new-form').elements.title.value==='快速新增保留草稿'&&document.querySelector('#new-form').elements.project.value==='快速新增验收分区'`),'小窗口可新增分区且保留任务草稿');
    await js(window,`document.querySelector('#new-form').elements.project.value='ToZ';document.querySelector('#new-form').elements.title.value='浮窗直接创建验收'`);
    // Force an outdated version without broadcasting, then retry the retained draft.
    const concurrent=store.snapshot();store.commit(concurrent,concurrent.version);
    await submit(window);await pause();
    check(!store.snapshot().tasks.some(t=>t.title==='浮窗直接创建验收')&&await js(window,`document.querySelector('#new-dialog').open&&!!document.querySelector('#new-form .form-error').textContent&&document.querySelector('#new-form').elements.title.value==='浮窗直接创建验收'`),'版本冲突保留草稿并阻止重复或覆盖写入');
    await submit(window);await waitFor(()=>!getQuickAdd());await pause();
    const saved=store.snapshot(),task=saved.tasks.find(t=>t.title==='浮窗直接创建验收');
    check(task?.top===false&&saved.preferences.taskOrder[0]===task.id,'快速新增保存后不自动置顶，保留新增排序记录');
    check(saved.tasks.filter(t=>t.title===task.title).length===1,'冲突重试只创建一份任务');
    check(await js(widgetWindow,`[...document.querySelectorAll('.widget-list .widget-row')].some(row=>row.dataset.task===${JSON.stringify(task.id)})`),'新增任务立即同步浮窗');
    mainWindow.webContents.send('toz:ui-command',{action:'today'});await pause();
    check(await js(mainWindow,`[...document.querySelectorAll('#task-list .task-row')].some(row=>row.dataset.task===${JSON.stringify(task.id)})`),'主界面隐藏时也收到新增任务');
    window=await open();const version=store.snapshot().version;
    window.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});
    window.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
    await waitFor(()=>!getQuickAdd());check(store.snapshot().version===version,'取消快速新增不写入任务');
    window=await open();
    const month=new Date().toLocaleDateString('sv-SE').slice(0,7);
    await js(window,`(() => {const form=document.querySelector('#new-form');form.elements.title.value='每月十日点性验收';form.elements.startDate.value=${JSON.stringify(month+'-10')};form.elements.date.value=${JSON.stringify(month+'-12')};form.elements.repeatPreset.value='monthly';form.elements.repeatPreset.dispatchEvent(new Event('change',{bubbles:true}));form.requestSubmit();})()`);
    await waitFor(()=>!getQuickAdd());
    let recurring=store.snapshot(),instances=recurring.tasks.filter(t=>t.title==='每月十日点性验收');
    check(instances.length>=2&&instances.every(t=>t.top===false&&t.repeatDate.endsWith('-10')),'独立窗口可新增每月周期且每期默认不置顶');
    const instance=recurring.tasks.find(t=>t.id===instances[0].id);
    const {startTask,reschedule,addDays}=require('../prototype/domain.mjs');
    startTask(instance);reschedule(instance,addDays(instance.plan,40));store.commit(recurring,recurring.version);broadcast();await pause();
    mainWindow.webContents.send('toz:ui-command',{action:'calendar'});await pause();
    const points=await js(mainWindow,`[...document.querySelectorAll('.calendar-span')].filter(el=>el.querySelector('.calendar-task-title').textContent==='每月十日点性验收').map(el=>{const s=getComputedStyle(el);return {columns:Number(s.gridColumnEnd)-Number(s.gridColumnStart),continued:el.classList.contains('continues-before')||el.classList.contains('continues-after')};})`);
    check(points.length>0&&points.every(p=>p.columns===1&&!p.continued),'开始并延期的每月任务在真实月历中仍仅占对应日期一格');
    mainWindow.webContents.send('toz:ui-command',{action:'new'});await pause();
    await js(mainWindow,`document.querySelector('#new-form').elements.title.value='主界面新建置顶验收';document.querySelector('#new-form').requestSubmit()`);await pause();
    const mainTask=store.snapshot().tasks.find(t=>t.title==='主界面新建置顶验收');
    check(mainTask?.top===false&&store.snapshot().preferences.taskOrder[0]===mainTask.id,'主界面新建同样不自动置顶，保留新增排序记录');
    check(!mainWindow.isVisible()&&mainShows===0,'新增与取消全程没有显示主窗口');
    // Reveal only after the hidden-main workflow checks. Hidden capture may reuse
    // a previous compositor frame even when the calendar DOM is up to date.
    const visual=store.snapshot();visual.dark=true;store.commit(visual,visual.version);broadcast();
    mainWindow.show();mainWindow.focus();
    mainWindow.webContents.send('toz:ui-command',{action:'calendar'});
    await new Promise(resolve=>setTimeout(resolve,400));
    check(await js(mainWindow,`!document.querySelector('dialog[open]')&&!document.querySelector('#calendar-view').hidden`),'日历截图前确认视图可见且无弹窗遮挡');
    if(outputDirectory)fs.writeFileSync(path.join(outputDirectory,'recurring-calendar.png'),(await mainWindow.webContents.capturePage()).toPNG());
    return {ok:true,checks,layouts,titlebars};
  }finally{
    mainWindow.removeListener('show',onShow);
    getQuickAdd()?.close();
    store.restore(snapshot);broadcast();
  }
};
