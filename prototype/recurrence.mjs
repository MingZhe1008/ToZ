import {validDate,addDays,dayDiff,uid,TODAY} from './domain.mjs';

import {lunarOccurrences,lunarDate} from './lunar.mjs';

const weekday=date=>(new Date(date+'T00:00:00Z').getUTCDay()+6)%7;
const stamp=(year,month,day)=>`${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
const monthDay=(year,month,day)=>stamp(year,month,Math.min(day,new Date(Date.UTC(year,month,0)).getUTCDate()));
export function validateSeries(series){
  const ids=new Set();
  if(!Array.isArray(series)||series.length>1000)throw new Error('周期任务数量无效');
  for(const s of series){
    if(!s||typeof s.id!=='string'||!s.id||ids.has(s.id))throw new Error('周期任务 ID 无效');ids.add(s.id);
    if(typeof s.title!=='string'||!s.title.trim()||s.title.length>120||typeof s.note!=='string'||s.note.length>10000||typeof s.project!=='string')throw new Error('周期任务内容无效');
    if(!validDate(s.start)||!Number.isInteger(s.span)||s.span<0||s.span>3660||typeof s.active!=='boolean')throw new Error('周期任务日期无效');
    if(s.until!==null&&(!validDate(s.until)||s.until<s.start))throw new Error('周期结束日期不能早于开始日期');
    const r=s.rule;
    if(!r||!['day','week','month','year'].includes(r.unit)||!Number.isInteger(r.interval)||r.interval<1||r.interval>99)throw new Error('周期间隔应为 1–99');
    if(r.calendar!==undefined&&!['solar','lunar'].includes(r.calendar))throw new Error('历法无效');
    if(r.calendar==='lunar'){
      if(!['month','year'].includes(r.unit)||!r.lunar||!Number.isInteger(r.lunar.day)||r.lunar.day<1||r.lunar.day>30||!Number.isInteger(r.lunar.month)||r.lunar.month<1||r.lunar.month>12||!['regular','both','leap'].includes(r.lunar.leap)||r.unit==='month'&&r.lunar.leap==='leap'||r.monthEnd)throw new Error('农历周期规则无效');
      if(s.start<'1900-01-31'||s.start>'2100-12-31'||s.until&&s.until>'2100-12-31')throw new Error('农历周期支持 1900–2100 年');
    }
    if(r.monthEnd!==undefined&&(typeof r.monthEnd!=='boolean'||r.unit!=='month'))throw new Error('月末周期规则无效');
    if(r.unit==='week'&&(!Array.isArray(r.weekdays)||!r.weekdays.length||new Set(r.weekdays).size!==r.weekdays.length||r.weekdays.some(d=>!Number.isInteger(d)||d<0||d>6)))throw new Error('请选择每周执行的星期');
    if(s.excludedDates!==undefined&&(!Array.isArray(s.excludedDates)||new Set(s.excludedDates).size!==s.excludedDates.length||s.excludedDates.some(d=>!validDate(d)||!occurrenceDates(s,d,d).length)))throw new Error('周期已删除期次记录无效');
  }
  return series;
}
export function createSeries(task,rule,until=null){
  if(!task.planStart||!task.plan)throw new Error('周期任务需要计划开始和完成日期');
  const series={id:uid(),title:task.title,note:task.note,project:task.project,start:task.planStart,span:dayDiff(task.planStart,task.plan),rule:structuredClone(rule),until:until||null,active:true};
  validateSeries([series]);return series;
}
// Dates always use the original anchor, so month ends and leap days do not drift.
export function occurrenceDates(s,from,to){
  if(!validDate(from)||!validDate(to)||from>to)return [];
  const end=s.until&&s.until<to?s.until:to,start=s.start>from?s.start:from;
  if(start>end)return [];
  if(s.rule.calendar==='lunar')return lunarOccurrences(s,start,end<'2100-12-31'?end:'2100-12-31');
  const out=[],r=s.rule,[year,month,day]=s.start.split('-').map(Number);
  const emit=date=>{if(date>=start&&date<=end)out.push(date);if(out.length>50000)throw new Error('周期生成超过任务数量上限，请缩小日期范围');};
  if(r.unit==='day'){
    const first=Math.max(0,Math.ceil(dayDiff(s.start,start)/r.interval));
    for(let date=addDays(s.start,first*r.interval);date<=end;date=addDays(date,r.interval)){emit(date);if(date===end)break;}
  }else if(r.unit==='week'){
    const monday=addDays(s.start,-weekday(s.start)),step=r.interval*7;
    for(let date=addDays(monday,Math.max(0,Math.floor(dayDiff(monday,start)/step))*step);date<=end;date=addDays(date,step)){
      for(const d of [...r.weekdays].sort((a,b)=>a-b))emit(addDays(date,d));
      if(dayDiff(date,end)<step)break;
    }
  }else{
    const [fromYear,fromMonth]=start.split('-').map(Number);
    const distance=r.unit==='month'?(fromYear-year)*12+fromMonth-month:fromYear-year;
    for(let i=Math.max(0,Math.floor(distance/r.interval));;i++){
      const index=month-1+(r.unit==='month'?i*r.interval:0),y=year+(r.unit==='year'?i*r.interval:Math.floor(index/12));
      if(y>9999)break;
      const date=monthDay(y,index%12+1,r.monthEnd?31:day);if(date>end)break;emit(date);
    }
  }
  return out;
}
export function recurrenceLabel(s){
  const r=s.rule,n=r.interval,day=s.start.slice(8)*1;
  if(r.calendar==='lunar')return `农历${r.unit==='month'?'每月':'每年 '+['正','二','三','四','五','六','七','八','九','十','冬','腊'][r.lunar.month-1]+'月'}${['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'][r.lunar.day-1]} · ${r.lunar.leap==='both'?'含闰月':r.lunar.leap==='leap'?'仅闰月':'不含闰月'}`;
  if(r.unit==='day')return n===1?'每天':`每 ${n} 天`;
  if(r.unit==='week'){
    const days=[...r.weekdays].sort((a,b)=>a-b).join('');
    if(n===1&&days==='01234')return '每个工作日';
    if(n===1&&days==='56')return '每个周末';
    return `${n===1?'每周':`每 ${n} 周`} ${r.weekdays.map(d=>'一二三四五六日'[d]).join('、')}`;
  }
  if(r.unit==='month'&&r.monthEnd)return n===1?'每月最后一天':`每 ${n} 月最后一天`;
  if(r.unit==='month')return `${n===1?'每月':`每 ${n} 月`} ${day} 日`;
  return `${n===1?'每年':`每 ${n} 年`} ${Number(s.start.slice(5,7))} 月 ${day} 日`;
}
function nextAvailable(s,today,excluded){
  let from=addDays(today,1);if(s.start>from)from=s.start;
  let last=s.until||'9999-12-31';if(s.rule.calendar==='lunar'&&last>'2100-12-31')last='2100-12-31';
  while(from<=last){
    const limit=stamp(Math.min(9999,Number(from.slice(0,4))+s.rule.interval+2),12,31),end=limit<last?limit:last;
    const next=occurrenceDates(s,from,end).find(date=>!excluded.has(date));if(next)return next;
    if(end>=last)break;from=addDays(end,1);
  }
}
export function materializeSeries(series,tasks,through=addDays(TODAY,45),today=TODAY){
  validateSeries(series);
  const keys=new Set(tasks.filter(t=>t.repeatId).map(t=>`${t.repeatId}/${t.repeatDate}`)),added=[];
  for(const s of series.filter(s=>s.active)){
    const excluded=new Set(s.excludedDates||[]);
    let dates=occurrenceDates(s,s.start,through).filter(date=>!excluded.has(date));
    // Keep at least the next occurrence visible, including annual/custom cycles.
    if(!dates.some(d=>d>today)){
      const next=nextAvailable(s,today,excluded);
      if(next&&!dates.includes(next))dates.push(next);
    }
    for(const date of dates){
      const key=`${s.id}/${date}`;if(keys.has(key))continue;
      if(tasks.length+added.length>=50000)throw new Error('周期生成超过任务数量上限，请缩小日期范围');
      const due=addDays(date,s.span);if(!validDate(due))throw new Error('周期完成日期超出有效范围');
      added.push({id:`repeat:${s.id}:${date}`,title:s.title,note:s.note,project:s.project,planStart:date,plan:due,initialPlan:due,started:null,done:false,top:true,completedDate:null,subtasks:[],repeatId:s.id,repeatDate:date,events:[{id:uid(),type:'create',date:today,at:new Date().toISOString(),reason:`周期安排 · ${recurrenceLabel(s)}`} ]});keys.add(key);
    }
  }
  return added;
}
export function stopSeries(s,tasks,today=TODAY){
  s.active=false;
  for(const task of tasks.filter(t=>t.repeatId===s.id)){
    if(!task.cancelled&&!task.done&&!task.started&&task.repeatDate>today){task.cancelled=true;task.events.push({id:uid(),type:'cancel_repeat',date:today,at:new Date().toISOString(),reason:'停止周期后取消尚未开始的未来排期'});}
  }
}
