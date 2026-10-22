import {projectColor,setProjectColors} from './projects.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {lunarDate,Lunar,LunarMonth} from './lunar.mjs';
import {createSeries,occurrenceDates,materializeSeries,validateSeries} from './recurrence.mjs';
import {createTask,startTask,reschedule,toggleDone,taskDateRange} from './domain.mjs';
import {calendarWeeks,tasksByDate,calendarTaskRange} from './calendar.mjs';
import {preferences,sortedTasks,moveBefore,renameProject} from './preferences.mjs';
const make=(start,unit,month,day,leap='regular',until=null)=>createSeries(createTask('农历安排',start,'ToZ','',start),{unit,interval:1,calendar:'lunar',lunar:{month,day,leap}},until);

test('新建普通任务与周期期次默认不置顶，后续生成不会覆盖手动置顶选择',()=>{
  const task=createTask('新任务','2026-10-20');assert.equal(task.top,false);
  const series=createSeries({...task,planStart:'2026-10-20'},{unit:'day',interval:1});
  const tasks=materializeSeries([series],[],'2026-10-22');assert(tasks.every(t=>t.top===false));
  tasks[0].top=true;
  const added=materializeSeries([series],tasks,'2026-10-24');
  assert(added.every(t=>t.top===false));assert.equal(tasks[0].top,true);
  const prefs=preferences({taskOrder:[task.id,tasks[0].id]},['个人','ToZ'],[task,tasks[0]]);
  assert.equal(sortedTasks([task,tasks[0]],prefs.taskOrder)[0].id,tasks[0].id);
  assert(!added.some(t=>t.id===tasks[0].id));
});

test('周期在月历只标记执行日期，开始、延期、完成重开不产生延续条且历史不变',()=>{
  const series=createSeries(createTask('每月十日','2026-10-13','ToZ','','2026-10-10'),{unit:'month',interval:1});
  const tasks=materializeSeries([series],[],'2026-12-31'),task=tasks[0];
  startTask(task);reschedule(task,'2026-11-25');toggleDone(task);toggleDone(task);
  const before=structuredClone(tasks);
  assert.deepEqual(calendarTaskRange(task),{start:'2026-10-10',end:'2026-10-10'});
  assert.equal(taskDateRange(task).end,'2026-11-25');
  const dates=tasksByDate(tasks,'',{from:'2026-10-01',to:'2026-12-31'});
  assert.deepEqual([...dates.keys()],['2026-10-10','2026-11-10','2026-12-10']);
  const segments=calendarWeeks(tasks,'2026-11').flatMap(w=>w.segments);
  assert.equal(segments.length,1);assert.equal(segments[0].first,segments[0].last);
  assert(!segments[0].continuesBefore&&!segments[0].continuesAfter);
  assert.deepEqual(tasks,before);task.deletedAt='2026-10-20';assert.equal(calendarTaskRange(task),null);
  delete task.deletedAt;task.cancelled=true;assert.equal(calendarTaskRange(task),null);
});

