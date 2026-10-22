const fs=require('node:fs');
const path=require('node:path');
const {createTask,startTask}=require('../prototype/domain.mjs');
const {addSubtask}=require('../prototype/lifecycle.mjs');
const pause=()=>new Promise(resolve=>setTimeout(resolve,100));
module.exports=async function review({store,mainWindow,widgetWindow,getQuickAdd,broadcast,outputDirectory}){
  const checks=[],errors=[],layouts=[];
  const check=(pass,label)=>{if(!pass)throw new Error(label);checks.push(label);};
  const js=(w,code)=>w.webContents.executeJavaScript(code);
  const wait=async predicate=>{for(let i=0;i<80;i++){if(await predicate())return;await pause();}throw new Error('界面定向验收等待超时');};
  const resize=async(w,width,height)=>{w.setSize(width,height);await wait(async()=>await js(w,`Math.abs(innerWidth-${width})<=4&&Math.abs(innerHeight-${height})<=4`));};
  const shot=async(w,name)=>{w.show();await pause();await js(w,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');fs.writeFileSync(path.join(outputDirectory,name),(await w.webContents.capturePage()).toPNG());};
  for(const w of [mainWindow,widgetWindow])w.webContents.on('console-message',detail=>{if(detail.level==='error')errors.push(detail.message);});
  const today=new Date().toLocaleDateString('sv-SE'),state=store.snapshot();
  check(state.opacity===88&&!state.settings.largeText&&!state.settings.reduceTransparency,'全新设置默认 88% 底色，阅读偏好关闭');
  const task=createTask('核对 V1.0.0 桌面体验',today,'ToZ','保留开始与日期规则，统一桌面体验。',today);startTask(task);addSubtask(task,'核对子任务交互');
  const second=createTask('整理安装和设置反馈',today,'个人','',today);state.tasks=[task,second];state.preferences.taskOrder=[task.id,second.id];store.commit(state,state.version);broadcast();
  await wait(async()=>await js(mainWindow,`document.querySelectorAll('#task-list .task-row').length===2`));
  check(await js(mainWindow,`document.querySelector('#view-title').textContent==='今天'&&getComputedStyle(document.querySelector('.task-title')).fontSize==='14px'`),'列表短标题与 14px 任务字体生效');
  check(await js(widgetWindow,`document.querySelectorAll('.widget-tools button').length===2&&!document.querySelector('.widget-row>.task-pin')&&!document.querySelector('.row-reschedule')`),'浮窗仅常驻更多与折叠，低频行操作进入菜单');
  await js(mainWindow,`document.querySelector('#task-list [data-action="more"]').click()`);
  check(await js(mainWindow,`!!document.querySelector('[data-context-command="reschedule"]')&&!!document.querySelector('[data-context-command="export-task"]')&&document.querySelectorAll('.context-menu-separator').length>=2`),'任务更多菜单分组并保留改期、编辑、导出入口');
  await js(mainWindow,`document.querySelector('[data-context-command="pin"]').click()`);await pause();
  check(store.snapshot().tasks.find(t=>t.id===task.id).top===true,'菜单手动任务置顶保存');
  for(const dark of [false,true]){
    const next=store.snapshot();next.dark=dark;store.commit(next,next.version);broadcast();await pause();
    for(const [width,height] of [[1200,820],[960,600]]){
      await resize(mainWindow,width,height);
      await js(mainWindow,`document.querySelector('[data-action="settings"]').click()`);await pause();
      const layout=await js(mainWindow,`(()=>{const d=document.querySelector('#settings-dialog'),body=d.querySelector('.dialog-body'),button=d.querySelector('[data-close]');body.scrollTop=body.scrollHeight;const r=button.getBoundingClientRect(),rect=d.getBoundingClientRect();return {width:innerWidth,height:innerHeight,dialogWidth:rect.width,dialogHeight:rect.height,closeVisible:r.top>=0&&r.bottom<=innerHeight&&button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),noOverflow:document.documentElement.scrollWidth<=innerWidth,bodyScrolls:body.scrollHeight>body.clientHeight,theme:document.documentElement.dataset.theme};})()`);
      layouts.push(layout);check(layout.closeVisible&&layout.noOverflow,`${dark?'深':'浅'}色 ${width}×${height} 设置滚动后关闭可见`);
      await js(mainWindow,`document.querySelector('[data-settings-tab="startup"]').click()`);
      check(await js(mainWindow,`!document.querySelector('#settings-startup').hidden&&document.querySelector('#settings-appearance').hidden&&!!document.querySelector('[data-preference="closeToTray"]')`),'分组设置保留原生启动与托盘选项');
      await js(mainWindow,`document.querySelector('[data-settings-tab="appearance"]').click();document.querySelector('#settings-dialog [data-close]').click()`);
    }
    await resize(mainWindow,1200,820);await shot(mainWindow,`client-${dark?'dark':'light'}.png`);await shot(widgetWindow,`widget-${dark?'dark':'light'}.png`);
  }
  await js(mainWindow,`document.querySelector('[data-action="settings"]').click()`);await pause();
  await js(mainWindow,`document.querySelector('[data-reading="largeText"]').click()`);await wait(()=>store.settings().largeText);
  await wait(async()=>await js(widgetWindow,`document.documentElement.classList.contains('large-text')`));
  check(await js(widgetWindow,`getComputedStyle(document.querySelector('#widget .task-title')).fontSize==='15px'`),'较大文字跨窗口同步至浮窗');
  await js(mainWindow,`document.querySelector('[data-reading="reduceTransparency"]').click()`);await wait(()=>store.settings().reduceTransparency);
  await wait(async()=>await js(widgetWindow,`document.documentElement.classList.contains('reduce-transparency')`));
  check(await js(widgetWindow,`getComputedStyle(document.querySelector('.widget')).backgroundColor==='rgb(41, 41, 44)'`),'减少透明度跨窗口使用不透明深色底');
  await js(mainWindow,`document.querySelector('#opacity-range').value=63;document.querySelector('#opacity-range').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#opacity-range').dispatchEvent(new Event('change',{bubbles:true}))`);await pause();
  check(store.snapshot().opacity===63,'透明度保存并保留减少透明度偏好');
  await shot(mainWindow,'settings-reading-dark.png');
  await js(mainWindow,`document.querySelector('#settings-dialog [data-close]').click()`);
  mainWindow.hide();let shows=0;const shown=()=>shows++;mainWindow.on('show',shown);
  await js(widgetWindow,`document.querySelector('.widget-add').click()`);
  await wait(()=>getQuickAdd()&&!getQuickAdd().webContents.isLoading());const quick=getQuickAdd();await wait(async()=>await js(quick,`!!document.querySelector('#new-dialog[open]')`));
  check(!mainWindow.isVisible()&&shows===0,'浮窗新增使用独立窗口，不唤起主界面');
  check(await js(quick,`document.documentElement.classList.contains('large-text')&&document.documentElement.classList.contains('reduce-transparency')`),'独立新增读取同一阅读设置');
  for(const [width,height] of [[500,780],[380,480]]){await resize(quick,width,height);check(await js(quick,`(()=>{const body=document.querySelector('.quick-add-body');body.scrollTop=body.scrollHeight;const button=document.querySelector('#new-form [type=submit]'),close=document.querySelector('.quick-add-heading [data-close]'),r=button.getBoundingClientRect(),c=close.getBoundingClientRect();return r.bottom<=innerHeight&&c.top>=38&&document.documentElement.scrollWidth<=innerWidth;})()`),`独立新增 ${width}×${height} 标题与提交固定可用`);}
  await shot(quick,'quick-add-small-dark.png');
  await js(quick,`document.querySelector('#new-form').elements.title.value='V1.0.0 浮窗新增';document.querySelector('#new-form').requestSubmit()`);await wait(()=>!getQuickAdd());
  check(store.snapshot().tasks.find(t=>t.title==='V1.0.0 浮窗新增')?.top===false,'新任务继续默认不置顶');mainWindow.removeListener('show',shown);
  for(const width of [280,336]){
    await resize(widgetWindow,width,550);
    const menu=await require('./context-menu-smoke.cjs')(widgetWindow.webContents,'widget',task.id);
    check(menu.ok,`${width}px 浮窗的分区二级菜单不重叠、不裁切`);
  }
  await js(widgetWindow,`document.querySelector('[data-action="collapse"]').click()`);await wait(()=>store.settings().widgetCollapsed);
  check(await js(widgetWindow,`document.querySelector('.widget').classList.contains('collapsed')&&!!document.querySelector('[data-action="widget-menu"]')`),'折叠后仍有原生菜单入口');
  await shot(widgetWindow,'widget-collapsed-dark.png');
  check(errors.length===0,'定向界面流程无 renderer console error');
  return {checks,layouts,errors,dataDirectory:store.directory,scope:'V1.0.0 UI only; no full smoke, real installation or OS startup mutation'};
};
