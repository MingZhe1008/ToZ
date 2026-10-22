import test from 'node:test';
import assert from 'node:assert/strict';
import {createTask,startTask,toggleDone,todayTasks,upcomingTasks,taskDateRange,reschedule} from './domain.mjs';
import {createSeries,materializeSeries} from './recurrence.mjs';
import {preferences} from './preferences.mjs';
import {addSubtask,editSubtask,deleteSubtask,deleteTask,restoreSubtask,restoreTask,deleteProject,restoreProject,activeProjects,visibleSubtasks,validateLifecycleTransition,moveTask} from './lifecycle.mjs';
const make=()=>{const task=createTask('保留足迹','2026-10-25','ToZ','','2026-10-20');task.subtasks=[{id:'child',title:'原子任务',done:false}];return task;};
const state=()=>{const tasks=[make()],projects=['ToZ','个人'];return {tasks,projects,recurrences:[],preferences:preferences({},projects,tasks)};};
test('任务切换分区只修改归属并追加足迹，首次开始、日期、子任务与顺序保留',()=>{
  const snapshot=state(),task=snapshot.tasks[0];startTask(task);task.top=true;
  const old=structuredClone(snapshot),before=structuredClone(task);
  assert.equal(moveTask(snapshot,task.id,'个人'),true);assert.equal(task.project,'个人');
  assert.deepEqual({...task,project:before.project,events:before.events},before);
  assert.deepEqual(task.events.slice(0,-1),before.events);assert.equal(task.events.at(-1).type,'project_move');assert.equal(task.events.at(-1).fromProject,'ToZ');assert.equal(task.events.at(-1).toProject,'个人');
  assert.deepEqual(snapshot.preferences,old.preferences);validateLifecycleTransition(old,snapshot);
  const count=task.events.length;assert.equal(moveTask(snapshot,task.id,'个人'),false);assert.equal(task.events.length,count);
  assert.throws(()=>moveTask(snapshot,task.id,'不存在'));deleteProject(snapshot,'ToZ',{mode:'move',target:'个人'});assert.throws(()=>moveTask(snapshot,task.id,'ToZ'));
  deleteTask(task);assert.throws(()=>moveTask(snapshot,task.id,'个人'));
});
test('切换周期任务本期的分区不改变模板和其他期次',()=>{
  const snapshot=state(),series=createSeries(snapshot.tasks[0],{unit:'day',interval:1},'2026-10-30');snapshot.recurrences=[series];snapshot.tasks=materializeSeries([series],[],'2026-10-23');
  const before=structuredClone(snapshot),task=snapshot.tasks[0];moveTask(snapshot,task.id,'个人');
  assert.deepEqual(series,before.recurrences[0]);assert.deepEqual(snapshot.tasks.slice(1),before.tasks.slice(1));validateLifecycleTransition(before,snapshot);
  assert(materializeSeries([series],snapshot.tasks,'2026-10-25').every(t=>t.project==='ToZ'));
});
test('子任务可改名、软删除与恢复，保留完成状态和追加的足迹',()=>{
  const task=make(),history=structuredClone(task.events);editSubtask(task,'child','  新名称  ');assert.equal(task.subtasks[0].title,'新名称');assert.equal(task.subtasks[0].done,false);assert.equal(task.events.at(-1).type,'subtask_rename');
  assert.throws(()=>editSubtask(task,'child',' '));assert.throws(()=>editSubtask(task,'child','x'.repeat(121)));
  deleteSubtask(task,'child');assert.equal(visibleSubtasks(task).length,0);toggleDone(task);assert.equal(task.done,true);
  restoreSubtask(task,'child');assert.equal(task.done,false);assert.equal(visibleSubtasks(task).length,1);assert.equal(task.events.at(-2).type,'reopen');assert.deepEqual(task.events.slice(0,history.length),history);
});
test('删除任务从今日、未来与日历消失，恢复保留首次开始和延期',()=>{
  const snapshot=state(),task=snapshot.tasks[0];startTask(task);const before=structuredClone(task);deleteTask(task);
  assert.equal(todayTasks([task]).length,0);assert.equal(upcomingTasks([task]).length,0);assert.equal(taskDateRange(task),null);
  restoreTask(snapshot,task.id);assert.equal(task.started,before.started);assert.equal(task.initialPlan,before.initialPlan);assert.equal(task.plan,before.plan);assert.deepEqual(task.events.slice(0,before.events.length),before.events);
  assert.equal(todayTasks([task]).length,1);
});
test('删除单个周期实例不补出重复实例，也不影响其他期次',()=>{
  const snapshot=state(),series=createSeries(snapshot.tasks[0],{unit:'day',interval:1},'2026-10-23');snapshot.recurrences=[series];snapshot.tasks=materializeSeries([series],[],'2026-10-23');
  const task=snapshot.tasks[0];deleteTask(task);assert.equal(series.active,true);assert.equal(materializeSeries([series],snapshot.tasks,'2026-10-23').length,0);assert(snapshot.tasks.slice(1).every(t=>!t.deletedAt));
});
test('删除分区可迁移任务和周期，删除后恢复空分区保留颜色和顺序',()=>{
  const snapshot=state(),series=createSeries(snapshot.tasks[0],{unit:'day',interval:1},'2026-10-22');snapshot.recurrences=[series];snapshot.preferences.projectColors.ToZ='#30b0c7';snapshot.preferences.widgetProject='ToZ';const old=structuredClone(snapshot);
  deleteProject(snapshot,'ToZ',{mode:'move',target:'个人'});assert.deepEqual(activeProjects(snapshot),['个人']);assert.equal(snapshot.tasks[0].project,'个人');assert.equal(series.project,'个人');assert.equal(snapshot.preferences.widgetProject,'');validateLifecycleTransition(old,snapshot);
  restoreProject(snapshot,'ToZ');assert.deepEqual(activeProjects(snapshot),['ToZ','个人']);assert.equal(snapshot.tasks[0].project,'个人');assert.equal(snapshot.preferences.projectColors.ToZ,'#30b0c7');
});
test('分区和任务一起删除会停止周期，恢复只恢复随分区删除的任务',()=>{
  const snapshot=state(),previous=createTask('此前单独删除','2026-10-20','ToZ');deleteTask(previous);snapshot.tasks.push(previous);
  snapshot.recurrences=[createSeries(snapshot.tasks[0],{unit:'day',interval:1})];const old=structuredClone(snapshot);deleteProject(snapshot,'ToZ',{mode:'trash'});
  assert(snapshot.tasks.every(t=>t.deletedAt));assert.equal(snapshot.recurrences[0].active,false);validateLifecycleTransition(old,snapshot);
  restoreProject(snapshot,'ToZ');assert.equal(snapshot.tasks[0].deletedAt,null);assert(previous.deletedAt);assert.equal(snapshot.recurrences[0].active,false);
});
test('最后一个分区删除创建可用的未分区，单独恢复任务可处理原分区已删除',()=>{
  const snapshot=state();snapshot.projects=['ToZ'];snapshot.preferences=preferences({},snapshot.projects,snapshot.tasks);deleteProject(snapshot,'ToZ',{mode:'trash'});
  assert.deepEqual(activeProjects(snapshot),['未分区']);restoreTask(snapshot,snapshot.tasks[0].id);assert.equal(snapshot.tasks[0].project,'未分区');assert.equal(snapshot.tasks[0].deletedAt,null);
});
test('未审计的子任务改名、硬删除、软删除和任务软删除均被拒绝',()=>{
  const old=state();for(const change of [s=>s.tasks[0].subtasks[0].title='偷偷改名',s=>s.tasks[0].subtasks=[],s=>s.tasks[0].deletedAt=new Date().toISOString(),s=>s.tasks[0].subtasks[0].deletedAt=new Date().toISOString()]){const next=structuredClone(old);change(next);assert.throws(()=>validateLifecycleTransition(old,next));}
});


