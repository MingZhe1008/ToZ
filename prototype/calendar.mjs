import {sortedTasks} from './preferences.mjs';
import { validDate, TODAY, addDays, taskDateRange } from './domain.mjs';

export function shiftMonth(month, offset) {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, number - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
}

export function monthDays(month) {
  const first = new Date(month + '-01T00:00:00Z');
  const offset = (first.getUTCDay() + 6) % 7;
  const next = new Date(shiftMonth(month, 1) + '-01T00:00:00Z');
  const count = Math.round((next - first) / 86400000);
  const cells = Math.ceil((offset + count) / 7) * 7;
  return Array.from({ length: cells }, (_, index) => {
    const date = new Date(first.getTime() + (index - offset) * 86400000).toISOString().slice(0, 10);
    return { date, day: Number(date.slice(8)), inMonth: date.startsWith(month) };
  });
}

// Limit expansion to the visible month, even for tasks spanning many years.
export function tasksByDate(tasks, term = '', {from,to,today=TODAY} = {}) {
  const days=monthDays(today.slice(0,7));
  from ||= days[0].date;to ||= days.at(-1).date;
  if(!validDate(from)||!validDate(to)||from>to)throw new Error('日历查询区间无效');
  const result = new Map(), query = term.trim().toLocaleLowerCase();
  for (const task of tasks) {
    const range=taskDateRange(task,today);if(!range)continue;
    if (query && !`${task.title} ${task.note || ''} ${task.project}`.toLocaleLowerCase().includes(query)) continue;
    const first=range.start>from?range.start:from,last=range.end<to?range.end:to;
    for(let date=first;date<=last;date=addDays(date,1)){
      if(!result.has(date))result.set(date,[]);
      result.get(date).push(task);
      if(date===last)break;
    }
  }
  for (const daily of result.values()) daily.sort((a, b) => Number(!!a.done) - Number(!!b.done));
  return result;
}

export function dayPreview(tasks, expanded = false) {
  return { visible: expanded ? tasks : tasks.slice(0, 5), hidden: expanded ? 0 : Math.max(0, tasks.length - 5) };
}

// Segments use one lane across a week, so a multi-day task is one continuous bar.
export function calendarWeeks(tasks,month,term='',order=[]){
  const days=monthDays(month),query=term.trim().toLocaleLowerCase();
  const sorted=sortedTasks(tasks,order).filter(t=>!t.cancelled&&(!query||`${t.title} ${t.note||''} ${t.project}`.toLocaleLowerCase().includes(query)));
  const result=[];
  for(let i=0;i<days.length;i+=7){
    const week=days.slice(i,i+7),lanes=[],segments=[];
    for(const task of sorted){
      const range=taskDateRange(task);if(!range||range.end<week[0].date||range.start>week[6].date)continue;
      const first=range.start<week[0].date?0:week.findIndex(d=>d.date===range.start),last=range.end>week[6].date?6:week.findIndex(d=>d.date===range.end);
      let lane=lanes.findIndex(cells=>cells.slice(first,last+1).every(value=>!value));
      if(lane<0){lane=lanes.length;lanes.push(Array(7).fill(false));}
      for(let cell=first;cell<=last;cell++)lanes[lane][cell]=true;
      segments.push({task,range,first,last,lane,continuesBefore:range.start<week[0].date,continuesAfter:range.end>week[6].date});
    }
    result.push({days:week,segments,laneCount:lanes.length,counts:week.map((_,i)=>segments.filter(s=>s.first<=i&&s.last>=i).length)});
  }
  return result;
}
