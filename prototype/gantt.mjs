import {visibleSubtasks} from './lifecycle.mjs';
import {sortedTasks} from './preferences.mjs';
import {lunarText,lunarDay} from './lunar.mjs';
import {TODAY,validDate,addDays,dayDiff} from './domain.mjs';
import {projectColor} from './projects.mjs';
import {calendarTaskRange} from './calendar.mjs';
import {recurrenceLabel} from './recurrence.mjs';

export const ganttTaskRange=calendarTaskRange;
const rangeOf=ranges=>ranges.length?{start:ranges.map(r=>r.start).sort()[0],end:ranges.map(r=>r.end).sort().at(-1)}:null;
export function ganttRows(tasks){
  const rows=[],series=new Map();
  for(const task of tasks){
    if(task.repeatId){
      let row=series.get(task.repeatId);
      if(!row){row={repeatId:task.repeatId,tasks:[]};series.set(task.repeatId,row);rows.push(row);}
      row.tasks.push(task);
    }else rows.push({repeatId:null,tasks:[task]});
  }
  return rows.map(row=>({...row,range:rangeOf(row.tasks.map(t=>ganttTaskRange(t)).filter(Boolean))}));
}

export function ganttPeriod(anchor=TODAY,scale='month'){
  if(!validDate(anchor)||!['week','month'].includes(scale))throw new Error('甘特图区间无效');
  const value=new Date(anchor+'T00:00:00Z');
  const start=scale==='week'?addDays(anchor,-((value.getUTCDay()+6)%7)):anchor.slice(0,7)+'-01';
  const end=scale==='week'?addDays(start,6):new Date(Date.UTC(value.getUTCFullYear(),value.getUTCMonth()+1,0)).toISOString().slice(0,10);
  const count=dayDiff(start,end)+1;
  return {start,end,count,days:Array.from({length:count},(_,i)=>{const date=addDays(start,i),weekday=new Date(date+'T00:00:00Z').getUTCDay();return {date,number:Number(date.slice(8)),weekday,weekend:weekday===0||weekday===6};})};
}
export function ganttSegment(range,period){
  if(!range||range.start>period.end||range.end<period.start)return null;
  const start=range.start<period.start?period.start:range.start,end=range.end>period.end?period.end:range.end;
  return {left:dayDiff(period.start,start)/period.count*100,width:(dayDiff(start,end)+1)/period.count*100,days:dayDiff(range.start,range.end)+1,clippedStart:start!==range.start,clippedEnd:end!==range.end};
}
export function ganttGroups(tasks,projects,{term='',project='',status='all',order=[]}={}){
  const query=term.trim().toLocaleLowerCase();
  const filtered=tasks.filter(t=>!t.cancelled&&!t.deletedAt&&(!project||t.project===project)&&(!query||`${t.title} ${t.note} ${t.project}`.toLocaleLowerCase().includes(query))&&(status==='all'||status==='open'&&!t.done||status==='active'&&!t.done&&!!t.started||status==='done'&&t.done));
  return [...new Set([...projects,...filtered.map(t=>t.project)])].map(name=>{
    const members=sortedTasks(filtered.filter(t=>t.project===name).sort((a,b)=>Number(a.done)-Number(b.done)||(ganttTaskRange(a)?.start||'9999').localeCompare(ganttTaskRange(b)?.start||'9999')),order);
    const ranges=members.map(t=>ganttTaskRange(t)).filter(Boolean);
    return {name,tasks:members,rows:ganttRows(members),range:rangeOf(ranges),summaryRange:rangeOf(members.filter(t=>!t.repeatId).map(t=>ganttTaskRange(t)).filter(Boolean))};
  }).filter(group=>group.tasks.length);
}

