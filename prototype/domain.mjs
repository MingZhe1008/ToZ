const localDate = () => new Date().toLocaleDateString('sv-SE');
export let TODAY = typeof window !== 'undefined' && window.toz ? localDate() : '2026-10-20';
export function refreshToday() { if(typeof window==='undefined'||!window.toz)return false;const next=localDate();if(next===TODAY)return false;TODAY=next;return true; }
export function addDays(date, days) {const value=new Date(date+'T00:00:00Z');value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);}
export const uid = () => crypto.randomUUID();
export const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const dayNumber = value => Date.parse(value + 'T00:00:00Z') / 86400000;
export const dayDiff = (a, b) => dayNumber(b) - dayNumber(a);
export function duration(task) {
  if (!task.started) return null;
  return Math.max(0, dayDiff(task.started, task.done ? task.completedDate : TODAY)) + 1;
}
export function postponements(task) { return task.events.filter(e => e.type === 'later'); }
export function shiftedDays(task) { return postponements(task).reduce((n, e) => n + dayDiff(e.from, e.to), 0); }
export function validatePlanRange(planStart, plan) {
  if (planStart && !validDate(planStart)) throw new Error('请选择有效的计划开始日期');
  if (plan && !validDate(plan)) throw new Error('请选择有效的计划完成日期');
  if (planStart && plan && planStart > plan) throw new Error('计划完成日期不能早于计划开始日期');
}
export function reschedule(task, date, reason = '', planStart = task.planStart || null) {
  if (task.done) throw new Error('请先重新打开任务，再调整计划');
  if (!validDate(date)) throw new Error('请选择有效的计划日期');
  planStart ||= null;
  validatePlanRange(planStart,date);
  const startChanged = planStart !== (task.planStart || null);
  if (date === task.plan && !startChanged) throw new Error('新日期与当前计划相同，无需重复保存');
  const from = task.plan;
  const type = !from ? 'schedule' : date > from ? 'later' : 'earlier';
  if(startChanged)task.events.push({id:uid(),type:'plan_start',from:task.planStart||null,to:planStart,reason:reason.trim(),at:new Date().toISOString(),date:TODAY});
  if(date !== task.plan)task.events.push({ id: uid(), type, from, to: date, reason: reason.trim(), at: new Date().toISOString(), date: TODAY });
  task.planStart = planStart;
  task.plan = date;
  task.initialPlan ||= date;
  return date === from ? 'plan_start' : type;
}
export function startTask(task) {
  if (task.done) throw new Error('请先重新打开任务');
  if (task.started) return false;
  task.started = TODAY;
  task.startedAt = new Date().toISOString();
  task.startedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  task.events.push({ id: uid(), type: 'start', date: TODAY, at: new Date().toISOString() });
  return true;
}
export function toggleDone(task) {
  if (!task.done && task.subtasks.some(s => !s.deletedAt&&!s.done)) throw new Error('还有未完成的子任务，请先完成子任务');
  task.done = !task.done;
  task.completedDate = task.done ? TODAY : null;
  task.events.push({ id: uid(), type: task.done ? 'complete' : 'reopen', date: TODAY, at: new Date().toISOString() });
}
export function createTask(title, plan, project = '个人', note = '', planStart = null) {
  if (!title.trim()) throw new Error('请先填写任务标题');
  validatePlanRange(planStart,plan);
  return { id: uid(), title: title.trim(), project, note: note.trim(), createdAt:new Date().toISOString(),planStart:planStart||null,plan: plan || null, initialPlan: plan || null, started: null, done: false, top: true, completedDate: null, subtasks: [], events: [{ id: uid(), type: 'create', date: TODAY, at: new Date().toISOString() }] };
}
export function todayTasks(tasks, date = TODAY) {
  return tasks.filter(t => !t.cancelled && !t.deletedAt && (t.done ? t.completedDate === date : !!((t.started && t.started <= date) || (t.planStart && t.planStart <= date) || (t.plan && t.plan <= date))));
}
export function upcomingTasks(tasks, date = TODAY) {
  const active=new Set(todayTasks(tasks,date).map(t=>t.id));
  return tasks.filter(t=>!t.cancelled&&!t.deletedAt&&!t.done&&!active.has(t.id)&&(t.planStart>date||t.plan>date));
}
// Planned start is editable; the first actual start remains an independent fact.
// Legacy tasks without a planned start begin at their actual start or due date.
export function taskDateRange(task, today = TODAY) {
  if(task.cancelled||task.deletedAt)return null;
  const starts=[task.planStart,task.started].filter(validDate).sort();
  let start=starts[0]||(validDate(task.plan)?task.plan:null);
  if(task.done && validDate(task.completedDate)){
    start=start&&start<task.completedDate?start:task.completedDate;
    return {start,end:task.completedDate};
  }
  if(!start)return null;
  const end=[start,task.plan,(!task.repeatId||task.started)?today:null].filter(validDate).sort().at(-1);
  return {start,end};
}
export function seedTasks() {
  const event = (type, date, data = {}) => ({ id: uid(), type, date, at: date + 'T08:30:00+08:00', ...data });
  return [
    { id: 'toz', title: '完成 ToZ 产品需求文档', project: 'ToZ', note: '把最初的开始留住，让每一次计划调整都有迹可循。\n整理 Windows 首版范围，明确日期与子任务规则。', plan: TODAY, initialPlan: '2026-10-15', started: '2026-10-12', done: false, subtasks: [{ id: 's1', title: '梳理核心使用场景', done: true }, { id: 's2', title: '确定日期与延期规则', done: true }, { id: 's3', title: '补充验收标准', done: false }], events: [event('create', '2026-10-12'), event('start', '2026-10-12'), event('later', '2026-10-15', { from: '2026-10-15', to: '2026-10-17', reason: '先完成开源项目调研' }), event('later', '2026-10-17', { from: '2026-10-17', to: '2026-10-19', reason: '补充子任务的边界场景' }), event('later', '2026-10-19', { from: '2026-10-19', to: TODAY, reason: '留出一天完善交互细节' })] },
    { id: 'glass', title: '设计桌面浮窗的交互', project: 'ToZ', note: '足够轻，随时能看见今天要做的事。', plan: TODAY, initialPlan: TODAY, started: '2026-10-19', done: false, subtasks: [], events: [event('create', '2026-10-19'), event('start', '2026-10-19')] },
    { id: 'read', title: '读完《设计心理学》第三章', project: '个人', note: '记录一个可以应用在 ToZ 上的设计原则。', plan: TODAY, initialPlan: TODAY, started: null, done: false, subtasks: [], events: [event('create', TODAY)] },
    { id: 'walk', title: '傍晚散步 30 分钟', project: '生活', note: '离开屏幕，给自己一点留白。', plan: TODAY, initialPlan: TODAY, started: null, done: false, subtasks: [], events: [event('create', TODAY)] },
    { id: 'research', title: '整理开源待办工具参考', project: 'ToZ', note: '查看官方仓库与离线能力。', plan: TODAY, initialPlan: TODAY, started: TODAY, done: true, completedDate: TODAY, subtasks: [], events: [event('create', TODAY), event('start', TODAY), event('complete', TODAY)] },
    { id: 'backup', title: '备份本周的设计文件', project: '个人', note: '保留一份本地副本。', plan: '2026-10-19', initialPlan: '2026-10-19', started: '2026-10-19', done: false, subtasks: [], events: [event('create', '2026-10-19'), event('start', '2026-10-19')] },
    { id: 'ios', title: '探索 iOS 端的轻量体验', project: 'ToZ', note: '先完成 Windows 首版，再设计移动端。', plan: '2026-10-23', initialPlan: '2026-10-23', started: null, done: false, subtasks: [], events: [event('create', TODAY)] },
    { id: 'inbox', title: '收集喜欢的桌面小工具', project: '个人', note: '', plan: null, initialPlan: null, started: null, done: false, subtasks: [], events: [event('create', TODAY)] }
  ];
}