test('每周多选和农历周期按各期日期点性展示，旧周期缺少期次日期时回退计划日',()=>{
  const weekly=createSeries(createTask('每周一三','2026-10-16','ToZ','','2026-10-12'),{unit:'week',interval:1,weekdays:[0,2]});
  const tasks=materializeSeries([weekly],[],'2026-10-31');
  const lunar=make('2026-02-17','month',1,10);tasks.push(...materializeSeries([lunar],[],'2026-10-31'));
  const segments=calendarWeeks(tasks,'2026-10').flatMap(w=>w.segments);
  assert(segments.length>5);assert(segments.every(s=>s.first===s.last));
  const old={...tasks[0]};delete old.repeatDate;
  assert.deepEqual(calendarTaskRange(old),{start:old.planStart,end:old.planStart});
});
test('农历转换与春节锚点，每年按农历换算而不是固定公历',()=>{
  assert.equal(lunarDate('2026-02-17').text,'正月初一');
  const s=make('2026-01-01','year',1,1);
  assert.deepEqual(occurrenceDates(s,'2026-01-01','2028-12-31'),['2026-02-17','2027-02-06','2028-01-26']);
  assert.equal(materializeSeries([s],[],'2026-01-02','2026-01-01')[0].repeatDate,'2026-02-17');
});
test('农历闰月普通月、含闰月和仅闰月互不混淆，无闰月不伪造',()=>{
  const regular=make('2025-01-29','year',6,1),both=make('2025-01-29','year',6,1,'both'),leap=make('2025-01-29','year',6,1,'leap');
  assert.deepEqual(occurrenceDates(regular,'2025-01-01','2026-12-31'),['2025-06-25','2026-07-14']);
  assert.deepEqual(occurrenceDates(both,'2025-01-01','2025-12-31'),['2025-06-25','2025-07-25']);
  assert.deepEqual(occurrenceDates(leap,'2025-01-01','2026-12-31'),['2025-07-25']);
});
test('农历每月三十小月取廿九，次个大月恢复三十，结束日期包含当天',()=>{
  const s=make('2026-02-17','month',1,30,'both');
  const dates=occurrenceDates(s,'2026-02-17','2026-07-31');assert(dates.length>=5);
  assert(dates.every(date=>{const d=lunarDate(date);return d.day===LunarMonth.fromYm(d.year,d.month).getDayCount();}));
  assert(dates.some(date=>lunarDate(date).day===29));assert(dates.some(date=>lunarDate(date).day===30));
  s.until=dates[1];assert.deepEqual(occurrenceDates(s,s.start,s.until),dates.slice(0,2));
  assert.deepEqual(materializeSeries([s],materializeSeries([s],[],s.until),s.until),[]);
});
test('农历非法规则与日期范围拒绝保存，普通公历不受限制',()=>{
  const s=make('2026-02-17','year',1,1);s.rule.lunar.month=13;assert.throws(()=>validateSeries([s]),/农历/);
  assert.throws(()=>make('2101-01-01','year',1,1),/1900/);
  s.rule.lunar.month=1;s.rule.unit='day';assert.throws(()=>validateSeries([s]),/农历/);
});
test('跨日条按周合并，跨月裁剪、周边界分段，重叠任务不占相同单元格',()=>{
  const task=createTask('持续推进','2026-11-03','ToZ','','2026-10-20');
  const other=createTask('重叠','2026-10-25','个人','','2026-10-21');
  const weeks=calendarWeeks([task,other],'2026-10');
  const current=weeks.find(w=>w.days[0].date==='2026-10-19');
  assert.equal(current.segments.length,2);assert.deepEqual([current.segments[0].first,current.segments[0].last],[1,6]);
  assert.equal(current.segments[0].continuesAfter,true);assert.notEqual(current.segments[0].lane,current.segments[1].lane);
  const next=weeks.find(w=>w.days[0].date==='2026-10-26');assert.equal(next.segments[0].continuesBefore,true);assert.equal(next.segments[0].continuesAfter,true);
  assert.equal(calendarWeeks([task,other],'2026-10','持续').flatMap(w=>w.segments).every(s=>s.task.id===task.id),true);
});
test('颜色、筛选、菜单顺序与任务顺序校验，置顶优先，同组手动排序稳定',()=>{
  const tasks=[{id:'a'},{id:'b',top:true},{id:'c',top:true}];
  assert.deepEqual(sortedTasks(tasks,['c','a','b']).map(t=>t.id),['c','b','a']);
  assert.deepEqual(moveBefore(['a','b','c'],'c','a'),['c','a','b']);assert.deepEqual(moveBefore(['a','b','c'],'a','c',true),['b','c','a']);
  assert.deepEqual(preferences({taskOrder:['b']},['ToZ'],tasks).taskOrder,['b','a','c']);
  assert.throws(()=>preferences({projectColors:{ToZ:'red'}},['ToZ'],tasks));assert.throws(()=>preferences({taskOrder:['x']},['ToZ'],tasks));assert.throws(()=>preferences({widgetProject:'x'},['ToZ'],tasks));
  const state={projects:['ToZ','个人'],tasks:[{project:'ToZ'}],recurrences:[{project:'ToZ'}],preferences:{projectColors:{ToZ:'#ff9500'},widgetProject:'ToZ'}};
  renameProject(state,'ToZ','工作');assert.equal(state.tasks[0].project,'工作');assert.equal(state.recurrences[0].project,'工作');assert.equal(state.preferences.widgetProject,'工作');assert.equal(state.preferences.projectColors['工作'],'#ff9500');
});

test('自定义项目支持与对象内置属性同名的普通名称，颜色和改名仍正确',()=>{
  const projects=['constructor','__proto__'],colors=Object.fromEntries([['constructor','#ff9500'],['__proto__','#34c759']]);
  const prefs=preferences({projectColors:colors},projects,[]);setProjectColors(prefs.projectColors);
  assert.equal(projectColor('constructor'),'#ff9500');assert.equal(projectColor('__proto__'),'#34c759');
  const snapshot={projects,tasks:[],recurrences:[],preferences:prefs};renameProject(snapshot,'constructor','工作');assert.equal(snapshot.preferences.projectColors['工作'],'#ff9500');assert.equal(Object.hasOwn(snapshot.preferences.projectColors,'constructor'),false);
  setProjectColors({});assert.match(projectColor('constructor'),/^#[a-f0-9]{6}$/);
});
