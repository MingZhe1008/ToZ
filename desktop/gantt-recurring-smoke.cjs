const fs=require('node:fs'),path=require('node:path');
const {createTask,addDays,toggleDone}=require('../prototype/domain.mjs');
const {createSeries,materializeSeries}=require('../prototype/recurrence.mjs');
const pause=()=>new Promise(resolve=>setTimeout(resolve,200));
module.exports=async function ganttRecurringSmoke({store,mainWindow,broadcast,outputDirectory}){
  const baseline=store.snapshot(),today=new Date().toLocaleDateString('sv-SE'),month=today.slice(0,7),start=month+'-01';
  const end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10),project='甘特周期隔离验收',checks=[];
  const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
  const js=code=>mainWindow.webContents.executeJavaScript(code);
  const select=async(id,value)=>{await js(`document.getElementById(${JSON.stringify(id)}).value=${JSON.stringify(value)};document.getElementById(${JSON.stringify(id)}).dispatchEvent(new Event('change',{bubbles:true}))`);await pause();};
  try{
    const weekly=createSeries(createTask('每周一三五检查',addDays(start,90),project,'每期独立操作',start),{unit:'week',interval:1,weekdays:[0,2,4]});
    const monthly=createSeries(createTask('每月月底回顾',addDays(start,270),project,'长计划也只显示执行日',start),{unit:'month',interval:1,monthEnd:true});
    const tasks=materializeSeries([weekly,monthly],[],addDays(end,35),today),weeklyVisible=tasks.filter(t=>t.repeatId===weekly.id&&t.repeatDate>=start&&t.repeatDate<=end);
    toggleDone(weeklyVisible[0]);const selected=weeklyVisible[1],normal=createTask('普通跨日安排',end,project,'保留连续区间',start);
    const state=store.snapshot();state.projects.push(project);state.preferences.projectColors[project]='#af52de';state.recurrences.push(weekly,monthly);state.tasks.unshift(...tasks,normal);
    state.preferences.taskOrder=[...tasks.map(t=>t.id).reverse(),normal.id,...state.preferences.taskOrder];store.commit(state,state.version);broadcast();
    mainWindow.webContents.send('toz:ui-command',{action:'gantt'});await pause();
    await js(`document.querySelector('[data-gantt="today"]').click()`);await select('gantt-project',project);
    const summary=await js(`({series:document.querySelectorAll('.gantt-series-row').length,points:document.querySelectorAll('.gantt-point').length,repeatBars:document.querySelectorAll('.gantt-series-row .gantt-bar').length,bars:document.querySelectorAll('.gantt-bar').length,done:document.querySelectorAll('.gantt-point.is-done').length,rows:document.querySelector('#gantt-view').dataset.ganttRows,bulk:document.querySelectorAll('.gantt-series-row [data-gantt="complete"],.gantt-series-row [data-gantt="pin"]').length})`);
    check(summary.series===2&&summary.points===weeklyVisible.length+1&&summary.repeatBars===0&&summary.bars===1&&Number(summary.rows)===3,'每个周期合并一行，只画本期日期点，普通跨日任务保留时间条');
    check(summary.done===1&&summary.bulk===0,'完成只标记对应期次，周期行没有整组完成或置顶操作');
    const positions=await js(`[...document.querySelectorAll('.gantt-point')].map(point=>{const rect=point.getBoundingClientRect(),track=point.parentElement.getBoundingClientRect();return {inside:rect.left>=track.left&&rect.right<=track.right,target:rect.width>=24&&rect.height>=24};})`);
    check(positions.every(p=>p.inside&&p.target),'日期点位于时间轴内且保留足够点击区域');
    for(const dark of [true,false]){
      const themed=store.snapshot();themed.dark=dark;store.commit(themed,themed.version);broadcast();await pause();mainWindow.show();await pause();
      if(outputDirectory)fs.writeFileSync(path.join(outputDirectory,`gantt-points-${dark?'dark':'light'}.png`),(await mainWindow.webContents.capturePage()).toPNG());
    }
    await js(`document.querySelector('.gantt-point[data-task=${JSON.stringify(selected.id)}]').click()`);await pause();
    check(await js(`!!document.querySelector('.gantt-point.is-selected[data-task=${JSON.stringify(selected.id)}]')&&document.querySelector('#task-detail').textContent.includes('每周一三五检查')`),'点击日期点打开该期真实任务详情');
    await js(`document.querySelector('#task-detail [data-action="start"][data-task=${JSON.stringify(selected.id)}]').click()`);await pause();
    check(await js(`!!document.querySelector('.gantt-point.is-selected[data-task=${JSON.stringify(selected.id)}]')&&!document.querySelector('.gantt-series-row .gantt-bar')`),'实际开始后仍保持对应日期点，不延伸成时间条');
    await js(`document.querySelector('#task-detail [data-action="complete"][data-task=${JSON.stringify(selected.id)}]').click()`);await pause();
    check(store.snapshot().tasks.filter(t=>t.repeatId===weekly.id&&t.done).length===2&&store.snapshot().tasks.find(t=>t.id===selected.id).done,'在详情完成仅更新所选一期');
    await js(`document.querySelector('#task-detail [data-action="calendar-close-detail"]').click()`);await select('gantt-status','done');
    check(await js(`document.querySelectorAll('.gantt-series-row').length===1&&document.querySelectorAll('.gantt-point').length===2&&document.querySelectorAll('.gantt-bar').length===0`),'完成筛选后仍为一行，只显示已完成日期点');
    await select('gantt-status','all');await js(`document.querySelector('[data-gantt="scale"][data-scale="week"]').click()`);await pause();
    check(await js(`document.querySelectorAll('.gantt-series-row').length===2&&document.querySelectorAll('.gantt-point').length>=3&&!document.querySelector('.gantt-series-row .gantt-bar')`),'周尺度仍按同组一行展示执行日期点');
    await js(`document.querySelector('[data-gantt="scale"][data-scale="month"]').click()`);await select('gantt-project','');
    mainWindow.webContents.send('toz:ui-command',{action:'new'});await pause();
    const semantics=await js(`(() => {const form=document.querySelector('#new-form');form.elements.startDate.value='2026-10-22';form.elements.date.value='2026-11-04';form.elements.repeatPreset.value='monthly';form.elements.repeatUntil.value='2026-11-30';form.elements.repeatPreset.dispatchEvent(new Event('change',{bubbles:true}));return {hint:document.querySelector('#repeat-date-hint').textContent,hidden:document.querySelector('#repeat-date-hint').hidden,preview:document.querySelector('#repeat-preview').textContent,end:form.elements.repeatUntil.closest('label').textContent};})()`);
    check(!semantics.hidden&&semantics.hint.includes('13')&&semantics.preview.includes('2026.11.04')&&semantics.preview.includes('2026.12.05')&&semantics.end.includes('可以晚于'),'表单解释单期13天日差与重复结束的区别，并预览真实开始和完成日期');
    await js(`import('./date-picker.mjs').then(module=>module.syncDatePickers())`);await pause();
    if(outputDirectory)fs.writeFileSync(path.join(outputDirectory,'repeat-date-meaning.png'),(await mainWindow.webContents.capturePage()).toPNG());
    await select('gantt-status','all');
    await js(`document.querySelector('#new-form').elements.repeatPreset.value='none';document.querySelector('#new-form').elements.repeatPreset.dispatchEvent(new Event('change',{bubbles:true}))`);
    check(await js(`document.querySelector('#repeat-date-hint').hidden`),'取消重复后隐藏单期规则说明');
    await js(`document.querySelector('#new-dialog').close()`);
    return {ok:true,checks,summary,semantics};
  }finally{store.restore(baseline);broadcast();}
};
