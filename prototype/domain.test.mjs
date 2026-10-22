import test from 'node:test';
import assert from 'node:assert/strict';
import { createTask, reschedule, startTask, toggleDone, duration, postponements, shiftedDays, todayTasks, validDate, seedTasks, TODAY, upcomingTasks, taskDateRange } from './domain.mjs';
import { monthDays, shiftMonth, tasksByDate, dayPreview } from './calendar.mjs';

test('连续延期保留首次开始和最初计划，并计算每次后移',()=>{
  const task=seedTasks()[0];assert.equal(duration(task),9);assert.equal(postponements(task).length,3);assert.equal(shiftedDays(task),5);
  reschedule(task,'2026-10-23','等待评审');assert.equal(task.started,'2026-10-12');assert.equal(task.initialPlan,'2026-10-15');assert.equal(task.plan,'2026-10-23');assert.equal(postponements(task).length,4);assert.equal(shiftedDays(task),8);assert.equal(task.events.at(-1).reason,'等待评审');
});
test('未开始的延期不伪造开始；开始重复执行不重写',()=>{
  const task=createTask('测试',TODAY);reschedule(task,'2026-10-21');assert.equal(duration(task),null);assert.equal(task.started,null);assert.equal(startTask(task),true);const length=task.events.length;assert.equal(startTask(task),false);assert.equal(task.events.length,length);assert.equal(task.started,TODAY);
});
test('同日提交不产生历史，提前调整不增加延期统计',()=>{
  const task=seedTasks()[0],count=task.events.length;assert.throws(()=>reschedule(task,TODAY));assert.equal(task.events.length,count);reschedule(task,'2026-10-18');assert.equal(postponements(task).length,3);assert.equal(shiftedDays(task),5);assert.equal(task.events.at(-1).type,'earlier');
});
test('父任务不能跳过未完成子任务，完成后重开保留历史',()=>{
  const task=seedTasks()[0];assert.throws(()=>toggleDone(task));task.subtasks.forEach(s=>s.done=true);toggleDone(task);assert.equal(task.done,true);assert.equal(duration(task),9);assert.throws(()=>reschedule(task,'2026-10-23'));toggleDone(task);assert.equal(task.started,'2026-10-12');assert.equal(task.completedDate,null);assert.equal(task.events.at(-2).type,'complete');assert.equal(task.events.at(-1).type,'reopen');
});
test('跨日遗留和已开始任务留在今日，未开始的未来和无日期任务不进入',()=>{
  const tasks=seedTasks();let daily=todayTasks(tasks);assert.equal(daily.length,6);assert(daily.some(t=>t.id==='backup'));assert(!daily.some(t=>t.id==='ios'||t.id==='inbox'));reschedule(tasks[0],'2026-10-21');assert(todayTasks(tasks).some(t=>t.id==='toz'));assert(!upcomingTasks(tasks).some(t=>t.id==='toz'));
});
test('首次设置计划固定原日期，拒绝非法日期',()=>{
  const task=createTask('待安排',null);reschedule(task,'2026-10-21');reschedule(task,'2026-10-23');assert.equal(task.initialPlan,'2026-10-21');assert.equal(task.events.at(-2).type,'schedule');assert.equal(postponements(task).length,1);assert.equal(validDate('2026-02-30'),false);assert.throws(()=>reschedule(task,'2026-02-30'));assert.throws(()=>createTask(' ',TODAY));
});

