import {taskListPresentation} from './task-list.mjs';
import {createSeries,validateSeries,materializeSeries,recurrenceLabel,stopSeries} from './recurrence.mjs';
import {lunarDate,lunarText,lunarDay} from './lunar.mjs';
import {preferences,sortedTasks,moveBefore,renameProject} from './preferences.mjs';
import {mountReorder} from './reorder.mjs';
import {visibleSubtasks,activeProjects,addSubtask,editSubtask,deleteSubtask,deleteTask,restoreTask,restoreSubtask,deleteProject,restoreProject,moveTask} from './lifecycle.mjs';
import {mountContextMenu} from './context-menu.mjs';
import {purgeTrash} from './trash.mjs';
import {eventTone} from './task-events.mjs';
import { mountGantt } from './gantt.mjs';
import { DEFAULT_PROJECTS, projectName, projectList, projectColor, setProjectColors } from './projects.mjs';
import { TODAY, uid, seedTasks, createTask, reschedule, startTask, toggleDone, duration, postponements, shiftedDays, todayTasks, dayDiff, addDays, refreshToday, upcomingTasks, taskDateRange, validDate } from './domain.mjs';
import { monthDays, shiftMonth, tasksByDate, dayPreview, calendarWeeks, calendarTaskRange } from './calendar.mjs';
import { mountDatePickers, syncDatePickers, closeDatePickers } from './date-picker.mjs';
import { mountDesktopSettings, refreshDesktopSettings, selectSettingsTab } from './desktop-ui.mjs';

const $ = selector => document.querySelector(selector);
const icons = {
  gantt: '<path d="M5 4v16h16M8 7h7v3H8zm4 6h8v3h-8z"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>', check: '<path d="m5 12 4 4L19 6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  moon: '<path d="M20 15.5A9 9 0 0 1 8.5 4 9 9 0 1 0 20 15.5Z"/>',
  calendar: '<rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 10h16M8 14h2m4 0h2m-8 3h2"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  history: '<path d="M3 11a9 9 0 1 1 2 7M3 5v6h6m3-4v6l4 2"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  settings: '<path d="m10 3-.6 3-2.6 1.5-3-.5L2 10l2.3 2L4 15l-1 2 3 3 2.5-1 3 1 1.5 2 3-1 .5-3 2.5-2 2.5-.5V11l-2.5-1-1.5-3 .5-2-3-2-2 1-3-1Z"/><circle cx="12" cy="12" r="3"/>',
  leaf: '<path d="M20 3c-1 9-1 17-10 17-7 0-9-9-3-12 4-2 8-1 13-5ZM4 22 15 11"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  pin: '<path d="m9 3 12 12-3 2-4-3-4 3-3-3 3-4-3-4 2-3ZM3 21l6-6"/>',
  collapse: '<path d="m6 14 6-6 6 6"/>', expand: '<path d="m6 9 6 6 6-6"/>',
  external: '<path d="M14 3h7v7m0-7L10 14M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>',
  sliders: '<path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  play: '<path d="m8 4 12 8-12 8V4Z"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  folder: '<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>'
};
const svg = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.layers}</svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateText = date => date ? date.replaceAll('-', '.')+' · '+lunarText(date) : '尚未安排';
const compactDay = date => date ? Number(date.slice(5,7))+'/'+Number(date.slice(8,10)) : '未安排';
const displayDate = date => date ? date.replaceAll('-', '.') : '尚未安排';
const shortDate = date => date ? `${Number(date.slice(5,7))}/${Number(date.slice(8,10))} · ${lunarText(date)}` : '未安排';
const taskIdAttr = task => `data-task="${esc(task.id)}"`;
const native = window.toz;
let dataVersion = 0;
let projects = [...DEFAULT_PROJECTS];
let editingTask = null, editingProject=null, projectRenames={};
let prefs=preferences({},projects,[]);
const dataState=()=>({tasks,projects,recurrences,preferences:prefs});
const shownProjects=()=>activeProjects(dataState());
const ordered=list=>sortedTasks(list,prefs.taskOrder);
function toggleTaskPin(task){task.top=!task.top;if(task.top)prefs.taskOrder=[task.id,...prefs.taskOrder.filter(id=>id!==task.id)];}
const widgetTasks=()=>ordered(todayTasks(tasks).filter(t=>!prefs.widgetProject||t.project===prefs.widgetProject));
const reorderAttrs=task=>`data-reorder-kind="task" data-reorder-id="${esc(task.id)}" data-top="${!!task.top}" data-done="${!!task.done}"`;
const pinButton=task=>`<button class="task-pin ${task.top?'is-task-pinned':''}" data-action="task-pin" ${taskIdAttr(task)} aria-pressed="${!!task.top}" aria-label="${task.top?'取消置顶':'置顶任务'}：${esc(task.title)}" title="${task.top?'取消置顶':'置顶任务'}">${svg('pin')}</button>`;
let widgetVisible = true, miniIndex = 0;
let reading={reduceTransparency:false,largeText:false};
let tasks, opacity = 88, dark = true, pinned = false, collapsed = false, selected = 'toz', view = 'today', query = '', historyOnly = false, saveError = '', mode = 'both', toastTimer;
let calendarMonth = TODAY.slice(0, 7), calendarQuery = '', calendarDetailOpen = false;
const expandedDays = new Set();
const expandedSubtasks=new Set();
const expandedWidgetSubtasks=new Set();
const expandedTaskSeries=new Set();let listSeriesGroups=new Map();
const seriesExpansionKey=id=>JSON.stringify([view,id]);
let recurrences=[];
let beforeGlobalSearch = null,lastProjectClick=null;
let contextMenu=null,subtaskEdit=null,deleteProjectName=null,trashQuery='',pendingPurge=null;
try {
  const nativeRead = native ? native.read() : null;
  if(nativeRead && !nativeRead.ok)throw new Error(nativeRead.error);
  const raw = native ? JSON.stringify(nativeRead.snapshot) : localStorage.getItem('toz-prototype-v1');
  if (raw) {
    const saved = JSON.parse(raw);
    if (saved.schema !== 1 || !Array.isArray(saved.tasks) || !saved.tasks.every(t => typeof t.id === 'string' && typeof t.title === 'string' && Array.isArray(t.events) && Array.isArray(t.subtasks))) throw new Error('invalid data');
    tasks = saved.tasks;recurrences=validateSeries(saved.recurrences||[]);
    projects = projectList(saved.projects,tasks);prefs=preferences(saved.preferences,projects,tasks);setProjectColors(prefs.projectColors);
    opacity = Math.min(95, Math.max(35, Number(saved.opacity) || 88));
    const source=native?saved.settings:saved.reading;reading={reduceTransparency:source?.reduceTransparency===true,largeText:source?.largeText===true};
    dark = saved.dark !== false;
    if(native){dataVersion=saved.version;widgetVisible=saved.settings.widgetVisible!==false;pinned=!!saved.settings.widgetPinned;collapsed=!!saved.settings.widgetCollapsed;}
  } else tasks = native ? [] : seedTasks();
} catch {
  tasks = native ? [] : seedTasks();
  saveError = '本地数据无法读取，当前只展示临时样例；请先导出检查，原存储尚未覆盖。';
}
const gantt=mountGantt({root:$('#gantt-view'),getTasks:()=>tasks,onRange:through=>ensureRecurrences(through),getProjects:()=>shownProjects(),getSelected:()=>selected,icon:svg,escape:esc,
  getOrder:()=>prefs.taskOrder,getSeries:()=>recurrences,onPin(task){mutate(()=>toggleTaskPin(task),task.top?'已取消置顶':'任务已置顶');},
  onSelect(task){selected=task.id;historyOnly=false;calendarDetailOpen=true;render();$('#task-detail [data-action="calendar-close-detail"]')?.focus({preventScroll:true});reportRenderer();},
  onNew(date,project){openNew(date);if(project)$('#new-form').elements.project.value=project;},
  onReschedule(task){openReschedule(task.id);},
  onToggle(task){mutate(()=>toggleDone(task),task.done?'任务已重新打开':'任务已完成');}
});

