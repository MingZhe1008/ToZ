import test from 'node:test';
import assert from 'node:assert/strict';
import {taskListPresentation} from './task-list.mjs';
import {createTask} from './domain.mjs';
import {createSeries,materializeSeries} from './recurrence.mjs';
const make=()=>{
  const series=createSeries(createTask('同名周期','2027-07-31','ToZ','','2026-10-31'),{unit:'month',interval:1,monthEnd:true});
  return {series,tasks:materializeSeries([series],[],'2027-03-31')};
};

test('分区和全部任务按当前一期收起未来多期，置顶与逆序不改变代表期次',()=>{
  const {tasks}=make();tasks[0].top=false;tasks.reverse();const before=structuredClone(tasks);
  const result=taskListPresentation(tasks,{date:'2026-10-22'});
  assert.equal(result.items.length,1);assert.equal(result.items[0].repeatDate,'2026-10-31');assert.deepEqual(tasks,before);
});

test('优先实际已开始期次，否则保留最早未处理期次；完成删除后自动推进',()=>{
  const {tasks}=make();tasks[2].started='2026-10-22';
  assert.equal(taskListPresentation(tasks,{date:'2026-10-22'}).items[0].id,tasks[2].id);
  tasks[2].done=true;tasks[0].deletedAt='2026-10-22';tasks[1].cancelled=true;
  const shown=taskListPresentation(tasks,{date:'2026-10-22'}).items;
  assert(shown.includes(tasks[2]));assert.equal(shown.filter(t=>!t.done)[0].id,tasks[3].id);
  tasks[2].done=false;assert.equal(taskListPresentation(tasks,{date:'2026-10-22'}).items[0].id,tasks[2].id);
});

test('展开只增加当前周期的未完成期次，代表任务在前，已完成历史和普通同名任务保留',()=>{
  const {tasks,series}=make(),other=make();tasks[1].done=true;
  const normal=createTask('同名周期','2026-12-01'),all=[...tasks.reverse(),...other.tasks,normal],before=structuredClone(all);
  const collapsed=taskListPresentation(all),expanded=taskListPresentation(all,{expanded:new Set([series.id])});
  assert.equal(collapsed.items.length,4);assert.equal(expanded.items.length,tasks.length+2);
  assert.equal(expanded.items[0].repeatDate,'2026-10-31');assert(expanded.items.includes(normal));assert(expanded.items.some(t=>t.done));
  assert.equal(expanded.items.filter(t=>t.repeatId===other.series.id).length,1);assert.deepEqual(all,before);
});

test('查询可绕过折叠，分区先过滤后再选代表，后续期次始终可访问',()=>{
  const {tasks}=make();tasks[0].project='个人';
  assert.equal(taskListPresentation(tasks.filter(t=>t.project==='ToZ')).items[0].repeatDate,'2026-11-30');
  assert.equal(taskListPresentation(tasks,{collapse:false}).items.length,tasks.length);
});
