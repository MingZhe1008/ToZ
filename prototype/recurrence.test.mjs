import test from 'node:test';
import assert from 'node:assert/strict';
import {createTask,startTask,reschedule,toggleDone,todayTasks,upcomingTasks,taskDateRange} from './domain.mjs';
import {createSeries,occurrenceDates,materializeSeries,stopSeries,validateSeries} from './recurrence.mjs';
import {eventTone} from './task-events.mjs';
const series=(start,rule,until=null)=>createSeries(createTask('周期验证',start,'ToZ','独立记录',start),rule,until);

test('计划起止定义每期固定日差，重复结束只限制执行日，最后一期可在截止后完成',()=>{
  const s=createSeries(createTask('每月22日','2026-11-04','ToZ','','2026-10-22'),{unit:'month',interval:1},'2026-11-30');
  assert.equal(s.span,13);
  const tasks=materializeSeries([s],[],'2027-01-31');
  assert.deepEqual(tasks.map(t=>[t.planStart,t.plan]),[['2026-10-22','2026-11-04'],['2026-11-22','2026-12-05']]);
  s.rule.monthEnd=true;
  assert.deepEqual(materializeSeries([s],[],'2027-01-31').map(t=>[t.planStart,t.plan]),[['2026-10-31','2026-11-13'],['2026-11-30','2026-12-13']]);
});

test('即将到来每组只保留最近计划开始的一期，不受输入、置顶或长完成区间影响',()=>{
  const s=createSeries(createTask('月底','2027-07-31','ToZ','','2026-10-31'),{unit:'month',interval:1,monthEnd:true});
  const tasks=materializeSeries([s],[],'2027-02-28','2026-10-22').reverse();
  tasks[0].top=true;tasks.at(-1).top=false;const before=structuredClone(tasks);
  assert.deepEqual(upcomingTasks(tasks,'2026-10-22').map(t=>t.repeatDate),['2026-10-31']);
  assert.deepEqual(tasks,before);
});

test('同名不同周期和普通任务分别保留，计划开始缺省时按完成日期选最近一期',()=>{
  const a=series('2026-10-23',{unit:'day',interval:1}),b=series('2026-10-23',{unit:'week',interval:1,weekdays:[4]});
  const tasks=[...materializeSeries([a,b],[],'2026-11-01'),createTask('周期验证','2026-10-24'),createTask('周期验证','2026-10-25')];
  const upcoming=upcomingTasks(tasks,'2026-10-22');assert.equal(upcoming.length,4);
  assert.equal(upcoming.filter(t=>t.repeatId===a.id).length,1);assert.equal(upcoming.filter(t=>t.repeatId===b.id).length,1);
  const legacy=tasks.filter(t=>t.repeatId===a.id).map(t=>({...t,planStart:null})).reverse();
  assert.equal(upcomingTasks(legacy,'2026-10-22')[0].plan,'2026-10-23');
});

test('最近一期完成、删除、取消或进入今日后，未来提醒自动推进且今日仍保留遗留',()=>{
  const s=series('2026-10-23',{unit:'day',interval:1}),original=materializeSeries([s],[],'2026-10-27');
  for(const patch of [{done:true,completedDate:'2026-10-22'},{deletedAt:'2026-10-22'},{cancelled:true},{started:'2026-10-22'}]){
    const tasks=structuredClone(original);Object.assign(tasks[0],patch);
    assert.equal(upcomingTasks(tasks,'2026-10-22')[0].repeatDate,'2026-10-24');
  }
  assert.equal(upcomingTasks(original,'2026-10-24')[0].repeatDate,'2026-10-25');
  assert.equal(todayTasks(original,'2026-10-24').length,2);
});

