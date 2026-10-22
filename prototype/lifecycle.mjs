import {TODAY,uid,toggleDone,validateSubtaskPlan} from './domain.mjs';

const stamp=()=>new Date().toISOString();
const record=(task,type,fields={})=>task.events.push({id:uid(),type,date:TODAY,at:stamp(),...fields});
export const visibleSubtasks=task=>task.subtasks.filter(sub=>!sub.deletedAt);
export const activeProjects=snapshot=>snapshot.projects.filter(name=>!(snapshot.preferences.projectTrash||[]).some(item=>item.name===name));
export function moveTask(snapshot,id,target){
  const task=snapshot.tasks.find(t=>t.id===id&&!t.deletedAt);
  if(!task)throw new Error('任务不存在或已删除');
  if(!activeProjects(snapshot).includes(target))throw new Error('请选择有效的分区');
  if(task.project===target)return false;
  const from=task.project;task.project=target;record(task,'project_move',{fromProject:from,toProject:target,reason:from+' → '+target});return true;
}
export function addSubtask(task,value,planStart=null,plan=null){
  if(!task||task.deletedAt||task.done)throw new Error('请先重新打开有效主任务');
  const title=value.trim();if(!title||title.length>120)throw new Error('子任务名称应为 1–120 个字符');
  validateSubtaskPlan(task,planStart,plan);
  const sub={id:uid(),title,done:false,planStart,plan};task.subtasks.push(sub);
  record(task,'subtask_add',{subId:sub.id,planStart,plan,reason:title+(planStart?' · '+planStart+' → '+plan:'')});return sub;
}
export function editSubtask(task,id,value,dates){
  const sub=task.subtasks.find(s=>s.id===id&&!s.deletedAt);if(!sub||task.deletedAt)throw new Error('子任务不存在或已删除');
  const title=value.trim();if(!title||title.length>120)throw new Error('子任务名称应为 1–120 个字符');
  const start=dates?dates.planStart||null:sub.planStart||null,end=dates?dates.plan||null:sub.plan||null;
  validateSubtaskPlan(task,start,end);
  const renamed=title!==sub.title,scheduled=start!==(sub.planStart||null)||end!==(sub.plan||null);
  if(renamed)record(task,'subtask_rename',{subId:id,fromTitle:sub.title,toTitle:title,reason:sub.title+' → '+title});
  if(scheduled)record(task,'subtask_schedule',{subId:id,fromStart:sub.planStart||null,from:sub.plan||null,toStart:start,to:end,reason:title+'：'+(sub.planStart?sub.planStart+' → '+sub.plan:'未排期')+'；调整为 '+(start?start+' → '+end:'不设日期')});
  sub.title=title;if(scheduled){sub.planStart=start;sub.plan=end;}return renamed||scheduled;
}
export function deleteSubtask(task,id){
  const sub=task.subtasks.find(s=>s.id===id&&!s.deletedAt);if(!sub||task.deletedAt)throw new Error('子任务不存在或已删除');
  sub.deletedAt=stamp();record(task,'subtask_delete',{subId:id,reason:sub.title});
}
export function deleteTask(task,byProject=null){
  if(task.deletedAt)return false;
  task.deletedAt=stamp();task.deletedByProject=byProject;record(task,'task_delete',{reason:byProject?'随分区“'+byProject+'”移入回收站':'移入回收站'});return true;
}
export function restoreSubtask(task,id){
  const sub=task.subtasks.find(s=>s.id===id&&s.deletedAt);if(!sub||task.deletedAt)throw new Error('请先恢复所属任务');
  validateSubtaskPlan(task,sub.planStart,sub.plan);
  if(task.done&&!sub.done)toggleDone(task);
  sub.deletedAt=null;record(task,'subtask_restore',{subId:id,reason:sub.title});
}
function fallbackProject(snapshot){
  const visible=activeProjects(snapshot);if(visible.length)return visible[0];
  let name='未分区',n=2;while(snapshot.projects.includes(name))name='未分区 '+n++;
  snapshot.projects.push(name);return name;
}
export function restoreTask(snapshot,id){
  const task=snapshot.tasks.find(t=>t.id===id&&t.deletedAt);if(!task)throw new Error('任务不在回收站');
  if(!activeProjects(snapshot).includes(task.project)){
    const target=fallbackProject(snapshot);record(task,'project_move',{fromProject:task.project,toProject:target,reason:'恢复到分区：'+target});task.project=target;
  }
  task.deletedAt=null;task.deletedByProject=null;record(task,'task_restore',{reason:task.cancelled?'已恢复历史；原周期已停止，此期仍取消排期':'从回收站恢复'});
}
export function deleteProject(snapshot,name,{mode='move',target=null}={}){
  if(!activeProjects(snapshot).includes(name))throw new Error('分区不存在或已删除');
  if(!['move','trash'].includes(mode))throw new Error('请选择分区删除方式');
  if(mode==='move'&&target&&(!activeProjects(snapshot).includes(target)||target===name))throw new Error('请选择其他分区');
  const trash=snapshot.preferences.projectTrash||=[];
  const item={name,at:stamp(),mode,target:null};trash.push(item);
  if(mode==='move'){
    target ||= fallbackProject(snapshot);item.target=target;
    for(const task of snapshot.tasks.filter(t=>t.project===name)){
      record(task,'project_move',{fromProject:name,toProject:target,reason:'删除分区后移入：'+target});task.project=target;
    }
    for(const series of snapshot.recurrences.filter(s=>s.project===name))series.project=target;
  }else{
    for(const task of snapshot.tasks.filter(t=>t.project===name))deleteTask(task,name);
    for(const series of snapshot.recurrences.filter(s=>s.project===name&&s.active))series.active=false;
    fallbackProject(snapshot);
  }
  if(snapshot.preferences.widgetProject===name)snapshot.preferences.widgetProject='';
  return item;
}
export function restoreProject(snapshot,name){
  const item=snapshot.preferences.projectTrash?.find(item=>item.name===name);if(!item)throw new Error('分区不在回收站');
  snapshot.preferences.projectTrash=snapshot.preferences.projectTrash.filter(item=>item!==item);
  if(item.mode==='trash')for(const task of snapshot.tasks.filter(t=>t.deletedAt&&t.deletedByProject===name))restoreTask(snapshot,task.id);
  return item;
}

