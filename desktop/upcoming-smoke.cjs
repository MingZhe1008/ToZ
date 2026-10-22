const fs=require('node:fs'),path=require('node:path');
const {createTask,addDays,upcomingTasks}=require('../prototype/domain.mjs');
const {createSeries,materializeSeries}=require('../prototype/recurrence.mjs');
const pause=()=>new Promise(resolve=>setTimeout(resolve,180));
module.exports=async function upcomingSmoke({store,mainWindow,broadcast,outputDirectory}){
  const baseline=store.snapshot(),today=new Date().toLocaleDateString('sv-SE'),checks=[];
  const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
  const js=code=>mainWindow.webContents.executeJavaScript(code);
  const navigate=async view=>{await js(`document.querySelector('[data-view="${view}"]').click()`);await pause();};
  const read=()=>js(`({ids:[...document.querySelectorAll('#task-list .task-row')].map(el=>el.dataset.task),count:Number(document.querySelector('#upcoming-count').textContent)})`);
  try{
    const start=addDays(today,1),title='最近一期提醒验收';
    const series=createSeries(createTask(title,addDays(start,240),'ToZ','保留全部期次，只收起后续提醒',start),{unit:'month',interval:1,monthEnd:true});
    const instances=materializeSeries([series],[],addDays(today,140),today),first=instances[0],second=instances[1];
    check(instances.length>=3,'验收包含多期未来任务与较长完成区间');
    first.top=false;
    const ordinary=createTask(title,addDays(today,2),'ToZ'),state=store.snapshot();
    state.recurrences.push(series);state.tasks.unshift(...[...instances].reverse(),ordinary);
    state.preferences.taskOrder=[...instances.map(t=>t.id).reverse(),ordinary.id,...state.preferences.taskOrder];
    store.commit(state,state.version);broadcast();await pause();
    const fixtureIDs=new Set([...instances.map(t=>t.id),ordinary.id]),expectedCount=upcomingTasks(baseline.tasks,today).length+2;
    await navigate('upcoming');let rendered=await read();
    check(rendered.ids.filter(id=>fixtureIDs.has(id)).length===2&&rendered.ids.includes(first.id)&&rendered.ids.includes(ordinary.id),'未来多期只显示最近一期，同名普通任务单独保留');
    check(rendered.count===expectedCount,'侧栏即将到来计数与合并后的提醒数量一致');
    await js(`document.querySelector('#task-search').value=${JSON.stringify(title)};document.querySelector('#task-search').dispatchEvent(new Event('input',{bubbles:true}))`);
    mainWindow.show();await pause();
    if(outputDirectory)fs.writeFileSync(path.join(outputDirectory,'upcoming-nearest.png'),(await mainWindow.webContents.capturePage()).toPNG());
    await js(`document.querySelector('#task-list .task-row[data-task=${JSON.stringify(first.id)}] [data-action="complete"]').click()`);await pause();rendered=await read();
    check(!rendered.ids.includes(first.id)&&rendered.ids.includes(second.id)&&rendered.count===expectedCount,'完成最近一期后实际列表与计数自动展示下一期');
    await navigate('all');rendered=await read();
    check(instances.every(task=>rendered.ids.includes(task.id)),'全部任务仍保留每一个周期期次');
    await js(`document.querySelector('#task-list .task-row[data-task=${JSON.stringify(first.id)}] [data-action="complete"]').click()`);await pause();
    await navigate('upcoming');rendered=await read();
    check(rendered.ids.includes(first.id)&&!rendered.ids.includes(second.id),'重开较早期次后再次显示最近一次提醒');
    return {ok:true,checks,instances:instances.length};
  }finally{store.restore(baseline);broadcast();}
};
