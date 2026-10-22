const fs=require('node:fs'),path=require('node:path');
const {createTask,addDays,toggleDone}=require('../prototype/domain.mjs');
const {createSeries,materializeSeries}=require('../prototype/recurrence.mjs');
const pause=()=>new Promise(resolve=>setTimeout(resolve,220));
module.exports=async function taskListSmoke({store,mainWindow,broadcast,outputDirectory}){
  const baseline=store.snapshot(),today=new Date().toLocaleDateString('sv-SE'),project='分区周期隔离验收',checks=[];
  const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
  const js=code=>mainWindow.webContents.executeJavaScript(code);
  const navigate=async view=>{await js(`document.querySelector('[data-view=${JSON.stringify(view)}]').click()`);await pause();};
  const input=async(id,value)=>{await js(`document.getElementById(${JSON.stringify(id)}).value=${JSON.stringify(value)};document.getElementById(${JSON.stringify(id)}).dispatchEvent(new Event('input',{bubbles:true}))`);await pause();};
  try{
    const start=addDays(today,1),series=createSeries(createTask('月末回顾',addDays(start,240),project,'每期独立记录',start),{unit:'month',interval:1,monthEnd:true});
    const instances=materializeSeries([series],[],addDays(today,140),today),[history,first,second]=instances;
    check(instances.length>=4,'多期长跨度周期夹具已生成');toggleDone(history);first.top=false;second.note='隐藏期次专用检索';
    const ordinary=createTask('月末回顾',start,project),state=store.snapshot();state.projects.push(project);state.preferences.projectColors[project]='#af52de';
    state.recurrences.push(series);state.tasks.unshift(...[...instances].reverse(),ordinary);state.preferences.taskOrder=[...instances.map(t=>t.id).reverse(),ordinary.id,...state.preferences.taskOrder];
    store.commit(state,state.version);broadcast();await pause();
    const fixture=new Set([...instances.map(t=>t.id),ordinary.id]);
    const read=()=>js(`({ids:[...document.querySelectorAll('#task-list .task-row')].map(el=>el.dataset.task),caption:document.querySelector('#progress-caption').textContent,percent:document.querySelector('#progress-percent').textContent,badge:document.querySelector('[data-view=${JSON.stringify('project:'+project)}] .nav-count').textContent,toggle:document.querySelector('[data-action="toggle-repeat-instances"][data-repeat=${JSON.stringify(series.id)}]')?.getAttribute('aria-expanded')})`);
    const toggle=async()=>{await js(`document.querySelector('[data-action="toggle-repeat-instances"][data-repeat=${JSON.stringify(series.id)}]').click()`);await pause();};
    const complete=async task=>{await js(`document.querySelector('#task-list .task-row[data-task=${JSON.stringify(task.id)}] [data-action="complete"]').click()`);await pause();};
    await navigate('project:'+project);let rendered=await read();
    check(rendered.ids.length===3&&rendered.ids.includes(first.id)&&rendered.ids.includes(history.id)&&rendered.ids.includes(ordinary.id)&&rendered.toggle==='false','分区默认仅一条未完成周期，同名普通任务与已完成历史保留');
    check(rendered.badge==='2'&&rendered.caption.includes(`1 / ${instances.length+1}`)&&rendered.caption.includes(`已收起 ${instances.length-2}`),'分区计数按逻辑待办，进度仍按真实期次数量计算');
    const version=store.snapshot().version,percent=rendered.percent;
    await toggle();rendered=await read();
    check(instances.every(t=>rendered.ids.includes(t.id))&&rendered.ids.filter(id=>instances.some(t=>t.id===id))[0]===first.id&&rendered.toggle==='true','展开后可访问全部期次，待处理一期排在其余未完成期之前');
    check(rendered.percent===percent&&rendered.badge==='2'&&!rendered.caption.includes('已收起')&&store.snapshot().version===version,'展开不改保存数据、实际进度或侧栏计数');
    await navigate('all');rendered=await read();
    check(rendered.ids.filter(id=>fixture.has(id)).length===3&&rendered.toggle==='false','全部任务也默认合并，展开状态与分区独立');
    await toggle();rendered=await read();check(instances.every(t=>rendered.ids.includes(t.id)),'全部任务可展开每个真实期次');await toggle();
    await navigate('project:'+project);rendered=await read();check(rendered.toggle==='true','返回分区保留本会话展开状态');await toggle();
    await complete(first);rendered=await read();check(rendered.ids.includes(first.id)&&rendered.ids.includes(second.id)&&rendered.ids.length===4,'完成当前一期后显示下一期，已完成记录保留');
    await complete(first);rendered=await read();check(rendered.ids.includes(first.id)&&!rendered.ids.includes(second.id)&&rendered.ids.length===3,'重开较早一期后重新选择待处理期次');
    await input('task-search','隐藏期次专用检索');rendered=await read();check(rendered.ids.length===1&&rendered.ids[0]===second.id&&rendered.toggle===undefined,'分区关键词可直接找到被收起期次');
    await input('task-search','');rendered=await read();check(rendered.ids.length===3,'清空筛选恢复默认合并');
    await input('global-search','隐藏期次专用检索');rendered=await read();check(rendered.ids.length===1&&rendered.ids[0]===second.id,'全局搜索可直接找到被收起期次');
    await input('task-search','');rendered=await read();check(rendered.ids.length===3&&rendered.toggle==='false','在列表内清空全局关键词也恢复原分区合并');
    for(const dark of [true,false]){
      const themed=store.snapshot();themed.dark=dark;store.commit(themed,themed.version);broadcast();mainWindow.show();await pause();
      if(outputDirectory)fs.writeFileSync(path.join(outputDirectory,`project-repeat-${dark?'dark':'light'}.png`),(await mainWindow.webContents.capturePage()).toPNG());
    }
    await toggle();await pause();
    if(outputDirectory)fs.writeFileSync(path.join(outputDirectory,'project-repeat-expanded.png'),(await mainWindow.webContents.capturePage()).toPNG());
    await navigate('today');
    return {ok:true,checks,instances:instances.length};
  }finally{store.restore(baseline);broadcast();}
};