// Validate changes at the SQLite boundary as well as in the UI.
export function validateLifecycleTransition(current,next){
  const oldTrash=current.preferences.projectTrash||[],newTrash=next.preferences.projectTrash||[],oldNames=new Set(oldTrash.map(i=>i.name));
  const added=newTrash.filter(item=>!oldNames.has(item.name));
  const tasks=new Map(next.tasks.map(t=>[t.id,t]));
  const transfers={};
  for(const item of added){
    if(item.mode==='move'){
      Object.defineProperty(transfers,item.name,{value:item.target,enumerable:true});
      for(const old of current.tasks.filter(t=>t.project===item.name)){
        const task=tasks.get(old.id);
        if(!task||task.project!==item.target||!task.events.slice(old.events.length).some(e=>e.type==='project_move'&&e.fromProject===item.name&&e.toProject===item.target))throw new Error('删除分区必须同步迁移任务并保留足迹');
      }
    }else{
      if(next.tasks.some(t=>t.project===item.name&&!t.deletedAt)||next.recurrences.some(s=>s.project===item.name&&s.active))throw new Error('删除分区必须同步处理任务和周期');
    }
  }
  for(const old of current.tasks){
    const task=tasks.get(old.id);if(!task)continue;
    const events=task.events.slice(old.events.length);
    if((old.deletedAt||null)!==(task.deletedAt||null)&&!events.some(e=>e.type===(task.deletedAt?'task_delete':'task_restore')))throw new Error('删除或恢复任务必须记录足迹');
    const children=new Map(task.subtasks.map(s=>[s.id,s]));
    for(const sub of old.subtasks){
      const updated=children.get(sub.id);if(!updated)throw new Error('子任务请移入回收站，不能直接删除历史');
      if(updated.title!==sub.title&&!events.some(e=>e.type==='subtask_rename'&&e.subId===sub.id&&e.fromTitle===sub.title&&e.toTitle===updated.title))throw new Error('修改子任务名称必须记录足迹');
      if(((sub.planStart||null)!==(updated.planStart||null)||(sub.plan||null)!==(updated.plan||null))&&!events.some(e=>e.type==='subtask_schedule'&&e.subId===sub.id&&e.fromStart===(sub.planStart||null)&&e.from===(sub.plan||null)&&e.toStart===(updated.planStart||null)&&e.to===(updated.plan||null)))throw new Error('调整子任务日期必须记录足迹');
      if((sub.deletedAt||null)!==(updated.deletedAt||null)&&!events.some(e=>e.type===(updated.deletedAt?'subtask_delete':'subtask_restore')&&e.subId===sub.id))throw new Error('删除或恢复子任务必须记录足迹');
    }
  }
  return transfers;
}
