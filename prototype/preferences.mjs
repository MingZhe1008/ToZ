export const MENU_KEYS=['today','calendar','gantt','upcoming','all','delayed','done'];
export function preferences(value={},projects=[],tasks=[]){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('显示设置无效');
  const colors=value.projectColors||{};
  if(!colors||typeof colors!=='object'||Array.isArray(colors)||Object.entries(colors).some(([key,color])=>!projects.includes(key)||typeof color!=='string'||!/^#[0-9a-f]{6}$/i.test(color)))throw new Error('分区颜色无效');
  const order=(input,keys,limit)=>{const allowed=new Set(keys),seen=new Set(input);if(!Array.isArray(input)||input.length>limit||seen.size!==input.length||input.some(key=>!allowed.has(key)))throw new Error('排序数据无效');return [...input,...keys.filter(k=>!seen.has(k))];};
  const menuOrder=order(value.menuOrder||[],MENU_KEYS,7);
  const taskOrder=order(value.taskOrder||[],tasks.map(t=>t.id),50000);
  const widgetProject=value.widgetProject||'';if(widgetProject&&!projects.includes(widgetProject))throw new Error('浮窗筛选分区不存在');
  const projectTrash=value.projectTrash||[];
  if(!Array.isArray(projectTrash)||projectTrash.length>1000||new Set(projectTrash.map(i=>i.name)).size!==projectTrash.length||projectTrash.some(i=>!projects.includes(i.name)||typeof i.at!=='string'||!Number.isFinite(Date.parse(i.at))||!['move','trash'].includes(i.mode)||i.mode==='move'&&(!projects.includes(i.target)||i.target===i.name)))throw new Error('分区回收站数据无效');
  if(projectTrash.some(i=>i.name===widgetProject)&&widgetProject)throw new Error('不能筛选已删除的分区');
  return {projectTrash:structuredClone(projectTrash),projectColors:{...colors},menuOrder,taskOrder,widgetProject};
}
export function sortedTasks(tasks,order=[]){
  const ranks=new Map(order.map((id,i)=>[id,i]));
  return [...tasks].sort((a,b)=>Number(!!b.top)-Number(!!a.top)||(ranks.get(a.id)??Infinity)-(ranks.get(b.id)??Infinity));
}
export function moveBefore(order,id,target,after=false){
  if(id===target||!order.includes(id)||!order.includes(target))return [...order];
  const result=order.filter(key=>key!==id);result.splice(result.indexOf(target)+(after?1:0),0,id);return result;
}
export function renameProject(snapshot,from,to){
  if(!snapshot.projects.includes(from))throw new Error('分区不存在');
  if(snapshot.projects.some(name=>name!==from&&name.toLocaleLowerCase()===to.toLocaleLowerCase()))throw new Error('分区名称已存在');
  snapshot.projects=snapshot.projects.map(name=>name===from?to:name);
  for(const task of snapshot.tasks)if(task.project===from)task.project=to;
  for(const series of snapshot.recurrences)if(series.project===from)series.project=to;
  const prefs=snapshot.preferences;
  if(Object.hasOwn(prefs.projectColors,from))prefs.projectColors=Object.fromEntries(Object.entries(prefs.projectColors).map(([name,color])=>[name===from?to:name,color]));
  if(prefs.widgetProject===from)prefs.widgetProject=to;
  for(const item of prefs.projectTrash||[])if(item.target===from)item.target=to;
  return snapshot;
}