test('手动调整本期开始后按当前计划取最近一期，筛选结束不删除其余期次',()=>{
  const s=series('2026-10-23',{unit:'day',interval:1}),tasks=materializeSeries([s],[],'2026-10-27');
  reschedule(tasks[0],'2026-10-28','本期改期','2026-10-28');
  assert.equal(upcomingTasks(tasks,'2026-10-22')[0].repeatDate,'2026-10-24');
  assert.equal(tasks.length,5);assert(tasks.every(t=>!t.cancelled&&!t.deletedAt));
  assert.deepEqual(upcomingTasks(tasks,'2026-10-29'),[]);
});
test('每天和自定义间隔，结束日期包含当天且不会越界生成',()=>{
  const s=series('2026-10-20',{unit:'day',interval:3},'2026-10-29');
  assert.deepEqual(occurrenceDates(s,'2026-10-20','2026-11-30'),['2026-10-20','2026-10-23','2026-10-26','2026-10-29']);
  assert.deepEqual(materializeSeries([s],[],'2026-10-29').map(t=>t.repeatDate),['2026-10-20','2026-10-23','2026-10-26','2026-10-29']);
});
test('工作日、周末和双周多选按周一对齐，首日不符合不会伪造任务',()=>{
  const work=series('2026-10-23',{unit:'week',interval:1,weekdays:[0,1,2,3,4]});
  assert.deepEqual(occurrenceDates(work,'2026-10-23','2026-10-27'),['2026-10-23','2026-10-26','2026-10-27']);
  const weekend=series('2026-10-20',{unit:'week',interval:1,weekdays:[5,6]});
  assert.deepEqual(occurrenceDates(weekend,'2026-10-20','2026-10-26'),['2026-10-24','2026-10-25']);
  const bi=series('2026-10-20',{unit:'week',interval:2,weekdays:[0,4]});
  assert.deepEqual(occurrenceDates(bi,'2026-10-20','2026-11-06'),['2026-10-23','2026-11-02','2026-11-06']);
});
test('每月月底锚点不漂移，自定义季度跨年仍取原定日期',()=>{
  const s=series('2026-01-31',{unit:'month',interval:1});
  assert.deepEqual(occurrenceDates(s,'2026-01-01','2026-04-30'),['2026-01-31','2026-02-28','2026-03-31','2026-04-30']);
  const q=series('2026-11-30',{unit:'month',interval:3});
  assert.deepEqual(occurrenceDates(q,'2026-11-01','2027-05-31'),['2026-11-30','2027-02-28','2027-05-30']);
});
test('每年闰日平年取月末，下一闰年恢复二十九日',()=>{
  const s=series('2024-02-29',{unit:'year',interval:1});
  assert.deepEqual(occurrenceDates(s,'2025-01-01','2028-12-31'),['2025-02-28','2026-02-28','2027-02-28','2028-02-29']);
});
test('远期首次安排和低频周期也至少展示下一期',()=>{
  for(const [start,rule] of [['2035-06-01',{unit:'day',interval:1}],['2026-10-20',{unit:'year',interval:2}],['2035-06-01',{unit:'week',interval:1,weekdays:[0]}]]){
    const s=series(start,rule),tasks=materializeSeries([s],[],'2026-12-01','2026-10-20');
    assert(tasks.some(t=>t.repeatDate>'2026-10-20'));assert(tasks.every(t=>t.repeatDate>=start));
  }
});
test('离线补齐和多窗口重复计算幂等，已有延期和完成历史不覆盖',()=>{
  const s=series('2026-10-20',{unit:'day',interval:1});
  const tasks=materializeSeries([s],[],'2026-10-22');startTask(tasks[0]);reschedule(tasks[0],'2026-11-01','仅本期延期');toggleDone(tasks[1]);
  const original=structuredClone(tasks);assert.equal(materializeSeries([s],tasks,'2026-10-22').length,0);
  const added=materializeSeries([s],tasks,'2026-10-25');assert.deepEqual(added.map(t=>t.repeatDate),['2026-10-23','2026-10-24','2026-10-25']);
  assert.deepEqual(tasks,original);assert(added.every(t=>t.started===null&&!t.done&&t.events.length===1));assert.equal(tasks[0].initialPlan,'2026-10-20');
  assert.equal(new Set([...tasks,...added].map(t=>t.id)).size,6);
});
test('每期沿用初始计划时长，不沿用某期后来的延期',()=>{
  const t=createTask('持续三天','2026-10-22','ToZ','','2026-10-20'),s=createSeries(t,{unit:'week',interval:1,weekdays:[1]});
  const dates=materializeSeries([s],[],'2026-10-28');assert.equal(dates[0].plan,'2026-10-22');assert.equal(dates[1].plan,'2026-10-29');
});
test('停止周期保留当前、已开始和已完成任务，取消未来未开始项并保留历史',()=>{
  const s=series('2026-10-20',{unit:'day',interval:1}),tasks=materializeSeries([s],[],'2026-10-24');
  startTask(tasks[1]);toggleDone(tasks[2]);stopSeries(s,tasks);
  assert(!tasks[0].cancelled&&!tasks[1].cancelled&&!tasks[2].cancelled);assert(tasks[3].cancelled&&tasks[4].cancelled);
  assert.equal(tasks[3].events.at(-1).type,'cancel_repeat');assert.equal(materializeSeries([s],tasks,'2026-12-01').length,0);
  assert(!todayTasks(tasks,'2026-10-25').includes(tasks[3]));assert(!upcomingTasks(tasks).includes(tasks[3]));assert.equal(taskDateRange(tasks[3]),null);
});
test('拒绝空周执行日、重复星期、非法间隔、反向结束和超长实例时长',()=>{
  for(const rule of [{unit:'week',interval:1,weekdays:[]},{unit:'week',interval:1,weekdays:[1,1]},{unit:'day',interval:0},{unit:'year',interval:1.5},{unit:'day',interval:100}])assert.throws(()=>series('2026-10-20',rule));
  assert.throws(()=>series('2026-10-20',{unit:'day',interval:1},'2026-10-19'));
  const s=series('2026-10-20',{unit:'day',interval:1});s.span=4000;assert.throws(()=>validateSeries([s]));
});
test('任务足迹区分完成、重开、延期和新增，兼容旧子任务原因文本',()=>{
  for(const e of [{type:'complete'},{type:'subtask',done:true},{type:'subtask',reason:'完成：测试'}])assert.equal(eventTone(e),'success');
  for(const e of [{type:'reopen'},{type:'later'},{type:'subtask',done:false},{type:'subtask',reason:'重新打开：测试'}])assert.equal(eventTone(e),'warning');
  assert.equal(eventTone({type:'start'}),'teal');assert.equal(eventTone({type:'subtask_add'}),'purple');assert.equal(eventTone({type:'create'}),'neutral');
});

test('每月最后一天可从月中开始，长短月份和闰月均正确',()=>{const s=series('2028-01-20',{unit:'month',interval:1,monthEnd:true});assert.deepEqual(occurrenceDates(s,'2028-01-01','2028-04-30'),['2028-01-31','2028-02-29','2028-03-31','2028-04-30']);});

test('未开始的漏做周期只占本期计划区间，今日仍保留逾期；开始后继续逐日展示',()=>{const s=series('2026-10-18',{unit:'day',interval:1});const [task]=materializeSeries([s],[],'2026-10-20');assert.deepEqual(taskDateRange(task),{start:'2026-10-18',end:'2026-10-18'});assert(todayTasks([task]).includes(task));startTask(task);assert.equal(taskDateRange(task).end,'2026-10-20');reschedule(task,'2026-10-25');assert.equal(taskDateRange(task).end,'2026-10-25');});
