import {Solar,Lunar,LunarMonth,LunarYear} from './vendor/lunar.mjs';
const cache=new Map();
export function lunarDate(date){
  if(!date)return null;
  if(cache.has(date))return cache.get(date);
  const [y,m,d]=date.split('-').map(Number),value=Solar.fromYmd(y,m,d).getLunar();
  const result={year:value.getYear(),month:value.getMonth(),day:value.getDay(),monthText:value.getMonthInChinese()+'月',dayText:value.getDayInChinese()};
  result.text=result.monthText+result.dayText;
  if(cache.size>10000)cache.clear();cache.set(date,result);return result;
}
export const lunarText=date=>date?'农历 '+lunarDate(date).text:'';
export const lunarDay=date=>{const d=lunarDate(date);return d.day===1?d.monthText:d.dayText;};
export function lunarOccurrences(series,from,to){
  const r=series.rule,anchor=lunarDate(series.start),first=lunarDate(from),last=lunarDate(to),out=[];
  const emit=(year,month)=>{
    const value=LunarMonth.fromYm(year,month);if(!value)return;
    const date=Lunar.fromYmd(year,month,Math.min(r.lunar.day,value.getDayCount())).getSolar().toYmd();
    if(date>=from&&date<=to&&date>=series.start)out.push(date);
  };
  if(r.unit==='year'){
    for(let year=Math.max(anchor.year,first.year);year<=last.year;year++){
      if((year-anchor.year)%r.interval)continue;
      if(r.lunar.leap!=='leap')emit(year,r.lunar.month);
      if(r.lunar.leap!=='regular')emit(year,-r.lunar.month);
    }
  }else{
    let value=LunarMonth.fromYm(r.interval===1?first.year:anchor.year,r.interval===1?first.month:anchor.month),i=0;
    while(value.getYear()<=last.year){
      if(i%r.interval===0&&(value.getMonth()>0||r.lunar.leap==='both'))emit(value.getYear(),value.getMonth());
      value=value.next(1);i++;
    }
  }
  return [...new Set(out)].sort();
}
export {Lunar,LunarMonth,LunarYear};
