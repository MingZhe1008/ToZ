import {TODAY,validDate} from './domain.mjs';

// Collapse open instances for presentation only; history and saved tasks stay intact.
export function taskListPresentation(tasks,{date=TODAY,expanded=new Set(),collapse=true}={}){
  const candidates=tasks.filter(t=>!t.cancelled&&!t.deletedAt),groups=new Map();
  if(!collapse)return {items:candidates,groups};
  const key=t=>[validDate(t.started)&&t.started<=date?'0':'1',[t.planStart,t.plan,t.repeatDate].find(validDate)||'9999-12-31',t.repeatDate||'',t.id].join('/');
  for(const task of candidates){
    if(!task.repeatId||task.done)continue;
    if(!groups.has(task.repeatId))groups.set(task.repeatId,{tasks:[]});
    groups.get(task.repeatId).tasks.push(task);
  }
  for(const [id,group] of groups){
    group.tasks.sort((a,b)=>key(a).localeCompare(key(b)));
    group.representative=group.tasks[0];group.expanded=expanded.has(id);
  }
  const items=[],seen=new Set();
  for(const task of candidates){
    if(!task.repeatId||task.done){items.push(task);continue;}
    if(seen.has(task.repeatId))continue;seen.add(task.repeatId);
    const group=groups.get(task.repeatId);
    items.push(...(group.expanded?group.tasks:[group.representative]));
  }
  return {items,groups};
}