test('月历周一开始，补齐相邻月份，正确处理闰年和跨年',()=>{
  const october=monthDays('2026-10');assert.equal(october[0].date,'2026-09-28');assert.equal(october.length,35);assert.equal(october.filter(d=>d.inMonth).length,31);
  assert.equal(monthDays('2024-02').filter(d=>d.inMonth).length,29);assert.equal(monthDays('2026-02').filter(d=>d.inMonth).length,28);assert.equal(shiftMonth('2026-12',1),'2027-01');assert.equal(shiftMonth('2026-01',-1),'2025-12');
});
test('每天默认最多五条，展开不丢失任务，五条以内不显示剩余',()=>{
  for(const count of [0,1,5,6,12]){const daily=Array.from({length:count},(_,id)=>({id}));assert.equal(dayPreview(daily).visible.length,Math.min(5,count));assert.equal(dayPreview(daily).hidden,Math.max(0,count-5));assert.equal(dayPreview(daily,true).visible.length,count);assert.equal(dayPreview(daily,true).hidden,0);}
});
test('旧任务实际开始后每天展示，延期扩展区间且不改写历史',()=>{
  const task=createTask('25日截止','2026-10-25');assert(!todayTasks([task]).length);startTask(task);assert.equal(task.started,TODAY);assert(todayTasks([task]).length);let grouped=tasksByDate([task]);for(let day=20;day<=25;day++)assert.equal(grouped.get('2026-10-'+day)?.[0].id,task.id);assert(!grouped.has('2026-10-19'));reschedule(task,'2026-10-28');grouped=tasksByDate([task]);assert(grouped.has('2026-10-20'));assert(grouped.has('2026-10-28'));assert.equal(task.initialPlan,'2026-10-25');assert.equal(task.started,TODAY);
});
test('自定义起止区间首尾均包含，区间不能倒置，计划开始不伪造实际开始',()=>{
  const task=createTask('跨月安排','2026-11-03','个人','','2026-10-29');assert.equal(task.started,null);assert.equal(task.planStart,'2026-10-29');assert.equal(duration(task),null);assert.throws(()=>createTask('反向','2026-10-20','个人','','2026-10-21'),/不能早于/);const october=tasksByDate([task]),november=tasksByDate([task],'',{from:'2026-11-01',to:'2026-11-30'});assert(october.has('2026-10-29'));assert(november.has('2026-11-03'));assert(!november.has('2026-11-04'));assert.equal(upcomingTasks([task]).length,1);
});
test('仅调整计划开始会留痕，不计作延期，不改首次实际开始；非法区间原子拒绝',()=>{
  const task=createTask('调整开始','2026-10-25','ToZ','','2026-10-21');startTask(task);const initial=task.started;assert.equal(reschedule(task,task.plan,'安排提前','2026-10-19'),'plan_start');assert.equal(task.events.at(-1).type,'plan_start');assert.equal(postponements(task).length,0);assert.equal(task.started,initial);const before=structuredClone(task);assert.throws(()=>reschedule(task,'2026-10-18'),/不能早于/);assert.deepEqual(task,before);
});
test('逾期区间延续至当天，完成截止于实际完成日，重开后恢复每日展示',()=>{
  const task=createTask('逾期','2026-10-18','个人','','2026-10-15');let grouped=tasksByDate([task]);assert(grouped.has(TODAY));assert(!grouped.has('2026-10-21'));reschedule(task,'2026-10-25');toggleDone(task);grouped=tasksByDate([task]);assert(grouped.has('2026-10-15'));assert(grouped.has(TODAY));assert(!grouped.has('2026-10-21'));toggleDone(task);assert(tasksByDate([task]).has('2026-10-25'));
});
test('无截止日期的开始任务进入今日；无区间旧任务保持单日；长区间只扩展查询范围',()=>{
  const task=createTask('无截止',null);startTask(task);assert(todayTasks([task]).length);assert(tasksByDate([task]).has(TODAY));const old=createTask('旧单日','2026-10-25');assert.deepEqual([...tasksByDate([old]).keys()],['2026-10-25']);const long=createTask('长期','2099-12-31','ToZ','','2000-01-01');assert.equal(tasksByDate([long],'',{from:'2026-10-01',to:'2026-10-31'}).size,31);assert.deepEqual(taskDateRange(long),{start:'2000-01-01',end:'2099-12-31'});
});
