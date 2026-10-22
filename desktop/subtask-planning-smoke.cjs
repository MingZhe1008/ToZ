const fs=require('node:fs'),path=require('node:path');
const {createTask,addDays}=require('../prototype/domain.mjs');
const pause=()=>new Promise(resolve=>setTimeout(resolve,220));
module.exports=async function subtaskPlanningSmoke({store,mainWindow,widgetWindow,broadcast,outputDirectory}){
  const baseline=store.snapshot(),today=new Date().toLocaleDateString('sv-SE'),end=addDays(today,7),checks=[],size=mainWindow.getSize();
  const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
  const js=code=>mainWindow.webContents.executeJavaScript(code);
  const select=async id=>{mainWindow.webContents.send('toz:ui-command',{action:'select',id});await pause();};
  const fill=async(start,finish)=>{await js(`{const f=document.querySelector('#subtask-edit-form');f.elements.startDate.value=${JSON.stringify(start)};f.elements.date.value=${JSON.stringify(finish)};}`);};
  const submit=async()=>{await js(`document.querySelector('#subtask-edit-form').requestSubmit()`);await pause();};
  try{
    const task=createTask('主任务内安排子任务',end,'ToZ','独立验收数据',today),unbounded=createTask('尚未排期的主任务',null,'ToZ');
    const state=store.snapshot();state.tasks.unshift(task,unbounded);store.commit(state,state.version);broadcast();await pause();mainWindow.show();await select(task.id);
    await js(`document.querySelector('#subtask-form input').value='设计稿整理';document.querySelector('[data-action="new-subtask-dated"]').click()`);await pause();
    check(await js(`document.querySelector('#subtask-edit-form').elements.title.value==='设计稿整理'&&!document.querySelector('#subtask-edit-form').elements.startDate.disabled`),'日历入口保留输入名称并打开可排期子任务表单');
    await js(`document.querySelector('#subtask-edit-form [name="startDate"]').nextElementSibling.querySelector('.date-trigger').click()`);await pause();
    check(await js(`[...document.querySelectorAll('#subtask-edit-form .picker-panel:not([hidden]) [data-pick-date]')].every(b=>b.disabled===(b.dataset.pickDate<${JSON.stringify(today)}||b.dataset.pickDate>${JSON.stringify(end)}))`),'日期选择器禁用主任务范围外的日期');
    await js(`document.querySelector('#subtask-edit-form .picker-panel:not([hidden]) [data-pick-date=${JSON.stringify(today)}]').click()`);
    await js(`document.querySelector('#subtask-edit-form [name="date"]').nextElementSibling.querySelector('.date-trigger').click()`);await pause();
    await js(`document.querySelector('#subtask-edit-form .picker-panel:not([hidden]) [data-pick-date=${JSON.stringify(end)}]').click()`);await submit();
    let child=store.snapshot().tasks.find(t=>t.id===task.id).subtasks[0];check(child?.planStart===today&&child.plan===end,'通过公历农历选择器添加边界内日期并保存 SQLite');
    check(await js(`!!document.querySelector('#task-detail .subtask-dates')`),'详情显示子任务起止日期');
    await widgetWindow.webContents.executeJavaScript(`document.querySelector('[data-action="toggle-subtasks"][data-task=${JSON.stringify(task.id)}]').click()`);await pause();
    check(await widgetWindow.webContents.executeJavaScript(`!!document.querySelector('[data-subtask-row=${JSON.stringify(child.id)}] .subtask-dates')`),'浮窗同步展示子任务日期');
    await js(`document.querySelector('#task-detail [data-action="edit-subtask"][data-subtask=${JSON.stringify(child.id)}]').click()`);await pause();
    const version=store.snapshot().version;await fill(today,addDays(end,1));await submit();
    check(await js(`document.querySelector('#subtask-edit-dialog').open&&document.querySelector('#subtask-edit-form .form-error').textContent.includes('主任务计划范围')`)&&store.snapshot().version===version,'越界输入拒绝保存，保留表单且数据库不变');
    await fill(today,'');await submit();check(await js(`document.querySelector('#subtask-edit-form .form-error').textContent.includes('成对填写')`),'缺少截止日期时给出完整性提示');
    await fill(today,end);await js(`document.querySelector('#subtask-edit-form .form-error').textContent='';import('./date-picker.mjs').then(m=>m.syncDatePickers())`);
    for(const dark of [true,false]){
      const themed=store.snapshot();themed.dark=dark;store.commit(themed,themed.version);broadcast();await pause();
      if(outputDirectory)fs.writeFileSync(path.join(outputDirectory,`subtask-plan-${dark?'dark':'light'}.png`),(await mainWindow.webContents.capturePage()).toPNG());
    }
    await js(`document.querySelector('#subtask-edit-dialog [data-close]').click();document.querySelector('#task-detail [data-action="reschedule"]').click()`);await pause();
    await js(`{const f=document.querySelector('#reschedule-form');f.elements.date.value=${JSON.stringify(addDays(end,-1))};f.requestSubmit();}`);await pause();
    check(await js(`document.querySelector('#reschedule-dialog').open&&document.querySelector('#reschedule-form .form-error').textContent.includes('主任务计划范围')`)&&store.snapshot().tasks.find(t=>t.id===task.id).plan===end,'主任务缩短范围时拒绝越过子任务截止日期');
    await js(`document.querySelector('#reschedule-dialog [data-close]').click();document.querySelector('#task-detail [data-action="edit-subtask"]').click()`);await pause();
    await js(`document.querySelector('[data-action="clear-subtask-dates"]').click()`);await submit();child=store.snapshot().tasks.find(t=>t.id===task.id).subtasks[0];
    check(child.planStart===null&&child.plan===null&&store.snapshot().tasks.find(t=>t.id===task.id).events.some(e=>e.type==='subtask_schedule'),'编辑可清空子任务日期并追加足迹');
    await select(unbounded.id);await js(`document.querySelector('[data-action="new-subtask-dated"]').click()`);await pause();
    check(await js(`[...document.querySelectorAll('#subtask-edit-form .date-trigger')].every(b=>b.disabled)&&document.querySelector('#subtask-plan-hint').textContent.includes('主任务未设置完整计划')`),'无主任务完整排期时禁用日期并说明处理方式');
    await js(`document.querySelector('#subtask-edit-form').elements.title.value='不设日期也可添加'`);await submit();check(store.snapshot().tasks.find(t=>t.id===unbounded.id).subtasks.length===1,'无日期子任务兼容现有快速清单');
    mainWindow.webContents.send('toz:ui-command',{action:'today'});await pause();return {ok:true,checks};
  }finally{mainWindow.setSize(...size);store.restore(baseline);broadcast();}
};