export function mountGantt({root,getTasks,getProjects,getSelected,icon,escape:esc,onSelect,onNew,onReschedule,onToggle,onPin=()=>{},getOrder=()=>[],getSeries=()=>[],onRange=()=>{}}){
  let anchor=TODAY,scale='month',term='',project='',status='all';
  const collapsed=new Set();let firstRender=true;
  const fmt=date=>date?`${Number(date.slice(5,7))}/${Number(date.slice(8))} · ${lunarText(date)}`:'未安排';
  function bar(range,title,color,task=null){
    const period=ganttPeriod(anchor,scale),segment=ganttSegment(range,period);if(!segment)return '';
    if(!task)return `<span class="gantt-summary" style="left:${segment.left}%;width:${segment.width}%;--gantt-color:${color}"></span>`;
    const progress=task.done?100:visibleSubtasks(task).length?Math.round(visibleSubtasks(task).filter(s=>s.done).length/visibleSubtasks(task).length*100):0;
    return `<button class="gantt-bar ${task.done?'is-done':''} ${getSelected()===task.id?'is-selected':''} ${segment.clippedStart?'clipped-start':''} ${segment.clippedEnd?'clipped-end':''}" data-gantt="select" data-task="${esc(task.id)}" style="left:${segment.left}%;width:${segment.width}%;--gantt-color:${color}" title="${esc(title)} · ${range.start} · ${lunarText(range.start)} 至 ${range.end} · ${lunarText(range.end)} · ${segment.days} 天${task.started?' · 首次实际开始 '+task.started+' · '+lunarText(task.started):''}" aria-label="查看甘特任务：${esc(title)}"><span class="gantt-bar-fill" style="width:${progress}%"></span><span class="gantt-bar-title">${segment.clippedStart?'‹ ':''}${esc(title)}</span><small>${segment.days} 天${segment.clippedEnd?' ›':''}</small></button>`;
  }
  function point(task,color,period){
    const date=ganttTaskRange(task)?.start;if(!date||date<period.start||date>period.end)return '';
    const position=(dayDiff(period.start,date)+.5)/period.count*100;
    return `<button class="gantt-point ${task.done?'is-done':''} ${getSelected()===task.id?'is-selected':''}" data-gantt="select" data-task="${esc(task.id)}" style="left:${position}%;--gantt-color:${color}" title="${esc(task.title)} · 本期 ${fmt(date)} · ${task.done?'已完成':task.started?'进行中':'未完成'} · 计划 ${fmt(task.planStart)} → ${fmt(task.plan)}" aria-label="查看周期期次：${esc(task.title)} · ${date}"><span>${task.done?icon('check'):''}</span></button>`;
  }
  function seriesRow(row,color,period){
    const dated=row.tasks.filter(t=>ganttTaskRange(t)).sort((a,b)=>ganttTaskRange(a).start.localeCompare(ganttTaskRange(b).start)||a.id.localeCompare(b.id));
    const visible=dated.filter(t=>{const date=ganttTaskRange(t).start;return date>=period.start&&date<=period.end;});
    const task=row.tasks.find(t=>t.id===getSelected())||visible[0]||dated.find(t=>ganttTaskRange(t).start>=period.start)||dated.at(-1)||row.tasks[0];
    const series=getSeries().find(s=>s.id===row.repeatId),title=series?.title||task.title;
    const label=series?recurrenceLabel(series):'重复任务';
    return `<div class="gantt-row gantt-series-row ${row.tasks.some(t=>t.id===getSelected())?'gantt-selected':''}" data-repeat="${esc(row.repeatId)}"><div class="gantt-label gantt-task-label"><span class="gantt-repeat-icon" aria-hidden="true">${icon('history')}</span><button class="gantt-task-name" data-gantt="select" data-task="${esc(task.id)}" title="查看本期：${esc(task.title)} · ${fmt(ganttTaskRange(task)?.start)}"><b>${esc(title)}</b><small>${esc(label)} · 本视图 ${visible.length} 期</small></button></div><div class="gantt-track">${visible.map(t=>point(t,color,period)).join('')||`<button class="gantt-offscreen" data-gantt="locate" data-task="${esc(task.id)}">定位周期日期</button>`}</div></div>`;
  }
  function taskRow(task,color,period){
    const range=ganttTaskRange(task),segment=ganttSegment(range,period);
    return `<div tabindex="0" data-reorder-kind="task" data-reorder-id="${esc(task.id)}" data-top="${!!task.top}" data-done="${!!task.done}" class="gantt-row ${getSelected()===task.id?'gantt-selected':''}"><div class="gantt-label gantt-task-label"><button class="check-button ${task.done?'done':''}" data-gantt="complete" data-task="${esc(task.id)}" aria-label="${task.done?'重新打开':'完成'}甘特任务：${esc(task.title)}" aria-pressed="${task.done}">${task.done?icon('check'):''}</button><button class="gantt-task-name" data-gantt="select" data-task="${esc(task.id)}" title="${esc(task.title)}"><b>${esc(task.title)}</b><small>${range?fmt(range.start)+' — '+fmt(range.end):'尚未排期'}${visibleSubtasks(task).length?' · '+visibleSubtasks(task).filter(s=>s.done).length+'/'+visibleSubtasks(task).length+' 子任务':''}</small></button><button class="task-pin ${task.top?'is-task-pinned':''}" data-gantt="pin" data-task="${esc(task.id)}" aria-label="${task.top?'取消置顶':'置顶任务'}：${esc(task.title)}" aria-pressed="${!!task.top}">${icon('pin')}</button>${!task.done?`<button class="icon-button gantt-schedule" data-gantt="schedule" data-task="${esc(task.id)}" title="调整排期" aria-label="调整甘特排期：${esc(task.title)}">${icon('calendar')}</button>`:''}</div><div class="gantt-track">${segment?bar(range,task.title,color,task):range?`<button class="gantt-offscreen" data-gantt="locate" data-task="${esc(task.id)}">${range.end<period.start?'‹':'›'} 定位排期</button>`:`<button class="gantt-unscheduled" data-gantt="schedule" data-task="${esc(task.id)}">${icon('plus')}设置排期</button>`}</div></div>`;
  }
  function rows(){
    onRange(ganttPeriod(anchor,scale).end);
    const groups=ganttGroups(getTasks(),getProjects(),{term,project,status,order:getOrder()}),period=ganttPeriod(anchor,scale);
    const count=groups.reduce((n,g)=>n+g.tasks.length,0),rowCount=groups.reduce((n,g)=>n+g.rows.length,0),unscheduled=groups.flatMap(g=>g.tasks).filter(t=>!ganttTaskRange(t)).length;
    root.dataset.ganttTasks=String(count);root.dataset.ganttRows=String(rowCount);
    root.querySelector('#gantt-count').textContent=`${rowCount} 行 · ${count} 项任务 / 期次 · ${unscheduled} 项未排期`;
    root.querySelector('#gantt-rows').innerHTML=groups.map(group=>{
      const color=projectColor(group.name),closed=collapsed.has(group.name);
      return `<div class="gantt-row gantt-group"><div class="gantt-label"><button data-gantt="group" data-group="${esc(group.name)}" aria-expanded="${!closed}" aria-label="${closed?'展开':'收起'}分区：${esc(group.name)}"><span class="gantt-chevron">${closed?'›':'⌄'}</span><i class="project-dot" style="background:${color}"></i><b>${esc(group.name)}</b><small title="${group.tasks.length} 项任务 / 期次">${group.rows.length} 行</small></button></div><div class="gantt-track">${bar(group.summaryRange,group.name,color)}</div></div>${closed?'':group.rows.map(row=>row.repeatId?seriesRow(row,color,period):taskRow(row.tasks[0],color,period)).join('')}`;
    }).join('')||`<div class="gantt-empty">${icon('layers')}<b>${term||project||status!=='all'?'没有匹配的任务':'用时间，串起每一步。'}</b><p>${term||project||status!=='all'?'试试其他关键词或筛选条件。':'新建一个任务，开始安排你的分区。'}</p><button class="button secondary" data-gantt="new">新建待办</button></div>`;
  }
  function render({center=false}={}){
    center ||= firstRender;firstRender=false;
    const old=root.querySelector('.gantt-scroll'),left=old?.scrollLeft||0,top=old?.scrollTop||0;
    const period=ganttPeriod(anchor,scale),dayWidth=scale==='month'?36:100;
    const weekendStops=period.days.filter(d=>d.weekend).map(d=>{const i=dayDiff(period.start,d.date);return `linear-gradient(to right,transparent ${i/period.count*100}%,var(--gantt-weekend) ${i/period.count*100}%,var(--gantt-weekend) ${(i+1)/period.count*100}%,transparent ${(i+1)/period.count*100}%)`;}).join(',');
    const today=TODAY>=period.start&&TODAY<=period.end,position=(dayDiff(period.start,TODAY)+.5)/period.count*100;
    root.innerHTML=`<div class="calendar-topline"><span>我的空间 <i>/</i> 甘特图</span><span class="calendar-view-label">PROJECT TIMELINE</span></div><div class="gantt-heading"><div><h1>甘特图</h1><p>从开始到完成，看清每一步。</p></div><button class="button primary" data-gantt="new">${icon('plus')}新建待办</button></div><div class="gantt-toolbar"><label class="gantt-search">${icon('search')}<input id="gantt-search" type="search" aria-label="搜索甘特任务" placeholder="搜索任务" value="${esc(term)}"></label><select aria-label="甘特图分区筛选" id="gantt-project"><option value="">全部分区</option>${getProjects().map(name=>`<option value="${esc(name)}" ${name===project?'selected':''}>${esc(name)}</option>`).join('')}</select><select aria-label="甘特图状态筛选" id="gantt-status">${[['all','全部状态'],['open','未完成'],['active','进行中'],['done','已完成']].map(([key,label])=>`<option value="${key}" ${status===key?'selected':''}>${label}</option>`).join('')}</select><div class="gantt-scale" role="group" aria-label="甘特图时间尺度"><button data-gantt="scale" data-scale="week" aria-pressed="${scale==='week'}">周</button><button data-gantt="scale" data-scale="month" aria-pressed="${scale==='month'}">月</button></div></div><div class="gantt-period"><strong>${scale==='month'?anchor.slice(0,4)+' 年 '+Number(anchor.slice(5,7))+' 月':period.start.slice(0,4)+' 年 '+fmt(period.start)+' — '+fmt(period.end)}</strong><div><button class="calendar-back-today" data-gantt="today">今天</button><button class="icon-button" data-gantt="prev" aria-label="甘特图上一${scale==='week'?'周':'月'}">‹</button><button class="icon-button" data-gantt="next" aria-label="甘特图下一${scale==='week'?'周':'月'}">›</button></div></div><div class="gantt-scroll" tabindex="0" aria-label="甘特时间轴，可横向滚动"><div class="gantt-table ${today?'has-today':''}" style="width:calc(var(--gantt-label) + ${period.count*dayWidth}px);--gantt-days:${period.count};--gantt-today:${position}%;--gantt-weekends:${weekendStops||'none'}"><div class="gantt-row gantt-head"><div class="gantt-label">任务 / 分区 <span>排期</span></div><div class="gantt-dates">${period.days.map(day=>`<button class="${day.weekend?'weekend':''} ${day.date===TODAY?'today':''}" data-gantt="date" data-day="${day.date}" aria-label="在甘特图 ${day.date} 添加待办"><small>${['日','一','二','三','四','五','六'][day.weekday]}</small><b>${day.number}</b><small class="gantt-lunar">${lunarDay(day.date)}</small></button>`).join('')}</div></div><div id="gantt-rows"></div></div></div><div class="gantt-footer"><span id="gantt-count"></span><span><i></i>今天<span class="gantt-footer-note">普通任务显示时间条 · 重复任务一行日期点，点击查看本期</span></span></div>`;
    rows();const scroll=root.querySelector('.gantt-scroll');scroll.scrollTop=top;
    scroll.scrollLeft=center?(today?Math.max(0,dayDiff(period.start,TODAY)*dayWidth-(scroll.clientWidth-250)/2):0):left;
  }
  root.addEventListener('input',event=>{if(event.target.id==='gantt-search'){term=event.target.value;rows();}});
  root.addEventListener('change',event=>{if(event.target.id==='gantt-project')project=event.target.value;else if(event.target.id==='gantt-status')status=event.target.value;else return;rows();});
  root.addEventListener('click',event=>{
    const button=event.target.closest('[data-gantt]');if(!button)return;event.stopPropagation();
    const task=getTasks().find(t=>t.id===button.dataset.task);
    switch(button.dataset.gantt){
      case 'select':if(task)onSelect(task);break;
      case 'pin':if(task)onPin(task);break;
      case 'complete':if(task)onToggle(task);break;
      case 'schedule':if(task)onReschedule(task);break;
      case 'new':onNew(null,project);break;
      case 'date':onNew(button.dataset.day,project);break;
      case 'group':collapsed.has(button.dataset.group)?collapsed.delete(button.dataset.group):collapsed.add(button.dataset.group);rows();break;
      case 'scale':scale=button.dataset.scale;render({center:true});break;
      case 'today':anchor=TODAY;render({center:true});break;
      case 'prev':case 'next':{const offset=button.dataset.gantt==='next'?1:-1;if(scale==='week')anchor=addDays(ganttPeriod(anchor,scale).start,offset*7);else{const date=new Date(anchor.slice(0,7)+'-01T00:00:00Z');date.setUTCMonth(date.getUTCMonth()+offset);anchor=date.toISOString().slice(0,10);}render({center:true});break;}
      case 'locate':if(task){anchor=ganttTaskRange(task).start;render({center:true});}break;
    }
  });
  return {render,reveal(task){anchor=ganttTaskRange(task)?.start||TODAY;term='';status='all';if(project&&project!==task.project)project='';},focusSearch(){root.querySelector('#gantt-search')?.focus();}};
}
