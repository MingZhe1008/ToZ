import test from 'node:test';
import assert from 'node:assert/strict';
import {ganttPeriod,ganttSegment,ganttGroups} from './gantt.mjs';
import {createTask,startTask,reschedule,TODAY} from './domain.mjs';
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
