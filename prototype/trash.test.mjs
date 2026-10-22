import test from 'node:test';
import assert from 'node:assert/strict';
import {createTask,startTask} from './domain.mjs';
import {preferences} from './preferences.mjs';
import {deleteTask,deleteSubtask,deleteProject,moveTask,restoreProject} from './lifecycle.mjs';
import {createSeries,materializeSeries,validateSeries} from './recurrence.mjs';
import {purgeTrash} from './trash.mjs';
const fixture=()=>{const tasks=[createTask('正常任务','2026-10-25','ToZ','','2026-10-20')],projects=['ToZ','个人'];tasks[0].subtasks=[{id:'one',title:'可删除子任务',done:false}];return {tasks,projects,preferences:preferences({},projects,tasks),recurrences:[]};};
test('彻底删除只移除回收站任务及其子任务和足迹，原输入与正常任务保留',()=>{
  const state=fixture(),removed=createTask('已删除','2026-10-25','ToZ');removed.subtasks=[{id:'inside',title:'随父任务删除',done:false}];deleteTask(removed);state.tasks.push(removed);const before=structuredClone(state);
  const {snapshot,counts}=purgeTrash(state,{kind:'task',id:removed.id});assert.deepEqual(counts,{projects:0,tasks:1,subtasks:0});assert.equal(snapshot.tasks.length,1);assert.deepEqual(snapshot.tasks[0],state.tasks[0]);assert.deepEqual(state,before);assert(!snapshot.preferences.taskOrder.includes(removed.id));
  assert.throws(()=>purgeTrash(state,{kind:'task',id:state.tasks[0].id}));
});
test('单个子任务彻底删除保留父任务原日期与足迹，只移除已删除子项',()=>{
  const state=fixture(),task=state.tasks[0];startTask(task);deleteSubtask(task,'one');const before=structuredClone(task),{snapshot,counts}=purgeTrash(state,{kind:'subtask',id:task.id,subId:'one'}),next=snapshot.tasks[0];
  assert.equal(counts.subtasks,1);assert.equal(next.subtasks.length,0);assert.equal(next.started,before.started);assert.equal(next.initialPlan,before.initialPlan);assert.deepEqual(next.events.slice(0,-1),before.events);assert.equal(next.events.at(-1).type,'subtask_purge');assert.throws(()=>purgeTrash(fixture(),{kind:'subtask',id:fixture().tasks[0].id,subId:'one'}));
});
test('彻底删除分区保留已迁出的本期任务及其停止的周期来源',()=>{
  const state=fixture(),series=createSeries(state.tasks[0],{unit:'day',interval:1},'2026-10-25');state.recurrences=[series];state.tasks=materializeSeries([series],[],'2026-10-23');state.preferences=preferences({},state.projects,state.tasks);const moved=state.tasks[0];moveTask(state,moved.id,'个人');deleteProject(state,'ToZ',{mode:'trash'});
  const {snapshot}=purgeTrash(state,{kind:'project',id:'ToZ'});assert.deepEqual(snapshot.projects,['个人']);assert.equal(snapshot.tasks.length,1);assert.deepEqual(snapshot.tasks[0],moved);assert.equal(snapshot.recurrences[0].project,'个人');assert.equal(snapshot.recurrences[0].active,false);validateSeries(snapshot.recurrences);preferences(snapshot.preferences,snapshot.projects,snapshot.tasks);
});
test('清空整个回收站覆盖分区、任务、子任务，正常内容保留',()=>{
  const state=fixture();deleteProject(state,'ToZ',{mode:'move',target:'个人'});deleteProject(state,'个人',{mode:'trash'});const keep=createTask('保留正常内容','2026-10-25','未分区');keep.subtasks=[{id:'gone',title:'删除项',done:false},{id:'keep',title:'保留项',done:false}];deleteSubtask(keep,'gone');state.tasks.push(keep);
  const {snapshot,counts}=purgeTrash(state,{kind:'all'});assert.deepEqual(counts,{projects:2,tasks:1,subtasks:1});assert.deepEqual(snapshot.projects,['未分区']);assert.equal(snapshot.tasks.length,1);assert.equal(snapshot.tasks[0].title,'保留正常内容');assert.equal(snapshot.tasks[0].subtasks[0].id,'keep');assert.equal(snapshot.preferences.projectTrash.length,0);preferences(snapshot.preferences,snapshot.projects,snapshot.tasks);
});
test('分区目标被彻底删除后，其他回收站分区仍可恢复为空分区',()=>{
  const state=fixture();deleteProject(state,'ToZ',{mode:'move',target:'个人'});deleteProject(state,'个人',{mode:'trash'});
  const {snapshot}=purgeTrash(state,{kind:'project',id:'个人'});assert.equal(snapshot.preferences.projectTrash[0].targetPurged,true);assert.equal(snapshot.preferences.projectTrash[0].target,'未分区');restoreProject(snapshot,'ToZ');assert.equal(snapshot.tasks.length,0);assert(snapshot.projects.includes('ToZ'));preferences(snapshot.preferences,snapshot.projects,snapshot.tasks);
});
test('周期本期彻底删除后永不补回，其他期次和模板继续保留',()=>{
  const state=fixture(),series=createSeries(state.tasks[0],{unit:'day',interval:1},'2026-10-30');state.recurrences=[series];state.tasks=materializeSeries([series],[],'2026-10-23');const task=state.tasks[0];deleteTask(task);
  const {snapshot}=purgeTrash(state,{kind:'task',id:task.id});assert.deepEqual(snapshot.recurrences[0].excludedDates,[task.repeatDate]);assert.equal(snapshot.recurrences[0].active,true);const added=materializeSeries(snapshot.recurrences,snapshot.tasks,'2026-10-25');assert(added.length);assert(!added.some(t=>t.repeatDate===task.repeatDate));
  assert.throws(()=>validateSeries([{...series,excludedDates:['2026-02-30']}]),/期次/);assert.throws(()=>validateSeries([{...series,excludedDates:['2026-10-20','2026-10-20']}]),/期次/);
});
test('拒绝正常分区、正常子任务、失效任务与无效请求，空回收站可安全重复清空',()=>{
  const state=fixture();for(const request of [null,{kind:'unknown'},{kind:'project',id:'ToZ'},{kind:'task',id:'missing'},{kind:'subtask',id:state.tasks[0].id,subId:'one'}])assert.throws(()=>purgeTrash(state,request));
  const {snapshot,counts}=purgeTrash(state,{kind:'all'});assert.deepEqual(counts,{projects:0,tasks:0,subtasks:0});assert.deepEqual(snapshot,state);
});
test('连续彻底删除多年后的下一期，低频周期仍能找到更远的可用期次',()=>{
  const series=createSeries(createTask('年计划','2026-10-20','ToZ','','2026-10-20'),{unit:'year',interval:1},'2032-10-20');series.excludedDates=['2027-10-20','2028-10-20','2029-10-20','2030-10-20'];
  const added=materializeSeries([series],[],'2026-11-30','2026-10-21');assert(added.some(t=>t.repeatDate==='2031-10-20'));assert(!added.some(t=>series.excludedDates.includes(t.repeatDate)));
});
