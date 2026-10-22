const fs=require('node:fs'),path=require('node:path');
const {createTask,TODAY}=require('../prototype/domain.mjs');
const {deleteTask,deleteSubtask,deleteProject}=require('../prototype/lifecycle.mjs');
const pause=()=>new Promise(resolve=>setTimeout(resolve,180));
module.exports=async function trashSmoke({store,mainWindow,widgetWindow,broadcast,rendererReports,outputDirectory}){
  const assert=(ok,message)=>{if(!ok)throw new Error(message);},baseline=store.snapshot(),size=mainWindow.getSize(),gone=createTask('隔离验收：彻底删除任务',TODAY,'个人'),keep=createTask('隔离验收：保留正常任务',TODAY,'个人');
  keep.subtasks=[{id:'purge-child',title:'隔离验收：已删除子任务',done:false},{id:'keep-child',title:'保留子任务',done:false}];
  let state=store.snapshot();state.tasks.push(gone,keep);state.projects.push('回收站隔离验收分区');store.commit(state,state.version);
  state=store.snapshot();deleteTask(state.tasks.find(t=>t.id===gone.id));deleteSubtask(state.tasks.find(t=>t.id===keep.id),'purge-child');deleteProject(state,'回收站隔离验收分区',{mode:'trash'});store.commit(state,state.version);broadcast();await pause();
  mainWindow.webContents.send('toz:ui-command',{action:'trash'});await pause();
  const confirmationVersion=store.snapshot().version;
  const confirmation=await mainWindow.webContents.executeJavaScript(`(() => {
    const row=[...document.querySelectorAll('#trash-list .trash-row')].find(r=>r.querySelector('b').textContent===${JSON.stringify(gone.title)});row.querySelector('[data-purge]').click();
    return {open:document.querySelector('#purge-dialog').open,cancelFocused:document.activeElement.textContent==='取消',description:document.querySelector('#purge-description').textContent,notice:document.querySelector('.purge-note').textContent};
  })()`);
  assert(confirmation.open&&confirmation.cancelFocused&&confirmation.description.includes(gone.title)&&confirmation.notice.includes('旧备份'),'彻底删除确认范围或默认取消焦点缺失');
  await mainWindow.webContents.executeJavaScript(`document.querySelector('#purge-form [autofocus]').click()`);
  assert(store.snapshot().version===confirmationVersion&&store.snapshot().tasks.some(t=>t.id===gone.id),'取消确认后数据发生改变');
  if(outputDirectory){fs.mkdirSync(outputDirectory,{recursive:true});fs.writeFileSync(path.join(outputDirectory,'trash-actions.png'),(await mainWindow.webContents.capturePage()).toPNG());}
  const single=await mainWindow.webContents.executeJavaScript(`window.toz.purge(${JSON.stringify({kind:'task',id:gone.id})},${confirmationVersion})`);assert(single.ok,'原生彻底删除接口失败');await pause();
  assert(['main','widget'].every(surface=>rendererReports.get(surface)?.version===single.snapshot.version),'彻底删除未同步双窗口');assert(!store.snapshot().tasks.some(t=>t.id===gone.id),'任务仍在数据库');
  const all=await mainWindow.webContents.executeJavaScript(`window.toz.purge({kind:'all'},${single.snapshot.version})`);assert(all.ok,'原生一键清空接口失败');await pause();
  const parent=store.snapshot().tasks.find(t=>t.id===keep.id);assert(parent&&parent.subtasks.length===1&&parent.subtasks[0].id==='keep-child','清空删除了正常任务或遗漏子任务');assert(store.snapshot().preferences.projectTrash.length===0,'分区未清空');
  const empty=await mainWindow.webContents.executeJavaScript(`({disabled:document.querySelector('#trash-empty').disabled,text:document.querySelector('#trash-list').textContent})`);assert(empty.disabled&&empty.text.includes('回收站是空的'),'回收站空态或清空禁用状态错误');
  state=store.snapshot();deleteTask(state.tasks.find(t=>t.id===keep.id));store.commit(state,state.version);store.purge({kind:'task',id:keep.id},store.snapshot().version);broadcast();await pause();
  assert(store.snapshot().tasks.length===baseline.tasks.length,'隔离验收未清理干净');
  const settingsLayouts=[];
  for(const dark of [true,false]){
    state=store.snapshot();state.dark=dark;store.commit(state,state.version);broadcast();await pause();
    for(const height of [820,700]){
      mainWindow.setSize(1200,height);
      await mainWindow.webContents.executeJavaScript(`new Promise(resolve=>{let attempts=0;const poll=()=>{if(Math.abs(innerHeight-${height})<=4||++attempts>=80)resolve();else setTimeout(poll,25);};poll();})`);
      mainWindow.webContents.send('toz:ui-command',{action:'gantt'});await pause();mainWindow.webContents.send('toz:ui-command',{action:'settings'});await pause();
      const layout=await mainWindow.webContents.executeJavaScript(`(() => {
        const dialog=document.querySelector('#settings-dialog'),body=dialog.querySelector('.dialog-body'),close=dialog.querySelector('.dialog-header [data-close]'),before=close.getBoundingClientRect();body.scrollTop=body.scrollHeight;const after=close.getBoundingClientRect(),hit=document.elementFromPoint(after.left+after.width/2,after.top+after.height/2);
        return {theme:document.documentElement.dataset.theme,height:innerHeight,scrollTop:body.scrollTop,scrollHeight:body.scrollHeight,bodyHeight:body.clientHeight,closeTop:after.top,closeBottom:after.bottom,stable:Math.abs(after.top-before.top)<1,clickable:!!hit&&close.contains(hit),dialogScroll:dialog.scrollTop};
      })()`);
      layout.requestedHeight=height;
      assert(Math.abs(layout.height-height)<=4&&layout.scrollTop>0&&layout.stable&&layout.clickable&&layout.closeTop>=0&&layout.closeBottom<=layout.height&&layout.dialogScroll===0,'设置滚动后关闭按钮不在固定可点击位置');settingsLayouts.push(layout);await pause();
      if(outputDirectory&&height===700)fs.writeFileSync(path.join(outputDirectory,'settings-scrolled-'+(dark?'dark':'light')+'.png'),(await mainWindow.webContents.capturePage()).toPNG());
      const closed=await mainWindow.webContents.executeJavaScript(`(() => {document.querySelector('#settings-dialog .dialog-header [data-close]').click();return !document.querySelector('#settings-dialog').open;})()`);assert(closed,'滚动到底部后无法点击关闭设置');
    }
  }
  state=store.snapshot();state.dark=baseline.dark;store.commit(state,state.version);broadcast();mainWindow.setSize(...size);await pause();
  return {purgeVerified:true,confirmation,empty,settingsAnchored:true,settingsLayouts};
};