function save() {
  try {
    prefs=preferences(prefs,projects,tasks);
    if(native){
      const result=native.commit({tasks,projects,opacity,dark,recurrences,preferences:prefs,projectRenames},dataVersion);
      if(!result.ok){if(result.snapshot)applySnapshot(result.snapshot);throw new Error(result.error);}
      projectRenames={};dataVersion=result.snapshot.version;
      tasks=result.snapshot.tasks;recurrences=result.snapshot.recurrences||[];
      if(result.backupError)toast('任务已保存，但自动备份失败：'+result.backupError);
    }else{
    localStorage.setItem('toz-prototype-v1', JSON.stringify({ schema: 1, referenceDate: TODAY, tasks, projects, opacity, dark, reading, recurrences, preferences:prefs }));
    }
    projectRenames={};saveError = '';
    $('#save-status').classList.remove('error');
    $('#save-status').innerHTML = '<span class="live-dot"></span>已保存在本机';
    return true;
  } catch(error) {
    saveError = native ? error.message : '本地保存失败，当前更改仅在内存中。请导出 JSON 保留数据。';
    $('#save-status').classList.add('error');
    $('#save-status').textContent = '保存失败 · 请导出数据';
    toast(saveError);
    return false;
  }
}
function mutate(action, message) {
  try { action();if(tasks.find(t=>t.id===selected)?.deletedAt)selected=tasks.find(t=>!t.deletedAt&&!t.cancelled)?.id||null;if(view.startsWith('project:')&&!shownProjects().includes(view.slice(8)))view='all'; const ok = save(); render(); reportRenderer(); if (ok && message) toast(message); } catch(error) { toast(error.message); }
}
function ensureRecurrences(through=addDays(TODAY,45)){
  try{const added=materializeSeries(recurrences,tasks,through);if(!added.length)return false;tasks.unshift(...added);prefs.taskOrder=[...added.map(t=>t.id),...prefs.taskOrder];return save();}catch(error){toast(error.message);return false;}
}
function readRepeatRule(){
  const form=$('#new-form'),preset=form.elements.repeatPreset.value;
  const unit=preset==='custom'?form.elements.repeatUnit.value:['daily'].includes(preset)?'day':['workdays','weekends','weekly','biweekly'].includes(preset)?'week':['monthly','month-end','quarterly'].includes(preset)?'month':'year';
  const interval=preset==='custom'?Number(form.elements.repeatInterval.value):preset==='biweekly'?2:preset==='quarterly'?3:1;
  const weekdays=preset==='workdays'?[0,1,2,3,4]:preset==='weekends'?[5,6]:[...form.querySelectorAll('[name="repeatWeekday"]:checked')].map(el=>Number(el.value));
  const lunar=preset.startsWith('lunar-');
  return {unit:lunar?(preset==='lunar-monthly'?'month':'year'):unit,interval,...(lunar?{calendar:'lunar',lunar:{month:Number(form.elements.lunarMonth.value),day:Number(form.elements.lunarDay.value),leap:form.elements.lunarLeap.value}}:{}),...(unit==='week'?{weekdays}:{}),...(preset==='month-end'?{monthEnd:true}:{})};
}
function updateRepeatForm(){
  const form=$('#new-form'),preset=form.elements.repeatPreset.value,custom=preset==='custom',enabled=preset!=='none';
  const isLunar=preset.startsWith('lunar-');$('#repeat-lunar').hidden=!isLunar;$('#lunar-month-label').hidden=preset==='lunar-monthly';form.elements.lunarLeap.querySelector('[value="leap"]').disabled=preset==='lunar-monthly';if(preset==='lunar-monthly'&&form.elements.lunarLeap.value==='leap')form.elements.lunarLeap.value='regular';
  $('#repeat-custom').hidden=!custom;form.elements.repeatInterval.disabled=!custom;form.elements.repeatUnit.disabled=!custom;$('#repeat-options').hidden=!enabled;
  $('#repeat-weekdays').hidden=!(preset==='weekly'||preset==='biweekly'||custom&&form.elements.repeatUnit.value==='week');
  const dateHint=$('#repeat-date-hint');dateHint.hidden=!enabled;
  const start=form.elements.startDate.value,end=form.elements.date.value;
  dateHint.textContent=enabled&&start&&end&&end>=start?`计划开始日用于起算周期；两日期相差 ${dayDiff(start,end)} 天，每期从执行日开始，${start===end?'计划当天完成':dayDiff(start,end)+' 天后计划完成'}。这不是整个周期的结束日期。`:'';
  const hint=$('#repeat-preview');if(!enabled){hint.textContent='每一期独立完成、独立记录，调整本期不会改变后续周期。';return;}
  try{
    const series=createSeries({title:'预览',note:'',project:'个人',planStart:form.elements.startDate.value,plan:form.elements.date.value},readRepeatRule(),form.elements.repeatUntil.value||null);
    const dates=materializeSeries([series],[],addDays(series.start,35)).slice(0,3).map(t=>dateText(t.repeatDate)+' → '+dateText(t.plan));
    hint.textContent=`${recurrenceLabel(series)}${series.until?'，至 '+dateText(series.until):'，持续重复'}。接下来（执行日 → 计划完成日）：${dates.join('、')||'结束前没有匹配日期'}${series.rule.calendar==='lunar'?'。大月三十遇小月取廿九；每一期按农历换算公历。':(['month','year'].includes(series.rule.unit)?'。月末和闰日自动取当月最后一天。':'。')}`;
  }catch(error){hint.textContent=error.message;}
}
function toast(message) {
  clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.add('visible');
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 4200);
}
function hydrateIcons(root = document) { root.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = svg(el.dataset.icon)); }
const names = { gantt:['甘特图','甘特图','从开始到完成，看清每一步。'], today: ['今天','今天，慢慢做好。','留一点专注，给真正重要的事。'], calendar: ['日历','把日子，慢慢填好。','按起止区间查看每天的安排。'], upcoming: ['即将到来','给未来，留好位置。','重复任务仅显示最近一期，未来安排一眼看清。'], all: ['全部任务','每一件事，都有位置。','有日期的计划，和还没排期的想法。'], delayed: ['延期记录','计划改变，痕迹还在。','每一次调整，都值得被理解。'], done: ['已完成','做过的事，都算数。','回头看看，你已经走了这么远。'] };
function viewTasks() {
  let result = tasks.filter(t=>!t.cancelled&&!t.deletedAt);
  if (view === 'today') result = todayTasks(tasks);
  if (view === 'upcoming') result = upcomingTasks(tasks);
  if (view === 'delayed') result = tasks.filter(t => !t.cancelled&&!t.deletedAt&&postponements(t).length);
  if (view === 'done') result = tasks.filter(t => t.done&&!t.cancelled&&!t.deletedAt);
  if (view.startsWith('project:')) result = tasks.filter(t => !t.cancelled&&!t.deletedAt&&t.project === view.slice(8));
  const term = query.trim().toLocaleLowerCase();
  const raw=ordered(result.filter(t => !term || `${t.title} ${t.note} ${t.project} ${t.events.map(e => e.reason || '').join(' ')}`.toLocaleLowerCase().includes(term)));
  const expanded=new Set([...new Set(raw.map(t=>t.repeatId).filter(Boolean))].filter(id=>expandedTaskSeries.has(seriesExpansionKey(id))));
  const presentation=taskListPresentation(raw,{expanded,collapse:!term&&beforeGlobalSearch===null&&(view==='all'||view.startsWith('project:'))});
  return {...presentation,raw};
}
function taskMeta(task, widget = false) {
  const days=duration(task),count=postponements(task).length,out=[];
  if(!widget)out.push(`<span class="tag" data-project="${esc(task.project)}" style="--project-color:${projectColor(task.project)}">${esc(task.project)}</span>`);
  if(days!==null)out.push(`<span>${task.done?'历时':'持续'} ${days} 天</span>`);
  if(count)out.push(`<span class="amber">延期 ${count} 次</span>`);
  if(task.plan&&(!task.started||task.plan!==TODAY))out.push(`<time datetime="${esc(task.plan)}" class="${task.plan<TODAY&&!task.done?'amber':''}" title="计划完成：${esc(dateText(task.plan))}">${task.plan<TODAY&&!task.done?'逾期 · ':''}${compactDay(task.plan)}</time>`);
  if(!widget&&task.repeatId){const series=recurrences.find(s=>s.id===task.repeatId);out.push(`<span class="repeat-tag" title="${esc(series?recurrenceLabel(series):'周期任务')} · ${esc(dateText(task.repeatDate))}">${svg('history')}重复 · ${compactDay(task.repeatDate)}</span>`);}
  const group=!widget&&!task.done?listSeriesGroups.get(task.repeatId):null;
  if(group&&group.tasks.length>1&&group.representative.id===task.id)out.push(`<button class="repeat-instances-toggle" data-action="toggle-repeat-instances" data-repeat="${esc(task.repeatId)}" aria-expanded="${group.expanded}" aria-label="${group.expanded?'收起':'展开'}${esc(task.title)}的其余${group.tasks.length-1}期">${svg(group.expanded?'collapse':'expand')}${group.expanded?'收起':'展开'}其余 ${group.tasks.length-1} 期</button>`);
  if(visibleSubtasks(task).length)out.push(`<button type="button" class="subtasks-toggle" data-action="toggle-subtasks" ${taskIdAttr(task)} aria-expanded="${(widget?expandedWidgetSubtasks:expandedSubtasks).has(task.id)}" aria-controls="${widget?'widget':'inline'}-subtasks-${esc(task.id)}" aria-label="${(widget?expandedWidgetSubtasks:expandedSubtasks).has(task.id)?'收起':'展开'}${widget?'浮窗':''}子任务：${esc(task.title)}">${svg((widget?expandedWidgetSubtasks:expandedSubtasks).has(task.id)?'collapse':'expand')}${visibleSubtasks(task).filter(s=>s.done).length}/${visibleSubtasks(task).length} 子任务</button>`);
  return out.join('<span class="meta-sep"></span>');
}
function inlineSubtasks(task,widget=false){
  return `<div class="inline-subtasks" id="${widget?'widget':'inline'}-subtasks-${esc(task.id)}" data-action="subtasks-panel" ${(widget?expandedWidgetSubtasks:expandedSubtasks).has(task.id)?'':'hidden'} role="group" aria-label="${esc(task.title)}的子任务">${visibleSubtasks(task).map(sub=>`<div data-subtask-row="${esc(sub.id)}" ${taskIdAttr(task)} tabindex="0" class="subtask ${sub.done?'is-done':''}"><button class="check-button ${sub.done?'done':''}" data-action="subtask" ${taskIdAttr(task)} data-subtask="${esc(sub.id)}" aria-label="${sub.done?'重新打开':'完成'}${widget?'浮窗':'列表'}子任务：${esc(sub.title)}" aria-pressed="${sub.done}">${sub.done?svg('check'):''}</button><span class="subtask-name" title="双击编辑名称与日期">${esc(sub.title)}${subtaskDates(sub)}</span><button class="subtask-edit icon-button" data-action="edit-subtask" ${taskIdAttr(task)} data-subtask="${esc(sub.id)}" aria-label="编辑子任务：${esc(sub.title)}">${svg('sliders')}</button></div>`).join('')}</div>`;
}
function taskRow(task, widget = false) {
  return `<div class="${widget ? 'widget-row' : 'task-row'} ${task.done ? 'completed' : ''} ${selected === task.id && !widget ? 'selected' : ''}" ${taskIdAttr(task)} ${reorderAttrs(task)} data-action="select" role="group" tabindex="0" title="长按拖动排序 · Alt + ↑ / ↓ 调整顺序" aria-label="${esc(task.title)}">
  <button class="check-button ${task.done ? 'done' : ''}" data-action="complete" ${taskIdAttr(task)} aria-label="${task.done ? '重新打开' : '完成'}：${esc(task.title)}" aria-pressed="${!!task.done}">${task.done ? svg('check') : ''}</button>
  <div class="task-body"><button class="task-title task-select" data-action="select" ${taskIdAttr(task)} aria-label="查看详情：${esc(task.title)}">${esc(task.title)}${task.top?`<span class="task-pin-indicator" title="任务已置顶">${svg('pin')}</span>`:''}</button><div class="task-meta">${taskMeta(task, widget)}</div>${visibleSubtasks(task).length?inlineSubtasks(task,widget):''}</div>
  <button class="icon-button row-more" data-action="more" ${taskIdAttr(task)} aria-label="更多操作：${esc(task.title)}" aria-haspopup="menu">${svg('more')}</button></div>`;
}
function renderList() {
  const project = view.startsWith('project:') ? view.slice(8) : '';
  const [label,title,subtitle] = names[view] || [project,`${project}，一点点推进。`,'把大事拆小，让每一步清楚可见。'];
  $('#breadcrumb').innerHTML = `我的空间 <span class="crumb-slash">/</span> ${esc(label)}`;
  $('#view-title').textContent = label; $('#view-subtitle').textContent = subtitle;
  $('#list-label').textContent = view === 'delayed' ? '有过延期的任务' : label === '今天' ? '今日清单' : label;
  const presentation=viewTasks(),list=presentation.items;listSeriesGroups=presentation.groups;
  const completed = list.filter(t => t.done), active = list.filter(t => !t.done);
  const total = presentation.raw.length, percent = total ? Math.round(completed.length / total * 100) : 0;
  $('#progress-caption').textContent = completed.length+' / '+total+' 已完成';
  $('.progress-summary').style.setProperty('--progress',percent+'%');
  $('#progress-detail').hidden=total<=list.length;$('#progress-detail').textContent=total>list.length?'已收起 '+(total-list.length)+' 个后续期次，进度按实际期数计算。':'';
  $('#progress-percent').textContent = percent + '%'; $('#progress-fill').style.width = percent + '%';
  let html = '';
  if (view === 'today') {
    const pinnedTasks=active.filter(t=>t.top),current=active.filter(t=>!t.top);
    if(pinnedTasks.length)html+=`<div class="group-label">已置顶 · ${pinnedTasks.length}<span></span></div>${pinnedTasks.map(t=>taskRow(t)).join('')}`;
    if (current.length) html += `<div class="group-label">正在推进 · ${current.length}<span></span></div>${current.map(t=>taskRow(t)).join('')}`;
  } else html += active.map(t=>taskRow(t)).join('');
  if (completed.length) html += `<div class="group-label">${view === 'today' ? '今日已完成' : '已完成'} · ${completed.length}<span></span></div>${completed.map(t=>taskRow(t)).join('')}`;
  $('#task-list').innerHTML = html || `<div class="empty-state">${svg('leaf')}${query ? '没有找到匹配的任务<br>试试其他关键词。' : '这里暂时没有任务<br>给接下来的日子留一点空白。'}</div>`;
  $('#today-count').textContent = todayTasks(tasks).filter(t=>!t.done).length;
  $('#upcoming-count').textContent = upcomingTasks(tasks).length;
  renderProjects();
  document.querySelectorAll('[data-view]').forEach(b=>{ b.classList.toggle('active',b.dataset.view===view); if(b.dataset.view===view)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current'); });
  const isCalendar = view === 'calendar', isGantt=view==='gantt',isWide=isCalendar||isGantt;
  if (!isWide) calendarDetailOpen = false;
  $('.app-window').classList.toggle('calendar-open', isWide);
  $('.app-window').classList.toggle('calendar-detail-open', isWide && calendarDetailOpen);
  $('#calendar-view').hidden = !isCalendar;
  $('#gantt-view').hidden=!isGantt;
  $('.task-column').hidden = isWide;
  $('#task-detail').hidden = isWide && !calendarDetailOpen;
  if (isCalendar) renderCalendar();
  if(isGantt)gantt.render();
  if(beforeGlobalSearch!==null)$('#global-search').value=query;
}
function calendarTask(task, date) {
  const range=calendarTaskRange(task), marker=date===range?.start?'开始':date===range?.end?(task.done?'完成':task.plan===date?'截止':''):'';
  return `<div class="calendar-task ${task.done ? 'is-done' : ''} " style="--project-color:${projectColor(task.project)}"><button class="calendar-check" data-action="complete" ${taskIdAttr(task)} aria-label="${task.done ? '重新打开' : '完成'}：${esc(task.title)}" aria-pressed="${!!task.done}">${task.done ? svg('check') : ''}</button><button class="calendar-task-title" data-action="calendar-select" ${taskIdAttr(task)} title="${esc(task.title)} · ${dateText(range?.start)} — ${dateText(range?.end)}" aria-label="查看详情：${esc(task.title)}">${esc(task.title)}</button>${marker?`<span class="calendar-range-mark">${marker}</span>`:''}</div>`;
}
function renderMonthGrid() {
  const weeks=calendarWeeks(tasks,calendarMonth,calendarQuery,prefs.taskOrder),ids=new Set();
  $('#month-grid').innerHTML=weeks.map(week=>{
    const key=week.days[0].date,expanded=expandedDays.has(key),visible=week.segments.filter(seg=>expanded||seg.lane<5),rows=Math.max(0,expanded?week.laneCount:Math.min(5,week.laneCount));
    week.segments.forEach(seg=>ids.add(seg.task.id));
    return `<div class="calendar-week" style="--week-rows:${rows}"><div class="calendar-week-days">${week.days.map((day,i)=>`<section class="calendar-day ${day.inMonth?'':'outside'} ${day.date===TODAY?'is-today':''}" data-calendar-date="${day.date}" aria-label="${day.date} · ${lunarText(day.date)}，${week.counts[i]} 项事项"><div class="calendar-day-heading"><button class="calendar-date" data-action="new" data-new-date="${day.date}" aria-label="在 ${day.date} 添加待办">${day.day}</button><span class="calendar-lunar">${lunarDay(day.date)}</span><button class="day-add" data-action="new" data-new-date="${day.date}" aria-label="在 ${day.date} 新建待办">${svg('plus')}</button></div></section>`).join('')}</div><div class="calendar-week-bars">${visible.map(seg=>{const t=seg.task;return `<div class="calendar-span ${t.done?'is-done':''} ${seg.continuesBefore?'continues-before':''} ${seg.continuesAfter?'continues-after':''}" ${reorderAttrs(t)} tabindex="0" style="grid-column:${seg.first+1}/${seg.last+2};grid-row:${seg.lane+1};--project-color:${projectColor(t.project)}"><button class="calendar-check" data-action="complete" ${taskIdAttr(t)} aria-label="${t.done?'重新打开':'完成'}：${esc(t.title)}" aria-pressed="${!!t.done}">${t.done?svg('check'):''}</button><button class="calendar-task-title" data-action="calendar-select" ${taskIdAttr(t)} title="${esc(t.title)} · ${dateText(seg.range.start)} — ${dateText(seg.range.end)}">${seg.continuesBefore?'‹ ':''}${esc(t.title)}${seg.continuesAfter?' ›':''}</button>${pinButton(t)}</div>`;}).join('')}</div>${week.laneCount>5?`<button class="week-expand" data-action="calendar-expand" data-day="${key}" aria-expanded="${expanded}">${expanded?'收起本周事项':'展开本周其余 '+(week.segments.length-visible.length)+' 项'} ${svg(expanded?'collapse':'expand')}</button>`:''}</div>`;
  }).join('');
  $('#calendar-result-count').textContent=`本月 ${ids.size} 项事项`;
}
function renderCalendar() {
  ensureRecurrences(monthDays(calendarMonth).at(-1).date);
  const [year, month] = calendarMonth.split('-').map(Number);
  $('#calendar-view').innerHTML = `<div class="calendar-topline"><span>我的空间 <i>/</i> 日历</span><span class="calendar-view-label">MONTH VIEW</span></div><div class="calendar-header"><div><div class="calendar-kicker">把日子，慢慢填好。</div><h1 id="calendar-title">${year}<small>年</small> ${month}<small>月</small></h1></div><div class="calendar-navigation"><button class="icon-button" data-action="calendar-prev" aria-label="上个月">‹</button><button class="calendar-back-today" data-action="calendar-today">今天</button><button class="icon-button" data-action="calendar-next" aria-label="下个月">›</button><button class="button primary calendar-new" data-action="new">${svg('plus')}新建待办</button></div></div><div class="calendar-subbar"><div class="calendar-legend">${shownProjects().map(name=>`<span><i class="project-dot" style="background:${projectColor(name)}"></i>${esc(name)}</span>`).join('')}<span class="calendar-limit">每天最多显示 5 项，可展开</span></div><label class="calendar-search">${svg('search')}<input id="calendar-search" type="search" aria-label="搜索日历事项" placeholder="搜索本月事项" value="${esc(calendarQuery)}"></label></div><div class="calendar-scroll"><div class="calendar-board"><div class="month-weekdays">${['周一','周二','周三','周四','周五','周六','周日'].map(day => `<span>${day}</span>`).join('')}</div><div class="month-grid" id="month-grid"></div></div></div><div class="calendar-bottom"><span id="calendar-result-count"></span><span>${svg('info')}普通任务跨日连续 · 周期任务仅显示本期日期</span></div>`;
  renderMonthGrid();
}
function eventMarkup(event) {
  const labels = {task_delete:'删除任务',task_restore:'恢复任务',subtask_rename:'修改子任务名称',subtask_schedule:'调整子任务日期',subtask_delete:'删除子任务',subtask_restore:'恢复子任务',project_move:'移动分区',subtask_purge:'彻底删除子任务', plan_start:'调整计划开始日期', edit:'更新任务内容', later:'调整计划 · 延期', earlier:'调整计划 · 提前', schedule:'设置计划日期', start:'开始了这个任务', create:'创建任务', project_rename:'分区更名', complete:'完成任务', reopen:'重新打开任务', subtask:'更新子任务', subtask_add:'添加子任务',repeat_stop:'停止周期任务',cancel_repeat:'取消未来周期排期' };
  const tone=eventTone(event);
  const isDate = ['later','earlier','schedule','plan_start'].includes(event.type);
  return `<div class="timeline-item ${esc(event.type)} tone-${tone}"><span class="timeline-point"></span><div class="timeline-copy"><div class="timeline-label"><span>${esc(labels[event.type] || '更新任务')}</span><time title="${esc(event.at)}">${shortDate(event.date)}${event.at ? ' · ' + new Date(event.at).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false}) : ''}</time></div>${isDate ? `<div class="timeline-dates">${dateText(event.from)} <span>→</span> ${dateText(event.to)}</div>` : ''}${event.reason ? `<div class="timeline-reason">${esc(event.reason)}</div>` : ''}</div></div>`;
}
function repeatDetail(task){const series=recurrences.find(s=>s.id===task.repeatId);return series?`<div class="repeat-detail"><div>${svg('history')}<b>${esc(recurrenceLabel(series))}</b><small>${series.active?'每期独立记录':'已停止重复'}${series.until?' · 至 '+dateText(series.until):''}</small></div>${series.active?`<button class="text-button" data-action="stop-repeat" ${taskIdAttr(task)}>停止重复</button>`:''}</div>`:'';}
function renderDetail() {
  const task = tasks.find(t=>t.id===selected);
  if (!task||task.deletedAt) { $('#task-detail').removeAttribute('data-task');$('#task-detail').innerHTML = '<div class="empty-state">选择一个任务，看看它的故事。</div>'; return; }
  $('#task-detail').dataset.task=task.id;
  const days = duration(task), count = postponements(task).length, subs = visibleSubtasks(task);
  const events = task.events.filter(e=>!historyOnly || e.type==='later').slice().reverse();
  $('#task-detail').innerHTML = `<div class="detail-toolbar"><span>${svg('folder')} ${esc(task.project)} <span>/</span> 任务详情</span><div class="detail-toolbar-tools"><button class="icon-button" data-action="more" ${taskIdAttr(task)} aria-label="任务更多操作">${svg('more')}</button>${(view === 'calendar'||view==='gantt') ? `<button class="icon-button" data-action="calendar-close-detail" aria-label="关闭任务详情">${svg('close')}</button>` : ''}</div></div>
  <span class="status-tag"><span class="live-dot"></span>${task.done ? '已完成' : task.started ? '进行中' : '待开始'}</span><h2 class="detail-title">${esc(task.title)}</h2><p class="detail-note">${esc(task.note || '')}</p>
  ${task.repeatId?repeatDetail(task):''}<div class="origin-card"><div class="origin-icon">${svg('lock')}</div><div><div class="small-label">首次实际开始</div><b title="${esc(dateText(task.started))}">${task.started ? displayDate(task.started) : '尚未开始'}</b></div><span class="origin-lock">${svg('lock')}${task.started ? '保持不变' : '开始时记录'}</span></div>
  <div class="date-fields"><div class="field-row"><span>${svg('calendar')}计划开始</span><b title="${esc(dateText(task.planStart))}">${displayDate(task.planStart)}</b></div><div class="field-row"><span>${svg('calendar')}最初计划完成</span><b title="${esc(dateText(task.initialPlan))}">${displayDate(task.initialPlan)}</b></div><div class="field-row"><span>${svg('calendar')}当前计划完成</span><b class="current" title="${esc(dateText(task.plan))}">${displayDate(task.plan)}${task.plan===TODAY?' · 今天':''}</b></div></div>
  <div class="detail-stats"><div><strong>${days===null?'—':days}</strong>${days===null?'':'<small>天</small>'}<label>${task.done?'完成历时':'已持续'}</label></div><div><strong>${count}</strong><small>次</small><label>计划延期</label></div><div><strong>${shiftedDays(task)}</strong><small>天</small><label>累计后移</label></div></div>
  <div class="detail-actions">${task.done ? `<button class="button primary" data-action="complete" ${taskIdAttr(task)}>${svg('history')}重新打开</button>` : `<button class="button secondary" data-action="reschedule" ${taskIdAttr(task)}>${svg('calendar')}调整计划</button>${task.started ? `<button class="button primary" data-action="complete" ${taskIdAttr(task)}>${svg('check')}完成任务</button>` : `<button class="button primary" data-action="start" ${taskIdAttr(task)}>${svg('play')}开始任务</button>`}`}</div>
  <section class="detail-section"><h3 class="section-heading">子任务 <small>${subs.filter(s=>s.done).length} / ${subs.length}</small></h3>${subs.map(s=>`<div data-subtask-row="${esc(s.id)}" ${taskIdAttr(task)} tabindex="0" class="subtask ${s.done?'is-done':''}"><button class="check-button ${s.done?'done':''}" data-action="subtask" ${taskIdAttr(task)} data-subtask="${esc(s.id)}" aria-label="${s.done?'重新打开':'完成'}子任务：${esc(s.title)}" aria-pressed="${!!s.done}">${s.done?svg('check'):''}</button><span class="subtask-name" title="双击编辑名称与日期">${esc(s.title)}${subtaskDates(s)}</span><button class="subtask-edit icon-button" data-action="edit-subtask" ${taskIdAttr(task)} data-subtask="${esc(s.id)}" aria-label="编辑子任务：${esc(s.title)}">${svg('sliders')}</button></div>`).join('')}${!task.done ? `<form class="subtask-form" id="subtask-form"><input name="title" placeholder="添加子任务…" maxlength="120" required aria-label="新子任务标题"><button type="button" data-action="new-subtask-dated" ${taskIdAttr(task)} title="设置子任务日期" aria-label="添加带日期的子任务">${svg('calendar')}</button><button type="submit" title="添加子任务" aria-label="添加子任务">${svg('plus')}</button></form><p class="subtask-add-hint">可直接添加，或点日历设置开始与截止日期。</p>` : ''}</section>
  <section class="detail-section"><h3 class="section-heading">任务足迹 <button data-action="history-filter" aria-pressed="${historyOnly}">${historyOnly?'显示全部':'仅看延期'} ↕</button></h3><div class="timeline">${events.map(eventMarkup).join('') || '<p class="timeline-reason">还没有延期记录。</p>'}</div></section>`;
}
function renderWidget() {
  const listScrollTop=$('#widget .widget-list')?.scrollTop||0;
  const daily=widgetTasks(),active=daily.filter(t=>!t.done),done=daily.filter(t=>t.done).length;
  $('#widget').classList.toggle('collapsed',collapsed);
  $('#widget').innerHTML=`<div class="widget-header" title="${native?'拖动移动；双击展开或收缩':'拖动可在预览画布中移动'}"><div class="widget-title">${svg('sun')}今天</div><div class="widget-mini" id="widget-mini"></div><div class="widget-tools"><button class="icon-button" data-action="widget-menu" aria-label="浮窗选项" aria-haspopup="menu">${svg('more')}</button><button class="icon-button" data-action="collapse" aria-label="${collapsed?'展开':'折叠'}浮窗" aria-expanded="${!collapsed}">${svg(collapsed?'expand':'collapse')}</button></div></div><div class="widget-content"><div class="widget-date" title="${esc(dateText(TODAY))}">${displayDate(TODAY)}</div><div class="widget-project-filter"><select id="widget-project" aria-label="悬浮窗分区筛选"><option value="">全部分区</option>${shownProjects().map(name=>`<option value="${esc(name)}" ${prefs.widgetProject===name?'selected':''}>${esc(name)}</option>`).join('')}</select><span class="widget-filter-count">${active.length} 项待办</span></div><div class="widget-progress"><div><span>${done} / ${daily.length} 已完成</span></div></div><div class="widget-list">${active.map(t=>taskRow(t,true)).join('')||`<div class="empty-state">${svg('checkCircle')}今天已安排妥当。</div>`}</div><div class="widget-footer"><button class="widget-add" data-action="new">${svg('plus')}添加待办<kbd>N</kbd></button></div><div class="widget-bottom-label"><span>${svg('shield')}${saveError?'保存异常 · 请导出':'已保存在本机'}</span><span>${pinned?'窗口已置顶':'窗口未置顶'}</span></div></div>`;
  $('#widget .widget-list').scrollTop=listScrollTop;renderMiniWidget();
}
function render() { contextMenu?.close();const toggle=$('.desktop-titlebar [data-action="toggle-widget"]');toggle.setAttribute('aria-pressed',String(widgetVisible));toggle.setAttribute('aria-label',widgetVisible?'隐藏悬浮框':'显示悬浮框');applyAppearance(); renderList(); renderDetail(); renderWidget(); refreshNativeDates(); }
function applyAppearance(){
  document.documentElement.dataset.theme=dark?'dark':'light';
  document.documentElement.style.colorScheme=dark?'dark':'light';
  document.documentElement.classList.toggle('reduce-transparency',reading.reduceTransparency);document.documentElement.classList.toggle('large-text',reading.largeText);
  document.querySelectorAll('[data-reading]').forEach(input=>input.checked=reading[input.dataset.reading]);
  document.querySelectorAll('.appearance-switch button').forEach(button=>button.setAttribute('aria-pressed',String((button.dataset.action==='theme-dark')===dark)));
}
async function setReadingPreference(key,value){
  if(!['reduceTransparency','largeText'].includes(key)||typeof value!=='boolean')throw new Error('无效阅读设置');
  if(native){const saved=await native.configure({[key]:value});reading={reduceTransparency:saved.reduceTransparency===true,largeText:saved.largeText===true};}
  else{const before=reading;reading={...reading,[key]:value};if(!save()){reading=before;applyAppearance();throw new Error(saveError);}}
  applyAppearance();
}
async function openSettings(tab='appearance'){
  if(native?.surface==='widget'){await nativeCommand('open-main',{action:'settings',tab});return;}
  if(native)await refreshDesktopSettings();selectSettingsTab(tab);openDialog('#settings-dialog');
}
function openProject(name=null){
  if(native?.surface==='widget'){nativeCommand('open-main',{action:'project',name});return;}
  editingProject=name;const form=$('#project-form');form.reset();form.elements.name.value=name||'';form.elements.color.value=projectColor(name||'新分区');$('#project-dialog h2').textContent=name?'编辑分区':'新建分区';form.querySelector('[type="submit"]').textContent=name?'保存修改':'添加分区';openDialog('#project-dialog');
}
function renderProjects(){
  const select=$('#new-form').elements.project, previous=select.value;
  setProjectColors(prefs.projectColors);
  const menu=$('.nav-group');for(const key of prefs.menuOrder){const item=[...menu.querySelectorAll('[data-view]')].find(el=>el.dataset.view===key);if(item){item.dataset.reorderKind='menu';item.dataset.reorderId=key;item.title='长按拖动排序 · Alt + ↑ / ↓';menu.append(item);}}
  $('#project-nav').innerHTML='<div class="project-heading"><span class="eyebrow">分区</span><button class="icon-button" data-action="new-project" title="添加分区" aria-label="添加分区">'+svg('plus')+'</button></div>'+shownProjects().map(name=>`<div class="project-item" data-reorder-kind="project" data-reorder-id="${esc(name)}" tabindex="0" title="双击编辑名称和颜色 · 长按拖动排序"><button class="nav-item" data-view="project:${esc(name)}"><i class="project-dot" style="background:${projectColor(name)}"></i><span class="project-name">${esc(name)}</span><span class="nav-count">${taskListPresentation(tasks.filter(t=>!t.done&&t.project===name)).items.length}</span></button><button class="project-edit icon-button" data-action="edit-project" data-project="${esc(name)}" aria-label="编辑分区：${esc(name)}">${svg('sliders')}</button></div>`).join('');
  const options=shownProjects().map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join('')+'<option value="__new_project__">＋ 新建分区…</option>';
  if(select.innerHTML!==options){select.innerHTML=options;select.value=shownProjects().includes(previous)?previous:shownProjects()[0];}
}
$('#project-form').addEventListener('submit',event=>{
  event.preventDefault();const form=event.currentTarget;
  try{
    const name=projectName(form.elements.name.value),color=form.elements.color.value,old=editingProject;
    if(!old&&prefs.projectTrash.some(item=>item.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw new Error('同名分区在回收站中，请先恢复或使用其他名称');
    if(old&&old!==name){
      const state=renameProject({projects,tasks,recurrences,preferences:prefs},old,name);projects=state.projects;
      for(const task of tasks.filter(t=>t.project===name))task.events.push({id:uid(),type:'project_rename',date:TODAY,at:new Date().toISOString(),fromProject:old,toProject:name,reason:old+' → '+name});
      projectRenames={...projectRenames,[old]:name};if(view==='project:'+old)view='project:'+name;
    }else if(!old)projects=projectList([...projects,name],tasks);
    prefs.projectColors={...prefs.projectColors,[name]:color};setProjectColors(prefs.projectColors);
    if(!save())return;render();$('#new-form').elements.project.value=name;$('#project-dialog').close();toast(old?'分区已更新':'分区已添加');
  }catch(error){form.querySelector('.form-error').textContent=error.message;}
});
$('#project-nav').addEventListener('dblclick',event=>{const item=event.target.closest('.project-item');if(item)openProject(item.dataset.reorderId);});
$('#new-form').elements.project.addEventListener('change',event=>{if(event.target.value==='__new_project__'){event.target.value=shownProjects()[0];openProject();}});
document.addEventListener('change',event=>{if(event.target.id==='widget-project'){prefs.widgetProject=event.target.value;miniIndex=0;save();renderWidget();reportRenderer();}});

function renderMiniWidget(){
  const root=$('#widget-mini');if(!root)return;
  const active=widgetTasks().filter(t=>!t.done),task=active.length?active[miniIndex%active.length]:null;
  root.innerHTML=task?`<button class="mini-task" data-action="select" ${taskIdAttr(task)} title="${esc(task.title)} · ${miniIndex%active.length+1}/${active.length}"><span class="mini-task-viewport"><span class="mini-task-title">${esc(task.title)}</span></span><small>${miniIndex%active.length+1}/${active.length}</small></button>`:'<span class="mini-empty">今天暂无待办</span>';
}
setInterval(()=>{if(!collapsed||document.hidden)return;miniIndex++;renderMiniWidget();reportRenderer();},4000);
$('#widget').addEventListener('wheel',event=>{if(!collapsed)return;event.preventDefault();const count=widgetTasks().filter(t=>!t.done).length;if(count){miniIndex=(miniIndex+(event.deltaY>=0?1:count-1))%count;renderMiniWidget();}},{passive:false});
$('#widget').addEventListener('dblclick',event=>{if(native||event.target.closest('button')||!event.target.closest('.widget-header'))return;collapsed=!collapsed;renderWidget();});
document.addEventListener('click',event=>{const preset=event.target.closest('[data-range-days]');if(!preset)return;const form=$('#new-form'),start=form.elements.startDate.value||TODAY;form.elements.startDate.value=start;form.elements.date.value=addDays(start,Number(preset.dataset.rangeDays)-1);syncDatePickers();updateRepeatForm();});

function refreshNativeDates(){
  $('.desktop-clock small').textContent=new Date(TODAY+'T12:00:00').toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'})+' · '+lunarText(TODAY);
  $('#date-label').textContent=new Date(TODAY+'T12:00:00').toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'});$('#date-label').title=dateText(TODAY);
  const tomorrow=addDays(TODAY,1),weekday=new Date(TODAY+'T12:00:00').getDay(),friday=addDays(TODAY,(5-weekday+7)%7||7),week=addDays(TODAY,7);
  $('.date-shortcuts').innerHTML=[[tomorrow,'明天'],[friday,'下一个周五'],[week,'一周后']].map(([date,label])=>`<button type="button" data-date="${date}">${label} · ${shortDate(date)}</button>`).join('');
}
function applySnapshot(snapshot){
  dataVersion=snapshot.version;widgetVisible=snapshot.settings?.widgetVisible!==false;tasks=snapshot.tasks;recurrences=snapshot.recurrences||[];projects=projectList(snapshot.projects,tasks);prefs=preferences(snapshot.preferences,projects,tasks);setProjectColors(prefs.projectColors);opacity=snapshot.opacity;dark=snapshot.dark;reading={reduceTransparency:snapshot.settings?.reduceTransparency===true,largeText:snapshot.settings?.largeText===true};pinned=!!snapshot.settings?.widgetPinned;collapsed=!!snapshot.settings?.widgetCollapsed;
  if(!tasks.some(t=>t.id===selected&&!t.deletedAt))selected=tasks.find(t=>!t.deletedAt&&!t.cancelled)?.id||null;
  document.documentElement.style.setProperty('--widget-alpha',opacity/100);$('#opacity-range').value=opacity;$('#opacity-value').value=opacity+'%';render();
  if($('#trash-dialog').open)renderTrash();
  reportRenderer();
}
function reportRenderer(){if(native?.smoke)native.command('smoke-ready',{surface:native.surface,version:dataVersion,tasks:tasks.length,deletedTasks:tasks.filter(t=>t.deletedAt).length,activeProjects:shownProjects(),smokeTaskProject:tasks.find(t=>t.id==='desktop-smoke-task')?.project,smokeChildTitles:visibleSubtasks(tasks.find(t=>t.id==='desktop-smoke-task')||{subtasks:[]}).map(s=>s.title),widgetTaskIDs:widgetTasks().filter(t=>!t.done).map(t=>t.id),widgetProject:prefs.widgetProject,projectColors:prefs.projectColors,menuOrder:prefs.menuOrder,topTaskIDs:ordered(tasks.filter(t=>t.top)).map(t=>t.id),lunarSeries:recurrences.filter(s=>s.rule.calendar==='lunar').length,recurringSeries:recurrences.length,recurringTasks:tasks.filter(t=>t.repeatId&&!t.cancelled&&!t.deletedAt).length,date:TODAY,view,ganttBars:$('#gantt-view').querySelectorAll('.gantt-bar').length,ganttTasks:Number($('#gantt-view').dataset.ganttTasks||0),todayTaskIDs:todayTasks(tasks).filter(t=>!t.done).map(t=>t.id),widgetSubtaskToggles:$('#widget').querySelectorAll('[data-action="toggle-subtasks"]').length,widgetOpenSubtasks:$('#widget').querySelectorAll('.inline-subtasks:not([hidden])').length,collapsed,miniTask:$('#widget-mini')?.textContent||'',projects:[...projects],dark,showWidgetButton:!!$('.desktop-titlebar [data-action="toggle-widget"]')}).catch(()=>{});}
async function nativeCommand(name,arg){try{return await native.command(name,arg);}catch(error){toast(error.message);return false;}}
function openDialog(id) { const d = $(id); closeDatePickers(); syncDatePickers(); d.querySelectorAll('.form-error').forEach(el=>el.textContent=''); d.showModal(); }
function openNew(date) {
  if(native?.surface==='widget'){nativeCommand('open-quick-add',{date});return;}
  $('#new-form').reset();
  renderProjects();if(native?.surface==='quick-add'&&prefs.widgetProject)$('#new-form').elements.project.value=prefs.widgetProject;else if(view.startsWith('project:'))$('#new-form').elements.project.value=view.slice(8);
  editingTask=null;$('#new-dialog h2').textContent='新的待办';$('#new-form [type="submit"]').textContent='创建待办';$('#new-form .task-date-range').hidden=false;$('#range-presets').hidden=false;$('#recurrence-section').hidden=false;
  $('#new-form').elements.date.value = date || (view === 'calendar' && calendarMonth !== TODAY.slice(0,7) ? calendarMonth + '-01' : TODAY);
  $('#new-form').elements.startDate.value=$('#new-form').elements.date.value;
  const lunar=lunarDate($('#new-form').elements.startDate.value);$('#new-form').elements.lunarMonth.value=Math.abs(lunar.month);$('#new-form').elements.lunarDay.value=lunar.day;
  const weekday=(new Date($('#new-form').elements.startDate.value+'T00:00:00Z').getUTCDay()+6)%7;$('#new-form').querySelectorAll('[name="repeatWeekday"]').forEach(el=>el.checked=Number(el.value)===weekday);
  updateRepeatForm();openDialog('#new-dialog');
}
function openEdit(task){
  if(!task)return;editingTask=task.id;const form=$('#new-form');form.reset();form.elements.title.value=task.title;form.elements.note.value=task.note;form.elements.project.value=task.project;$('#new-form .task-date-range').hidden=true;$('#range-presets').hidden=true;$('#recurrence-section').hidden=true;$('#new-dialog h2').textContent='编辑任务';form.querySelector('[type="submit"]').textContent='保存修改';openDialog('#new-dialog');
}
let rescheduleId;
function updateRescheduleHint() {
  const task=tasks.find(t=>t.id===rescheduleId), date=$('#reschedule-form').elements.date.value,start=$('#reschedule-form').elements.startDate.value;
  if (!task) return;
  let text=!task.plan?'将首次安排计划完成日期。':date===task.plan?'新日期与当前计划相同。':date>task.plan?`本次后移 ${dayDiff(task.plan,date)} 天，将追加一条延期记录。`:'本次为提前调整，不增加延期次数。';
  if(start&&date&&start>date)text='计划完成日期不能早于计划开始日期。';else if((start||null)!==(task.planStart||null))text='将记录计划开始日期调整；'+text;
  $('#reschedule-hint').textContent=`当前计划：${dateText(task.plan)}。${text}`;
}
function openReschedule(id) {
  if(native?.surface==='widget'){nativeCommand('open-main',{action:'reschedule',id});return;}
  const task=tasks.find(t=>t.id===id); if(!task)return;
  rescheduleId=id; $('#reschedule-title').textContent=task.title; $('#reschedule-start').textContent=task.started?dateText(task.started):'尚未开始';
  const tomorrow=addDays(TODAY,1);$('#reschedule-form').reset();$('#reschedule-form').elements.startDate.value=task.planStart||''; $('#reschedule-form').elements.date.value=task.plan && task.plan>tomorrow?task.plan:tomorrow;
  updateRescheduleHint(); openDialog('#reschedule-dialog');
}
function exportJson(value, filename) {
  const data={schema:1,referenceDate:TODAY,exportedAt:new Date().toISOString(),...value};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'}));
  const a=document.createElement('a'); a.href=url; a.download=filename; a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);toast('已生成 JSON 导出文件');
}
function setMode(next) {
  mode=next; $('.showcase').dataset.mode=next;
  document.querySelectorAll('[data-mode]').forEach(b=>{if(b.tagName==='BUTTON') b.setAttribute('aria-pressed',b.dataset.mode===next);});
  $('#widget').style.removeProperty('left');$('#widget').style.removeProperty('top');$('#widget').style.removeProperty('right');
}
document.addEventListener('click',async event=>{
  const close=event.target.closest('[data-close]'); if(close){close.closest('dialog').close();return;}
  const button=event.target.closest('[data-mode]'); if(button?.tagName==='BUTTON'){setMode(button.dataset.mode);return;}
  const nav=event.target.closest('[data-view]'); if(nav){if(nav.dataset.view.startsWith('project:')){const name=nav.dataset.view.slice(8),now=performance.now();if(lastProjectClick?.name===name&&now-lastProjectClick.at<400){lastProjectClick=null;openProject(name);return;}lastProjectClick={name,at:now};}beforeGlobalSearch=null;$('#global-search').value='';view=nav.dataset.view;calendarDetailOpen=false;query='';$('#task-search').value='';render();return;}
  const shortcut=event.target.closest('[data-date]'); if(shortcut){$('#reschedule-form').elements.date.value=shortcut.dataset.date;syncDatePickers();closeDatePickers();updateRescheduleHint();return;}
  const target=event.target.closest('[data-action]');if(!target)return;
  const task=tasks.find(t=>t.id===target.dataset.task);
  switch(target.dataset.action){
    case 'subtasks-panel':break;
    case 'toggle-repeat-instances':{const key=seriesExpansionKey(target.dataset.repeat);if(expandedTaskSeries.has(key))expandedTaskSeries.delete(key);else expandedTaskSeries.add(key);renderList();[...document.querySelectorAll('[data-action="toggle-repeat-instances"]')].find(el=>el.dataset.repeat===target.dataset.repeat)?.focus({preventScroll:true});break;}
    case 'toggle-subtasks':if(task){const widget=!!target.closest('.widget'),expanded=widget?expandedWidgetSubtasks:expandedSubtasks;if(expanded.has(task.id))expanded.delete(task.id);else expanded.add(task.id);if(widget)renderWidget();else renderList();[...document.querySelectorAll(`${widget?'#widget':'#task-list'} [data-action="toggle-subtasks"]`)].find(el=>el.dataset.task===task.id)?.focus({preventScroll:true});}break;
    case 'stop-repeat':if(task){const series=recurrences.find(s=>s.id===task.repeatId);if(series?.active)mutate(()=>{stopSeries(series,tasks);if(task.cancelled)selected=tasks.find(t=>!t.cancelled&&!t.deletedAt)?.id||null;task.events.push({id:uid(),type:'repeat_stop',date:TODAY,at:new Date().toISOString(),reason:'保留已完成和已开始的任务，取消未来未开始排期'});},'已停止重复，历史与当前任务已保留');}break;
    case 'select':if(task){if(native?.surface==='widget'){nativeCommand('open-main',{action:'select',id:task.id});break;}const fromWidget=!!target.closest('.widget');selected=task.id;historyOnly=false;if(view==='calendar'||view==='gantt')calendarDetailOpen=true;renderDetail();renderList();if(fromWidget){if(mode==='widget')setMode('both');$('.client-stage').scrollIntoView({behavior:'smooth',block:'start'});}}break;
    case 'calendar-select':if(task){selected=task.id;historyOnly=false;calendarDetailOpen=true;render();$('#task-detail [data-action="calendar-close-detail"]').focus({preventScroll:true});}break;
    case 'calendar-close-detail':calendarDetailOpen=false;renderList();break;
    case 'calendar-prev':calendarMonth=shiftMonth(calendarMonth,-1);renderCalendar();break;
    case 'calendar-next':calendarMonth=shiftMonth(calendarMonth,1);renderCalendar();break;
    case 'calendar-today':calendarMonth=TODAY.slice(0,7);renderCalendar();break;
    case 'calendar-expand':if(expandedDays.has(target.dataset.day))expandedDays.delete(target.dataset.day);else expandedDays.add(target.dataset.day);renderMonthGrid();$(`[data-action="calendar-expand"][data-day="${target.dataset.day}"]`)?.focus({preventScroll:true});break;
    case 'complete':if(task)mutate(()=>toggleDone(task),task.done?'任务已重新打开，首次开始仍然保留':'任务已完成，足迹已保存');break;
    case 'start':if(task)mutate(()=>startTask(task),'已记录首次开始日期：'+dateText(TODAY));break;
    case 'reschedule':if(task)openReschedule(task.id);break;
    case 'subtask':if(task)mutate(()=>{const sub=task.subtasks.find(s=>s.id===target.dataset.subtask);if(!sub)return;sub.done=!sub.done;if(task.done&&!sub.done)toggleDone(task);task.events.push({id:uid(),type:'subtask',done:sub.done,date:TODAY,at:new Date().toISOString(),reason:`${sub.done?'完成':'重新打开'}：${sub.title}`});},'子任务已更新');break;
    case 'more':{const entity=resolveContext(target);if(entity)contextMenu.openAt(target,entity);}break;
    case 'clear-subtask-dates':$('#subtask-edit-form').elements.startDate.value='';$('#subtask-edit-form').elements.date.value='';syncDatePickers();break;
    case 'new-subtask-dated':if(task)openSubtaskEdit(task.id,null,$('#subtask-form').elements.title.value);break;
    case 'delete-edit-subtask':if(subtaskEdit?.subId){const task=tasks.find(t=>t.id===subtaskEdit.taskId);mutate(()=>deleteSubtask(task,subtaskEdit.subId),'子任务已移入回收站');$('#subtask-edit-dialog').close();}break;
    case 'history-filter':historyOnly=!historyOnly;renderDetail();break;
    case 'new':openNew(target.dataset.newDate);break;
    case 'edit':if(native?.surface==='widget')nativeCommand('open-main',{action:'edit',id:task?.id});else openEdit(task);break;
    case 'edit-subtask':if(task)openSubtaskEdit(task.id,target.dataset.subtask);break;
    case 'trash':if(native?.surface==='widget')nativeCommand('open-main',{action:'trash'});else openTrash();break;
    case 'new-project':openProject();break;
    case 'edit-project':openProject(target.dataset.project);break;
    case 'task-pin':if(task)mutate(()=>toggleTaskPin(task),task.top?'已取消置顶':'任务已置顶');break;
    case 'toggle-widget':if(event.detail>1)break;if(native)await nativeCommand('toggle-widget');else{widgetVisible=!widgetVisible;$('.widget-stage').hidden=!widgetVisible;render();}break;
    case 'theme-light':case 'theme-dark':dark=target.dataset.action==='theme-dark';save();applyAppearance();reportRenderer();break;
    case 'settings':await openSettings();break;
    case 'app-menu':contextMenu.openAt(target,{kind:'app',label:'ToZ'});break;
    case 'widget-menu':if(native)await nativeCommand('widget-menu');else contextMenu.openAt(target,{kind:'widget',label:'浮窗选项'});break;
    case 'guide':openDialog('#guide-dialog');break;
    case 'search':$('#global-search').focus();break;
    case 'wallpaper':$('#desktop-scene').classList.toggle('dark');break;
    case 'pin':if(native){try{await native.configure({widgetPinned:!pinned});toast('浮窗置顶设置已更新');}catch(error){toast(error.message);}break;}pinned=!pinned;renderWidget();toast(pinned?'置顶状态已开启（原型演示，尚未调用系统置顶）':'置顶状态已关闭');break;
    case 'collapse':if(native){nativeCommand('collapse-widget',!collapsed);break;}collapsed=!collapsed;renderWidget();break;
    case 'open-client':if(native){nativeCommand('open-main');break;}setMode('both');$('.client-stage').scrollIntoView({behavior:'smooth',block:'start'});break;
    case 'export':if(native){nativeCommand('export');break;}exportJson({tasks,projects,opacity,dark,recurrences,preferences:prefs},`ToZ-原型数据-${TODAY}.json`);break;
    case 'export-task':if(native){nativeCommand('export',{taskId:task?.id});break;}if(task)exportJson({tasks:[task],projects,preferences:{...prefs,taskOrder:[task.id]},recurrences:recurrences.filter(s=>s.id===task.repeatId).map(s=>({...s,active:false}))},`ToZ-任务-${task.id}.json`);break;
    case 'reset':$('#settings-dialog').close();openDialog('#reset-dialog');break;
    case 'confirm-reset':if(native){toast('安装版不提供清空历史入口');break;}tasks=seedTasks();recurrences=[];expandedSubtasks.clear();expandedWidgetSubtasks.clear();projects=[...DEFAULT_PROJECTS];prefs=preferences({},projects,tasks);projectRenames={};setProjectColors({});selected='toz';query='';view='today';historyOnly=false;$('#task-search').value='';save();render();$('#reset-dialog').close();toast('已恢复初始演示数据');break;
  }
});
$('#global-search').addEventListener('input',event=>{const value=event.target.value;if(value&&beforeGlobalSearch===null)beforeGlobalSearch=view;query=value;view=value?'all':(beforeGlobalSearch||'all');if(!value)beforeGlobalSearch=null;calendarDetailOpen=false;$('#task-search').value=value;render();});
$('#task-search').addEventListener('input',event=>{query=event.target.value;if(beforeGlobalSearch!==null){$('#global-search').value=query;if(!query){view=beforeGlobalSearch;beforeGlobalSearch=null;}}renderList();});
$('#new-form').addEventListener('change',updateRepeatForm);
$('#new-form').addEventListener('input',event=>{if(['repeatInterval','startDate','date'].includes(event.target.name))updateRepeatForm();});
document.addEventListener('click',event=>{const swatch=event.target.closest('[data-project-color]');if(swatch)$('#project-form').elements.color.value=swatch.dataset.projectColor;});
document.addEventListener('input',event=>{if(event.target.id==='calendar-search'){calendarQuery=event.target.value;renderMonthGrid();}});
$('#new-form').addEventListener('submit',event=>{
  event.preventDefault();const form=event.currentTarget;
  if(editingTask){const task=tasks.find(t=>t.id===editingTask);if(!task)return;mutate(()=>{task.title=form.elements.title.value.trim();task.note=form.elements.note.value.trim();task.project=form.elements.project.value;task.events.push({id:uid(),type:'edit',date:TODAY,at:new Date().toISOString()});},'任务内容已保存，所有日期保持不变');$('#new-dialog').close();return;}
  try{
    let task=createTask(form.elements.title.value,form.elements.date.value,form.elements.project.value,form.elements.note.value,form.elements.startDate.value);
    let created=[task];
    if(form.elements.repeatPreset.value!=='none'){
      const series=createSeries(task,readRepeatRule(),form.elements.repeatUntil.value||null);
      created=materializeSeries([series],tasks);
      if(!created.length)throw new Error('此周期在结束日期前没有执行日期');
      recurrences.push(series);task=created[0];
    }
    tasks.unshift(...created);prefs.taskOrder=[...created.map(t=>t.id),...prefs.taskOrder];selected=task.id;
    query='';beforeGlobalSearch=null;$('#global-search').value='';$('#task-search').value='';
    if(view==='gantt'){gantt.reveal(task);calendarDetailOpen=false;}
    else if(view==='calendar'){calendarMonth=(task.plan||TODAY).slice(0,7);calendarQuery='';calendarDetailOpen=false;}
    else view=todayTasks([task]).length?'today':upcomingTasks([task]).length?'upcoming':'all';
    historyOnly=false;const ok=save();render();reportRenderer();
    if(!ok){form.querySelector('.form-error').textContent=saveError;return;}
    $('#new-dialog').close();toast('待办已创建，点击“开始任务”记录首次开始');
  }catch(error){form.querySelector('.form-error').textContent=error.message;}
});
$('#reschedule-form').addEventListener('submit',event=>{
  event.preventDefault();const form=event.currentTarget,task=tasks.find(t=>t.id===rescheduleId);
  try{const type=reschedule(task,form.elements.date.value,form.elements.reason.value,form.elements.startDate.value);const ok=save();render();$('#reschedule-dialog').close();if(ok)toast(type==='later'?'已追加延期记录，首次开始日期保持不变':type==='earlier'?'已记录提前调整，首次实际开始保持不变':type==='plan_start'?'已记录计划开始日期调整，首次实际开始保持不变':'已安排计划日期');}catch(error){form.querySelector('.form-error').textContent=error.message;}
});
$('#reschedule-form').elements.date.addEventListener('input',updateRescheduleHint);
$('#reschedule-form').elements.startDate.addEventListener('input',updateRescheduleHint);
document.addEventListener('submit',event=>{
  if(event.target.id!=='subtask-form')return;event.preventDefault();const form=event.target,title=form.elements.title.value.trim();if(!title)return;
  const task=tasks.find(t=>t.id===selected);mutate(()=>addSubtask(task,title),'子任务已添加');
});
$('#opacity-range').addEventListener('input',event=>{opacity=Number(event.target.value);document.documentElement.style.setProperty('--widget-alpha',opacity/100);$('#opacity-value').value=opacity+'%';});
$('#opacity-range').addEventListener('change',save);
document.addEventListener('keydown',event=>{
  if($('dialog[open]'))return;const editing=/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)||event.target.isContentEditable;
  if(event.key==='Escape'&&calendarDetailOpen){calendarDetailOpen=false;renderList();}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();if(mode==='widget')setMode('both');$('#global-search').focus();}
  if((event.ctrlKey||event.metaKey)&&event.key===','){event.preventDefault();openSettings();}
  if(!editing&&!event.ctrlKey&&!event.metaKey&&event.key.toLowerCase()==='n'){event.preventDefault();openNew();}
});
// Dragging is confined to the simulated desktop, not the operating system.
let drag=null;
$('#widget').addEventListener('pointerdown',event=>{
  if(native)return;
  if(!event.target.closest('.widget-header')||event.target.closest('button')||event.button!==0)return;
  const widget=$('#widget'),rect=widget.getBoundingClientRect(),scene=$('#desktop-scene').getBoundingClientRect();
  drag={pointer:event.pointerId,dx:event.clientX-rect.left,dy:event.clientY-rect.top,startX:event.clientX,startY:event.clientY,captured:false,scene};
});
$('#widget').addEventListener('pointermove',event=>{
  if(!drag||drag.pointer!==event.pointerId)return;const widget=$('#widget'),scene=$('#desktop-scene');
  if(!drag.captured){if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)<4)return;widget.setPointerCapture(event.pointerId);drag.captured=true;}
  const left=Math.min(Math.max(0,event.clientX-drag.scene.left-drag.dx),scene.clientWidth-widget.offsetWidth);
  const top=Math.min(Math.max(0,event.clientY-drag.scene.top-drag.dy),scene.clientHeight-widget.offsetHeight);
  widget.style.left=left+'px';widget.style.top=top+'px';widget.style.right='auto';
});
const endDrag=()=>{drag=null;};$('#widget').addEventListener('pointerup',endDrag);$('#widget').addEventListener('lostpointercapture',endDrag);
document.documentElement.style.setProperty('--widget-alpha',opacity/100);$('#opacity-range').value=opacity;$('#opacity-value').value=opacity+'%';$('#desktop-scene').classList.toggle('dark',dark);
initializeActions();
mountReorder({onReady:()=>toast('拖动到目标位置松开 · Esc 取消'),onMove(kind,id,target,after){
  if(kind==='project')projects=moveBefore(projects,id,target,after);
  else if(kind==='menu')prefs.menuOrder=moveBefore(prefs.menuOrder,id,target,after);
  else prefs.taskOrder=moveBefore(preferences(prefs,projects,tasks).taskOrder,id,target,after);
  save();render();reportRenderer();
}});
if(native?.surface==='quick-add'){
  // Keep the heading and actions visible while the shared form scrolls.
  const form=$('#new-form'),heading=document.createElement('div'),body=document.createElement('div');
  heading.className='quick-add-heading';body.className='quick-add-body';
  heading.append(form.querySelector('.dialog-top'),form.querySelector('h2'));
  const actions=form.querySelector('.dialog-actions');
  while(form.firstChild&&form.firstChild!==actions)body.append(form.firstChild);
  form.prepend(heading,body);
  const titlebar=document.createElement('header');titlebar.className='quick-add-titlebar';titlebar.textContent='新建待办 · ToZ';
  $('#new-dialog').prepend(titlebar);
  $('#new-dialog').addEventListener('close',()=>nativeCommand('close-quick-add'));
}
mountDatePickers();hydrateIcons();mountDesktopSettings(toast,{setReading:setReadingPreference});if(!saveError)ensureRecurrences();render();
if(native){
  if(native.surface==='quick-add')openNew(new URLSearchParams(location.search).get('date')||undefined);
  reportRenderer();
  native.onState(snapshot=>{if(snapshot.version>dataVersion)applySnapshot(snapshot);});
  native.onCommand(async command=>{if(!command)return;if(['gantt','calendar','today'].includes(command.action)){$('dialog[open]')?.close();view=command.action;calendarDetailOpen=false;render();reportRenderer();}if(command.action==='new')openNew(command.date);if(command.action==='project')openProject(command.name);if(command.action==='edit'){selected=command.id;view='all';render();openEdit(tasks.find(t=>t.id===command.id));}if(command.action==='edit-subtask')openSubtaskEdit(command.id,command.subId);if(command.action==='trash')openTrash();if(command.action==='add-subtask'){selected=command.id;view='all';render();$('#subtask-form input')?.focus();}if(command.action==='settings')await openSettings(command.tab);if(command.action==='select'||command.action==='reschedule'){selected=command.id;view='all';render();if(command.action==='reschedule')openReschedule(command.id);}});
  setInterval(()=>{if(refreshToday()){calendarMonth=TODAY.slice(0,7);ensureRecurrences();render();}},30000);
  window.addEventListener('focus',()=>{if(refreshToday()){ensureRecurrences();render();}});
}
if(saveError){$('#save-status').classList.add('error');$('#save-status').textContent='读取异常 · 临时样例';toast(saveError);}


