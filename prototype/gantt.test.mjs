import test from 'node:test';
import assert from 'node:assert/strict';
import {ganttPeriod,ganttSegment,ganttGroups,ganttTaskRange} from './gantt.mjs';
import {createTask,startTask,reschedule,TODAY} from './domain.mjs';
import {createSeries,materializeSeries} from './recurrence.mjs';

test('同分区周期合并为一行，每期只占执行日，长计划与延期不生成延续区间',()=>{
  const series=createSeries(createTask('周期','2027-07-31','ToZ','','2026-10-31'),{unit:'month',interval:1,monthEnd:true});
  const tasks=materializeSeries([series],[],'2027-02-28');startTask(tasks[0]);reschedule(tasks[0],'2027-10-31');
  const before=structuredClone(tasks),group=ganttGroups(tasks,['ToZ'])[0];
  assert.equal(group.rows.length,1);assert.equal(group.rows[0].tasks.length,tasks.length);assert.equal(group.summaryRange,null);
  for(const task of tasks){assert.deepEqual(ganttTaskRange(task),{start:task.repeatDate,end:task.repeatDate});assert.equal(ganttSegment(ganttTaskRange(task),ganttPeriod(task.repeatDate)).days,1);}
  assert.equal(group.range.end,'2027-02-28');assert.deepEqual(tasks,before);
});

test('同名不同周期与普通任务不合并，状态与搜索筛选仅改变本行可见期次',()=>{
  const a=createSeries(createTask('同名','2026-10-20','ToZ','','2026-10-20'),{unit:'day',interval:1});
  const b=createSeries(createTask('同名','2026-10-20','ToZ','','2026-10-20'),{unit:'week',interval:1,weekdays:[1]});
  const tasks=[...materializeSeries([a,b],[],'2026-10-24'),createTask('同名','2026-11-05','ToZ','','2026-11-01')];
  tasks[0].done=true;tasks[0].completedDate='2026-11-15';
  const group=ganttGroups(tasks,['ToZ'])[0];assert.equal(group.rows.length,3);assert.deepEqual(group.summaryRange,{start:'2026-11-01',end:'2026-11-05'});
  const completed=ganttGroups(tasks,['ToZ'],{status:'done'})[0];assert.equal(completed.rows.length,1);assert.equal(completed.rows[0].tasks.length,1);assert.equal(completed.range.end,tasks[0].repeatDate);
  tasks[1].note='只查这一期';const searched=ganttGroups(tasks,['ToZ'],{term:'只查这一期'})[0];assert.equal(searched.rows[0].tasks[0].id,tasks[1].id);
});

test('单期迁移分区后在所属分区各保留一行，删除取消期次不出现',()=>{
  const series=createSeries(createTask('周期','2026-10-20','ToZ','','2026-10-20'),{unit:'day',interval:1});
  const tasks=materializeSeries([series],[],'2026-10-24');tasks[0].project='个人';tasks[1].deletedAt='2026-10-20';tasks[2].cancelled=true;
  const groups=ganttGroups(tasks,['ToZ','个人']);assert.equal(groups.length,2);assert(groups.every(g=>g.rows.length===1));
  assert.equal(groups.flatMap(g=>g.tasks).length,3);assert.equal(ganttTaskRange(tasks[1]),null);assert.equal(ganttTaskRange(tasks[2]),null);
});
test('甘特周区间周一开始，跨年与闰年月份日期正确',()=>{
  assert.equal(ganttPeriod('2026-10-20','week').start,'2026-10-19');assert.equal(ganttPeriod('2026-10-20','week').end,'2026-10-25');
  const boundary=ganttPeriod('2027-01-01','week');assert.equal(boundary.start,'2026-12-28');assert.equal(boundary.end,'2027-01-03');
  assert.equal(ganttPeriod('2024-02-20').count,29);assert.equal(ganttPeriod('2026-02-20').count,28);assert.throws(()=>ganttPeriod('2026-02-30'));
});
test('时间条首尾均包含，裁剪跨月区间但显示完整持续天数',()=>{
  const period=ganttPeriod(TODAY),range={start:'2026-10-20',end:'2026-10-25'},segment=ganttSegment(range,period);
  assert.equal(segment.days,6);assert.equal(segment.width,6/31*100);assert.equal(segment.left,19/31*100);
  const clipped=ganttSegment({start:'2026-09-01',end:'2026-11-05'},period);assert.equal(clipped.left,0);assert.equal(clipped.width,100);assert(clipped.clippedStart&&clipped.clippedEnd);assert.equal(clipped.days,66);
  assert.equal(ganttSegment({start:'2026-11-01',end:'2026-11-10'},period),null);assert.equal(ganttSegment(null,period),null);
});
test('项目分组、状态和搜索筛选保留未排期项，不修改任务数据',()=>{
  const a=createTask('完成设计','2026-10-25','工作','','2026-10-20'),b=createTask('未排期想法',null,'工作'),c=createTask('读书','2026-10-21','个人');startTask(a);c.done=true;c.completedDate=TODAY;
  const tasks=[a,b,c],before=structuredClone(tasks),groups=ganttGroups(tasks,['工作','个人']);assert.equal(groups.length,2);assert.equal(groups[0].tasks.length,2);assert.equal(groups[0].range.start,'2026-10-20');
  assert.equal(ganttGroups(tasks,['工作','个人'],{status:'active'})[0].tasks[0].id,a.id);assert.equal(ganttGroups(tasks,['工作','个人'],{status:'done'})[0].tasks[0].id,c.id);
  assert.equal(ganttGroups(tasks,['工作','个人'],{term:'想法'})[0].tasks[0].id,b.id);assert.equal(ganttGroups(tasks,['工作','个人'],{project:'个人',status:'open'}).length,0);assert.deepEqual(tasks,before);
});
test('甘特图改期沿用日期模型，延期后延长，首次实际开始与最初计划不变',()=>{
  const task=createTask('项目','2026-10-25','ToZ','','2026-10-20');startTask(task);reschedule(task,'2026-10-28','甘特图调整','2026-10-20');
  const group=ganttGroups([task],['ToZ'])[0],segment=ganttSegment(group.range,ganttPeriod(TODAY));assert.equal(segment.days,9);assert.equal(task.started,TODAY);assert.equal(task.initialPlan,'2026-10-25');assert.equal(task.events.at(-1).type,'later');
});