test('子任务日期可不设或包含主任务边界，倒置越界与不完整排期均拒绝且不改写',()=>{
  const task=make();addSubtask(task,'无日期');
  const sub=addSubtask(task,'主任务范围内','2026-10-20','2026-10-25');assert.equal(sub.planStart,task.planStart);assert.equal(sub.plan,task.plan);
  for(const dates of [['2026-10-19','2026-10-21'],['2026-10-24','2026-10-26'],['2026-10-24','2026-10-23'],['2026-10-21',null],[null,'2026-10-22'],['bad','2026-10-22']]){
    const before=structuredClone(task);assert.throws(()=>addSubtask(task,'拒绝',...dates));assert.deepEqual(task,before);
    assert.throws(()=>editSubtask(task,sub.id,'不应改名',{planStart:dates[0],plan:dates[1]}));assert.deepEqual(task,before);
  }
  const undated=createTask('无完整排期',null);assert.throws(()=>addSubtask(undated,'排期','2026-10-20','2026-10-21'));addSubtask(undated,'不排期');
});
test('子任务改期可清空且足迹追加，旧子任务改名兼容，不丢完成状态',()=>{
  const task=make(),sub=task.subtasks[0],old=structuredClone(task.events);sub.done=true;
  editSubtask(task,sub.id,'有排期',{planStart:'2026-10-21',plan:'2026-10-22'});assert.equal(sub.done,true);assert.equal(task.events.at(-1).type,'subtask_schedule');
  assert.deepEqual(task.events.slice(0,old.length),old);const snapshot={tasks:[structuredClone(task)],preferences:{}};
  editSubtask(task,sub.id,'仅改名');assert.equal(sub.plan,'2026-10-22');validateLifecycleTransition(snapshot,{tasks:[task],preferences:{}});
  editSubtask(task,sub.id,'清空日期',{planStart:null,plan:null});assert.equal(sub.planStart,null);assert.equal(sub.plan,null);
});
test('主任务改期不能缩出已有子任务，删除子任务后可改期但越界时不能恢复',()=>{
  const task=make(),sub=addSubtask(task,'子计划','2026-10-21','2026-10-24'),before=structuredClone(task);
  assert.throws(()=>reschedule(task,'2026-10-23','','2026-10-20'),/主任务计划范围/);assert.deepEqual(task,before);
  assert.throws(()=>reschedule(task,'2026-10-25','','2026-10-22'));assert.deepEqual(task,before);
  reschedule(task,'2026-10-26','','2026-10-19');assert.equal(sub.plan,'2026-10-24');
  deleteSubtask(task,sub.id);reschedule(task,'2026-10-23','','2026-10-20');const deleted=structuredClone(task);
  assert.throws(()=>restoreSubtask(task,sub.id),/主任务计划范围/);assert.deepEqual(task,deleted);
  reschedule(task,'2026-10-25','','2026-10-20');restoreSubtask(task,sub.id);assert.equal(sub.deletedAt,null);
});