function resolveContext(element){
  const sub=element.closest('[data-subtask-row]');
  if(sub){const task=tasks.find(t=>t.id===sub.dataset.task&&!t.deletedAt),child=task?.subtasks.find(s=>s.id===sub.dataset.subtaskRow&&!s.deletedAt);return child?{kind:'subtask',id:task.id,subId:child.id,label:child.title}:null;}
  const project=element.closest('[data-reorder-kind="project"]');if(project)return {kind:'project',name:project.dataset.reorderId,label:project.dataset.reorderId};
  const row=element.closest('[data-task],[data-reorder-kind="task"]'),id=row?.dataset.task||row?.dataset.reorderId,task=tasks.find(t=>t.id===id&&!t.deletedAt);
  return task?{kind:'task',id:task.id,label:task.title}:null;
}
function contextItems(entity){
  if(entity.kind==='app')return [
    {key:'app-new',label:'添加待办',icon:'plus',shortcut:'N'},
    {key:'app-search',label:'搜索任务',icon:'search',shortcut:'Ctrl K'},
    {separator:true},{key:'app-widget',label:widgetVisible?'隐藏桌面浮窗':'显示桌面浮窗',icon:'layers'},
    {key:'app-settings',label:'设置…',icon:'settings',shortcut:'Ctrl ,'},
    {separator:true},{key:'app-export',label:'导出完整备份…',icon:'shield'},
    {key:'app-about',label:'关于 ToZ',icon:'info'},
    ...(native?[{separator:true},{key:'app-quit',label:'退出 ToZ',icon:'external'}]:[])
  ];
  if(entity.kind==='widget')return [
    {key:'widget-pin',label:'窗口始终置顶',icon:'pin',type:'checkbox',checked:pinned},
    {key:'widget-collapse',label:collapsed?'展开浮窗':'折叠浮窗',icon:collapsed?'expand':'collapse'},
    {separator:true},{key:'app-settings',label:'外观与阅读…',icon:'settings'},
    {key:'widget-client',label:'打开工作台',icon:'external'}
  ];
  if(entity.kind==='project')return [{key:'edit-project',label:'编辑名称与颜色'},{key:'new-project',label:'新建分区'},{key:'delete-project',label:'删除分区…',danger:true}];
  const task=tasks.find(t=>t.id===entity.id);if(!task)return [];
  if(entity.kind==='subtask'){const sub=task.subtasks.find(s=>s.id===entity.subId);return [{key:'edit-subtask',label:'编辑子任务'},{key:'toggle-subtask',label:sub.done?'重新打开子任务':'完成子任务'},{key:'delete-subtask',label:'删除子任务',danger:true}];}
  const out=[{key:'complete',label:task.done?'重新打开任务':'完成任务',icon:task.done?'history':'checkCircle'}];
  if(!task.done){if(!task.started)out.push({key:'start',label:'开始任务',icon:'play'});out.push({key:'reschedule',label:'调整计划…',icon:'calendar'});}
  out.push({separator:true},{key:'edit-task',label:'编辑任务…',icon:'sliders'},{key:'move-project',label:'移动到分区',icon:'folder',children:shownProjects().map(name=>({key:'move-project',label:name,value:name,color:projectColor(name),checked:task.project===name}))},{key:'pin',label:task.top?'取消任务置顶':'置顶任务',icon:'pin',type:'checkbox',checked:!!task.top});
  if(!task.done)out.push({key:'add-subtask',label:'添加子任务',icon:'plus'});
  out.push({key:'export-task',label:'导出此任务…',icon:'external'});
  if(recurrences.some(s=>s.id===task.repeatId&&s.active))out.push({key:'stop-repeat',label:'停止后续重复'});
  out.push({separator:true},{key:'delete-task',label:task.repeatId?'本期任务移入回收站':'移入回收站',icon:'trash',danger:true});return out;
}
function contextCommand(key,entity,value){
  if(entity.kind==='app'||entity.kind==='widget'){
    if(key==='app-new')openNew();
    if(key==='app-search'){if(mode==='widget')setMode('both');$('#global-search').focus();}
    if(key==='app-settings')openSettings();
    if(key==='app-about')openSettings('about');
    if(key==='app-export')document.querySelector('[data-action="export"]').click();
    if(key==='app-quit')nativeCommand('quit');
    if(key==='app-widget')document.querySelector('[data-action="toggle-widget"]').click();
    if(key==='widget-pin'){pinned=!pinned;renderWidget();toast('窗口置顶状态演示；实际置顶请使用客户端');}
    if(key==='widget-collapse'){collapsed=!collapsed;renderWidget();}
    if(key==='widget-client'){setMode('both');$('.client-stage').scrollIntoView({behavior:'smooth',block:'start'});}
    return;
  }
  const task=tasks.find(t=>t.id===entity.id&&!t.deletedAt);
  if(key==='edit-project'){openProject(entity.name);return;}if(key==='new-project'){openProject();return;}if(key==='delete-project'){openDeleteProject(entity.name);return;}
  if(!task){toast('任务已更新，请重新打开菜单');return;}
  if(key==='export-task'){if(native)nativeCommand('export',{taskId:task.id});else exportJson({tasks:[task],projects,preferences:{...prefs,taskOrder:[task.id]},recurrences:recurrences.filter(s=>s.id===task.repeatId).map(s=>({...s,active:false}))},`ToZ-任务-${task.id}.json`);return;}
  if(key==='move-project'){if(task.project===value){toast('任务已在此分区');return;}mutate(()=>moveTask(dataState(),task.id,value),'任务已移入“'+value+'”');return;}
  if(key==='edit-subtask'){openSubtaskEdit(task.id,entity.subId);return;}
  if(key==='edit-task'){if(native?.surface==='widget')nativeCommand('open-main',{action:'edit',id:task.id});else openEdit(task);return;}
  if(key==='reschedule'){openReschedule(task.id);return;}
  if(key==='add-subtask'){if(native?.surface==='widget'){nativeCommand('open-main',{action:'add-subtask',id:task.id});return;}selected=task.id;view='all';render();$('#subtask-form input')?.focus();return;}
  if(key==='pin'){mutate(()=>toggleTaskPin(task),task.top?'已取消置顶':'任务已置顶');return;}
  if(key==='complete'){mutate(()=>toggleDone(task),task.done?'任务已重新打开':'任务已完成');return;}
  if(key==='start'){mutate(()=>startTask(task),'已记录首次开始日期');return;}
  if(key==='toggle-subtask'){mutate(()=>{const sub=task.subtasks.find(s=>s.id===entity.subId&&!s.deletedAt);if(!sub)throw new Error('子任务已更新');sub.done=!sub.done;if(task.done&&!sub.done)toggleDone(task);task.events.push({id:uid(),type:'subtask',done:sub.done,date:TODAY,at:new Date().toISOString(),reason:(sub.done?'完成：':'重新打开：')+sub.title});},'子任务已更新');return;}
  if(key==='delete-subtask'){mutate(()=>deleteSubtask(task,entity.subId),'子任务已移入回收站，可在侧栏恢复');return;}
  if(key==='delete-task'){mutate(()=>deleteTask(task),'任务已移入回收站，可在侧栏恢复');return;}
  if(key==='stop-repeat'){const series=recurrences.find(s=>s.id===task.repeatId);if(series?.active)mutate(()=>{stopSeries(series,tasks);task.events.push({id:uid(),type:'repeat_stop',date:TODAY,at:new Date().toISOString(),reason:'停止后续重复，保留已产生的任务和足迹'});},'已停止后续重复');}
}
function subtaskDates(sub){return sub.planStart&&sub.plan?`<small class="subtask-dates">${esc(shortDate(sub.planStart))} → ${esc(shortDate(sub.plan))}</small>`:'';}
function openSubtaskEdit(taskId,subId,draft=''){
  if(native?.surface==='widget'){nativeCommand('open-main',{action:'edit-subtask',id:taskId,subId});return;}
  const task=tasks.find(t=>t.id===taskId&&!t.deletedAt),sub=task?.subtasks.find(s=>s.id===subId&&!s.deletedAt);
  if(!task||(subId&&!sub)){toast('子任务已更新');return;}
  subtaskEdit={taskId,subId};const form=$('#subtask-edit-form');form.reset();form.elements.title.value=sub?.title||draft;
  $('#subtask-parent-title').textContent=task.title;$('#subtask-dialog-title').textContent=sub?'编辑子任务':'添加子任务';
  form.querySelector('[type="submit"]').textContent=sub?'保存子任务':'添加子任务';form.querySelector('[data-action="delete-edit-subtask"]').hidden=!sub;
  const bounded=validDate(task.planStart)&&validDate(task.plan);
  $('#subtask-plan-hint').innerHTML=bounded?`主任务计划范围<span>开始：${esc(dateText(task.planStart))}</span><span>截止：${esc(dateText(task.plan))}</span>`:'主任务未设置完整计划起止。请先调整主任务计划，再安排子任务日期；也可添加不设日期的子任务。';
  for(const [name,value] of [['startDate',sub?.planStart],['date',sub?.plan]]){const input=form.elements[name];input.value=value||'';input.min=bounded?task.planStart:'';input.max=bounded?task.plan:'';input.disabled=!bounded;}
  openDialog('#subtask-edit-dialog');
}
function openDeleteProject(name){
  deleteProjectName=name;const form=$('#delete-project-form');form.reset();$('#delete-project-title').textContent=name+' · '+tasks.filter(t=>t.project===name&&!t.deletedAt&&!t.cancelled).length+' 项任务';
  const choices=shownProjects().filter(n=>n!==name);form.elements.target.innerHTML=choices.map(n=>'<option value="'+esc(n)+'">'+esc(n)+'</option>').join('')||'<option value="">自动创建“未分区”</option>';
  updateDeleteProjectHint();openDialog('#delete-project-dialog');
}
function updateDeleteProjectHint(){const trash=$('#delete-project-form').elements.mode.value==='trash';$('#delete-project-target').hidden=trash;$('#delete-project-hint').textContent=trash?'分区和任务将进入回收站，其中的周期停止重复。恢复分区可找回随之删除的任务，周期保持停止。':'任务、子任务和周期将移入所选分区，日期与足迹保留；原分区可从回收站恢复。';}
function renderTrash(){
  const term=trashQuery.trim().toLocaleLowerCase(),matches=value=>!term||value.toLocaleLowerCase().includes(term),rows=[];
  const sections=prefs.projectTrash.filter(item=>matches(item.name));
  const deleted=tasks.filter(t=>t.deletedAt&&matches(t.title+' '+t.project+' '+t.subtasks.map(s=>s.title).join(' ')));
  const children=tasks.filter(t=>!t.deletedAt).flatMap(task=>task.subtasks.filter(sub=>sub.deletedAt&&matches(sub.title+' '+task.title)).map(sub=>({task,sub})));
  const totals={projects:prefs.projectTrash.length,tasks:tasks.filter(t=>t.deletedAt).length,subtasks:tasks.filter(t=>!t.deletedAt).reduce((n,t)=>n+t.subtasks.filter(s=>s.deletedAt).length,0)};
  $('#trash-summary').textContent=totals.projects+' 个分区 · '+totals.tasks+' 个任务 · '+totals.subtasks+' 个子任务';$('#trash-empty').disabled=!Object.values(totals).some(Boolean);
  const button=(kind,id,subId='')=>'<div class="trash-actions"><button class="button secondary" data-restore="'+kind+'" data-restore-id="'+esc(id)+'" data-restore-sub="'+esc(subId)+'">恢复</button><button class="button secondary danger" data-purge="'+kind+'" data-purge-id="'+esc(id)+'" data-purge-sub="'+esc(subId)+'">彻底删除</button></div>';
  const row=(title,detail,action)=>'<div class="trash-row"><div><b>'+esc(title)+'</b><small>'+esc(detail)+'</small></div>'+action+'</div>';
  if(sections.length)rows.push('<h3>分区 · '+sections.length+'</h3>'+sections.slice(0,100).map(item=>row(item.name,item.targetPurged?'原任务所在分区已彻底删除；恢复后分区为空':item.mode==='move'?'原有任务已移入 '+item.target+'，恢复后分区为空':'恢复分区及随之删除的任务；周期保持停止',button('project',item.name))).join(''));
  if(deleted.length)rows.push('<h3>任务 · '+deleted.length+'</h3>'+deleted.slice(0,100).map(task=>row(task.title,task.project+' · '+dateText(task.deletedAt.slice(0,10)),button('task',task.id))).join(''));
  if(children.length)rows.push('<h3>子任务 · '+children.length+'</h3>'+children.slice(0,100).map(({task,sub})=>row(sub.title,task.title,task.deletedAt?'<small>先恢复所属任务</small>':button('subtask',task.id,sub.id))).join(''));
  $('#trash-list').innerHTML=rows.join('')||'<div class="empty-state">'+svg('trash')+(term?'没有匹配的已删除内容':'回收站是空的')+'</div>';
  if(Math.max(sections.length,deleted.length,children.length)>100)$('#trash-list').insertAdjacentHTML('beforeend','<p class="form-hint">每组显示前 100 项，可搜索名称查找其他记录。</p>');
}
function openPurge(request){
  try{
    const {counts}=purgeTrash(dataState(),request);if(!Object.values(counts).some(Boolean)){toast('回收站是空的');return;}
    const task=tasks.find(t=>t.id===request.id),name=request.kind==='project'?request.id:request.kind==='subtask'?task.subtasks.find(s=>s.id===request.subId).title:task?.title;
    pendingPurge={request,version:dataVersion};$('#purge-title').textContent=request.kind==='all'?'清空回收站？':'彻底删除'+(request.kind==='project'?'分区':request.kind==='subtask'?'子任务':'任务')+'？';
    const summary=[counts.projects&&counts.projects+' 个分区',counts.tasks&&counts.tasks+' 个任务（含子任务与足迹）',counts.subtasks&&counts.subtasks+' 个已删除的子任务'].filter(Boolean).join('、');
    $('#purge-description').textContent=(request.kind==='all'?'将清空整个回收站，不受当前搜索条件限制。':'将彻底删除“'+name+'”。')+'本次移除 '+summary+'。正常任务会保留。';
    $('#purge-confirm').textContent=request.kind==='all'?'确认清空':'彻底删除';openDialog('#purge-dialog');$('#purge-form [autofocus]').focus();
  }catch(error){toast(error.message);}
}
function executePurge(event){
  event.preventDefault();if(!pendingPurge)return;
  const button=$('#purge-confirm');button.disabled=true;
  try{
    if(native){const result=native.purge(pendingPurge.request,pendingPurge.version);if(!result.ok){if(result.snapshot)applySnapshot(result.snapshot);throw new Error(result.error);}applySnapshot(result.snapshot);}
    else{
      const old=dataState(),next=purgeTrash(old,pendingPurge.request).snapshot;
      tasks=next.tasks;projects=next.projects;recurrences=next.recurrences;prefs=next.preferences;setProjectColors(prefs.projectColors);
      if(!save()){tasks=old.tasks;projects=old.projects;recurrences=old.recurrences;prefs=old.preferences;setProjectColors(prefs.projectColors);throw new Error(saveError);}
      if(!tasks.some(t=>t.id===selected))selected=tasks.find(t=>!t.deletedAt&&!t.cancelled)?.id||null;
      render();
    }
    $('#purge-dialog').close();renderTrash();reportRenderer();$('#trash-search').focus();toast('已彻底删除所选内容');
  }catch(error){$('#purge-form .form-error').textContent=error.message;}finally{button.disabled=false;}
}
function openTrash(){if(native?.surface==='widget'){nativeCommand('open-main',{action:'trash'});return;}$('dialog[open]')?.close();trashQuery='';$('#trash-search').value='';renderTrash();openDialog('#trash-dialog');}
function initializeActions(){
  document.addEventListener('input',event=>{
    if(event.target.name!=='startDate'||!['new-form','reschedule-form'].includes(event.target.form?.id))return;
    const form=event.target.form,start=event.target.value,end=form.elements.date;
    if(start&&end.value&&start>end.value){end.value=start;syncDatePickers();toast('完成日期已跟随开始日期调整');}
  },true);
  contextMenu=mountContextMenu({resolve:resolveContext,items:contextItems,onCommand:contextCommand,icon:svg});
  document.addEventListener('dblclick',event=>{const row=event.target.closest('[data-subtask-row]');if(row&&!event.target.closest('button'))openSubtaskEdit(row.dataset.task,row.dataset.subtaskRow);});
  $('#subtask-edit-form').addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget;try{const task=tasks.find(t=>t.id===subtaskEdit.taskId);const dates={planStart:form.elements.startDate.value||null,plan:form.elements.date.value||null};if(subtaskEdit.subId)editSubtask(task,subtaskEdit.subId,form.elements.title.value,dates);else addSubtask(task,form.elements.title.value,dates.planStart,dates.plan);if(!save()){form.querySelector('.form-error').textContent=saveError;return;}render();$('#subtask-edit-dialog').close();toast('子任务已保存');}catch(error){form.querySelector('.form-error').textContent=error.message;}});
  $('#delete-project-form').addEventListener('change',updateDeleteProjectHint);
  $('#delete-project-form').addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget;try{deleteProject(dataState(),deleteProjectName,{mode:form.elements.mode.value,target:form.elements.target.value||null});if(!save()){form.querySelector('.form-error').textContent=saveError;return;}if(view==='project:'+deleteProjectName)view='all';if(tasks.find(t=>t.id===selected)?.deletedAt)selected=tasks.find(t=>!t.deletedAt&&!t.cancelled)?.id||null;render();$('#delete-project-dialog').close();toast('分区已移入回收站');}catch(error){form.querySelector('.form-error').textContent=error.message;}});
  $('#trash-search').addEventListener('input',event=>{trashQuery=event.target.value;renderTrash();});
  $('#trash-empty').addEventListener('click',()=>openPurge({kind:'all'}));
  $('#trash-list').addEventListener('click',event=>{const button=event.target.closest('[data-purge]');if(button)openPurge({kind:button.dataset.purge,id:button.dataset.purgeId,subId:button.dataset.purgeSub});});
  $('#purge-form').addEventListener('submit',executePurge);$('#purge-dialog').addEventListener('close',()=>pendingPurge=null);
  $('#trash-list').addEventListener('click',event=>{const button=event.target.closest('[data-restore]');if(!button)return;mutate(()=>{const kind=button.dataset.restore,id=button.dataset.restoreId;if(kind==='project')restoreProject(dataState(),id);else if(kind==='task')restoreTask(dataState(),id);else restoreSubtask(tasks.find(t=>t.id===id),button.dataset.restoreSub);},'已恢复，日期和足迹保留');renderTrash();});
}
