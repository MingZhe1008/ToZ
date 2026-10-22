import {TODAY,uid} from './domain.mjs';

// A dedicated operation, separate from normal edits and append-only history.
// Only soft-deleted objects may be removed. The input stays unchanged.
export function purgeTrash(snapshot,request){
  if(!request||!['all','project','task','subtask'].includes(request.kind))throw new Error('无效的彻底删除操作');
  const next=structuredClone(snapshot),projectNames=new Set(),taskIds=new Set(),childIds=new Map();
  const trashed=next.preferences.projectTrash||[];
  if(request.kind==='all'){
    trashed.forEach(p=>projectNames.add(p.name));next.tasks.filter(t=>t.deletedAt).forEach(t=>taskIds.add(t.id));
    for(const task of next.tasks.filter(t=>!t.deletedAt))childIds.set(task.id,new Set(task.subtasks.filter(s=>s.deletedAt).map(s=>s.id)));
  }else if(request.kind==='project'){
    if(!trashed.some(p=>p.name===request.id))throw new Error('分区已恢复或不在回收站，请重新确认');projectNames.add(request.id);
  }else{
    const task=next.tasks.find(t=>t.id===request.id);if(!task)throw new Error('任务已更新，请重新确认');
    if(request.kind==='task'){if(!task.deletedAt)throw new Error('只能彻底删除回收站中的任务');taskIds.add(task.id);}
    else{const sub=task.subtasks.find(s=>s.id===request.subId&&s.deletedAt);if(!sub)throw new Error('只能彻底删除回收站中的子任务');if(task.deletedAt)throw new Error('请先恢复所属任务，或彻底删除整个任务');childIds.set(task.id,new Set([sub.id]));}
  }
  for(const task of next.tasks.filter(t=>projectNames.has(t.project))){if(!task.deletedAt)throw new Error('分区仍有正常任务，不能彻底删除');taskIds.add(task.id);}
  if(next.recurrences.some(s=>projectNames.has(s.project)&&s.active))throw new Error('分区仍有活动周期，不能彻底删除');
  const removedTasks=next.tasks.filter(t=>taskIds.has(t.id)),counts={projects:projectNames.size,tasks:taskIds.size,subtasks:0};
  next.tasks=next.tasks.filter(t=>!taskIds.has(t.id));
  for(const task of next.tasks){const ids=childIds.get(task.id);if(!ids?.size)continue;counts.subtasks+=ids.size;task.subtasks=task.subtasks.filter(s=>!ids.has(s.id));task.events.push({id:uid(),type:'subtask_purge',date:TODAY,at:new Date().toISOString(),reason:'已彻底删除 '+ids.size+' 个已删除的子任务；原有足迹保留'});}
  next.projects=next.projects.filter(name=>!projectNames.has(name));
  if(!next.projects.length)next.projects.push('未分区');
  const remainingTrash=trashed.filter(item=>!projectNames.has(item.name)),fallback=next.projects.find(name=>!remainingTrash.some(p=>p.name===name));
  if(!fallback)throw new Error('至少需要保留一个正常分区');
  const prefs=next.preferences;prefs.projectTrash=remainingTrash.map(item=>projectNames.has(item.target)?{...item,target:fallback,targetPurged:true}:item);
  prefs.projectColors=Object.fromEntries(Object.entries(prefs.projectColors).filter(([name])=>!projectNames.has(name)));
  prefs.taskOrder=prefs.taskOrder.filter(id=>!taskIds.has(id));if(projectNames.has(prefs.widgetProject))prefs.widgetProject='';
  const remainingProjects=new Map(next.tasks.filter(t=>t.repeatId).map(t=>[t.repeatId,t.project])),removedDates=new Map();
  for(const task of removedTasks.filter(t=>t.repeatId)){if(!removedDates.has(task.repeatId))removedDates.set(task.repeatId,[]);removedDates.get(task.repeatId).push(task.repeatDate);}
  const series=[];
  for(const original of next.recurrences){
    const s=original;
    if(projectNames.has(s.project)){if(!remainingProjects.has(s.id))continue;s.project=remainingProjects.get(s.id);}
    const excluded=removedDates.get(s.id)||[];
    if(excluded.length)s.excludedDates=[...new Set([...(s.excludedDates||[]),...excluded])].sort();
    series.push(s);
  }
  next.recurrences=series;
  return {snapshot:next,counts};
}
