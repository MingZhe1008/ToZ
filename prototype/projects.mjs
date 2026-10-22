export const DEFAULT_PROJECTS = ['ToZ', '个人', '生活'];
const palette = ['#af52de','#ff9500','#ff2d55','#30b0c7','#007aff','#34a853','#bf5af2','#a2845e'];
export function projectName(value) {
  if(typeof value !== 'string' || !value.trim() || value.trim().length > 40 || /[\u0000-\u001f]/.test(value)) throw new Error('分区名称应为 1–40 个字符');
  return value.trim();
}
export function projectList(saved, tasks = []) {
  const values = saved ?? DEFAULT_PROJECTS;
  if(!Array.isArray(values) || values.length > 1000) throw new Error('分区列表无效，最多支持 1000 个分区');
  const names = [], seen = new Set();
  for(const value of values){const name=projectName(value),key=name.toLocaleLowerCase();if(seen.has(key))throw new Error('分区名称已存在');seen.add(key);names.push(name);}
  for(const task of tasks){const name=projectName(task.project),key=name.toLocaleLowerCase();if(!seen.has(key)){if(saved)throw new Error('任务所属分区不存在');seen.add(key);names.push(name);}}
  if(names.length>1000)throw new Error('分区数量超过上限');
  return names;
}
let customColors={};
export function setProjectColors(colors={}){customColors={...colors};}
export function projectColor(name) {
  if(Object.hasOwn(customColors,name))return customColors[name];
  const known=DEFAULT_PROJECTS.indexOf(name);
  if(known>=0)return palette[known];
  let hash=0;for(const char of name)hash=(hash*31+char.codePointAt(0))>>>0;
  return palette[hash%palette.length];
}
