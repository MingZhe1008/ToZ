const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { isDeepStrictEqual } = require('node:util');
const {validateLifecycleTransition}=require('../prototype/lifecycle.mjs');
const {purgeTrash}=require('../prototype/trash.mjs');
const {preferences}=require('../prototype/preferences.mjs');
const {projectList}=require('../prototype/projects.mjs');
const {validatePlanRange,validateSubtaskPlan}=require('../prototype/domain.mjs');
const {validateSeries,occurrenceDates,materializeSeries}=require('../prototype/recurrence.mjs');
const {validDate:validRepeatDate,addDays}=require('../prototype/domain.mjs');

const DEFAULT_SETTINGS = { widgetVisible: true, widgetPinned: false, closeToTray: true, startMinimized: false, widgetCollapsed: false, opacity: 82 };
const dateValid = value => value === null || value === undefined || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value);
function validateSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.tasks) || snapshot.tasks.length > 50000) throw new Error('无效的任务数据');
  if (Buffer.byteLength(JSON.stringify(snapshot)) > 50 * 1024 * 1024) throw new Error('数据文件超过 50 MB');
  projectList(snapshot.projects,snapshot.tasks);
  const series=validateSeries(snapshot.recurrences||[]),seriesMap=new Map(series.map(s=>[s.id,s]));
  const registered=projectList(snapshot.projects,snapshot.tasks);
  if(series.some(s=>!registered.includes(s.project)))throw new Error('周期任务所属分区不存在');
  preferences(snapshot.preferences,registered,snapshot.tasks);
  const trashed=new Set((snapshot.preferences?.projectTrash||[]).map(i=>i.name));
  if(snapshot.tasks.some(t=>trashed.has(t.project)&&!t.deletedAt)||series.some(s=>trashed.has(s.project)&&s.active))throw new Error('已删除分区不能保留活动任务或周期');
  const occurrences=new Set();
  const ids = new Set(), eventIds = new Set();
  for (const task of snapshot.tasks) {
    if (typeof task.id !== 'string' || !task.id || ids.has(task.id)) throw new Error('任务 ID 重复或缺失');
    ids.add(task.id);
    if(task.deletedAt!=null&&(typeof task.deletedAt!=='string'||!Number.isFinite(Date.parse(task.deletedAt))))throw new Error('任务删除日期无效');
    if(task.deletedByProject!=null&&typeof task.deletedByProject!=='string')throw new Error('删除来源无效');
    if(task.top!==undefined&&typeof task.top!=='boolean')throw new Error('任务置顶状态无效');
    if(task.cancelled!==undefined&&typeof task.cancelled!=='boolean')throw new Error('取消状态无效');
    if(task.repeatId){
      const s=seriesMap.get(task.repeatId),key=task.repeatId+'/'+task.repeatDate;
      if(!s||!validRepeatDate(task.repeatDate)||!occurrenceDates(s,task.repeatDate,task.repeatDate).length||occurrences.has(key))throw new Error('周期任务归属、日期或重复实例无效');
      if(s.excludedDates?.includes(task.repeatDate))throw new Error('该周期期次已彻底删除，不能重新写入');
      occurrences.add(key);
    }else if(task.cancelled)throw new Error('只能取消周期任务的未来排期');
    if (typeof task.title !== 'string' || !task.title.trim() || task.title.length > 120) throw new Error('任务标题应为 1–120 个字符');
    if (typeof task.note !== 'string' || task.note.length > 10000) throw new Error('任务内容不合法');
    if (![task.planStart,task.plan, task.initialPlan, task.started, task.completedDate].every(dateValid)) throw new Error('任务日期无效');
    validatePlanRange(task.planStart,task.plan);
    if (typeof task.done !== 'boolean' || !Array.isArray(task.subtasks) || !Array.isArray(task.events)) throw new Error('任务结构无效');
    if (task.done && !task.completedDate) throw new Error('已完成任务缺少完成日期');
    if (task.done && task.subtasks.some(s => !s.deletedAt&&!s.done)) throw new Error('请先完成所有子任务');
    const subIds = new Set();
    for (const sub of task.subtasks) {
      if(sub.deletedAt!=null&&(typeof sub.deletedAt!=='string'||!Number.isFinite(Date.parse(sub.deletedAt))))throw new Error('子任务删除日期无效');
      if (!sub.id || subIds.has(sub.id) || typeof sub.title !== 'string' || !sub.title.trim() || sub.title.length > 120 || typeof sub.done !== 'boolean') throw new Error('子任务无效');
      subIds.add(sub.id);
      if(![sub.planStart,sub.plan].every(dateValid))throw new Error('子任务日期无效');
      validateSubtaskPlan(task,sub.planStart,sub.plan,{bounds:!sub.deletedAt});
    }
    for (const event of task.events) {
      if (!event.id || eventIds.has(event.id) || !dateValid(event.date) || !event.date || typeof event.type !== 'string' || !Number.isFinite(Date.parse(event.at))) throw new Error('任务历史无效');
      if (['later','earlier','schedule'].includes(event.type) && (!dateValid(event.from) || !event.to || !dateValid(event.to))) throw new Error('改期历史无效');
      if(event.type==='plan_start'&&(!dateValid(event.from)||!dateValid(event.to)))throw new Error('开始计划历史无效');
      if(event.type==='subtask_schedule'&&(!event.subId||![event.fromStart,event.from,event.toStart,event.to].every(dateValid)))throw new Error('子任务排期历史无效');
      eventIds.add(event.id);
    }
  }
  return snapshot;
}

class Store {
  constructor(directory) {
    fs.mkdirSync(directory, { recursive: true });
    this.directory = directory;
    this.filename = path.join(directory, 'toz.sqlite');
    this.db = new DatabaseSync(this.filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, started TEXT, initial_plan TEXT, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), data TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS lock_started BEFORE UPDATE OF started ON tasks WHEN OLD.started IS NOT NULL AND NEW.started IS NOT OLD.started BEGIN SELECT RAISE(ABORT,'首次开始日期不可修改'); END;
      CREATE TRIGGER IF NOT EXISTS lock_initial BEFORE UPDATE OF initial_plan ON tasks WHEN OLD.initial_plan IS NOT NULL AND NEW.initial_plan IS NOT OLD.initial_plan BEGIN SELECT RAISE(ABORT,'最初计划不可修改'); END;
      INSERT OR IGNORE INTO meta VALUES('version','0');
      INSERT OR IGNORE INTO meta VALUES('schema','1');`);
    const integrity = this.db.prepare('PRAGMA quick_check').get();
    if (Object.values(integrity)[0] !== 'ok') throw new Error('数据库完整性检查失败，请从备份恢复');
  }
  meta(key, fallback) { const row=this.db.prepare('SELECT value FROM meta WHERE key=?').get(key); return row ? JSON.parse(row.value) : fallback; }
  setMeta(key, value) { this.db.prepare('INSERT INTO meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value)); }
  snapshot() { const tasks=this.db.prepare('SELECT data FROM tasks ORDER BY rowid DESC').all().map(row=>JSON.parse(row.data));return { schema: 1, version: this.meta('version', 0), tasks, preferences:preferences(this.meta('preferences',{}),projectList(this.meta('projects',null),tasks),tasks), recurrences:this.meta('recurrences',[]), projects:projectList(this.meta('projects',null),tasks), opacity: this.meta('opacity',82), dark: this.meta('dark',true), settings:this.settings() }; }
  settings() { return { ...DEFAULT_SETTINGS, ...this.meta('settings', {}), opacity: this.meta('opacity', 82) }; }
  updateSettings(patch) {
    const current=this.settings();
    for(const [key,value] of Object.entries(patch)) {
      if (!(key in DEFAULT_SETTINGS)) throw new Error('未知设置');
      if(key==='opacity') { if(!Number.isInteger(value)||value<35||value>95)throw new Error('透明度范围为 35–95'); }
      else if(typeof value!=='boolean') throw new Error('设置值类型错误');
      current[key]=value;
    }
    this.db.exec('BEGIN IMMEDIATE');
    try { this.setMeta('settings',current);this.setMeta('opacity',current.opacity);this.setMeta('version',this.meta('version',0)+1);this.db.exec('COMMIT'); } catch(e){this.db.exec('ROLLBACK');throw e;}
    return current;
  }
  commit(input, expectedVersion) {
    const previousProjects=this.snapshot().projects,requestedProjects=projectList(input.projects,input.tasks);
    input={...input,projects:projectList([...requestedProjects,...previousProjects.filter(name=>!requestedProjects.includes(name)&&!Object.hasOwn(input.projectRenames||{},name))],input.tasks)};
    input={...input,preferences:input.preferences??this.meta('preferences',{}),recurrences:input.recurrences??this.meta('recurrences',[])};
    validateSnapshot(input);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const current=this.snapshot();
      if (expectedVersion !== current.version) throw new Error('另一窗口已更新数据，请刷新后重试');
      const renames=input.projectRenames||{};
      if(!renames||typeof renames!=='object'||Array.isArray(renames))throw new Error('分区更名无效');
      for(const [from,to] of Object.entries(renames)){
        if(!current.projects.includes(from)||!input.projects.includes(to)||input.projects.includes(from)||current.projects.includes(to)&&from!==to)throw new Error('分区更名冲突');
        for(const old of current.tasks.filter(t=>t.project===from)){
          const next=input.tasks.find(t=>t.id===old.id);
          if(next?.project!==to||!next.events.slice(old.events.length).some(e=>e.type==='project_rename'&&e.fromProject===from&&e.toProject===to))throw new Error('分区更名须同步任务并记录历史');
        }
      }
      if(current.projects.some(name=>!input.projects?.includes(name)&&!Object.hasOwn(renames,name)))throw new Error('不能直接删除已有分区');
      const transfers=validateLifecycleTransition(current,input);
      const nextSeries=new Map(input.recurrences.map(s=>[s.id,s]));
      for(const old of current.recurrences){
        const next=nextSeries.get(old.id);
        if(!next||!isDeepStrictEqual({...old,project:Object.hasOwn(renames,old.project)?renames[old.project]:Object.hasOwn(transfers,old.project)?transfers[old.project]:old.project,active:true},{...next,active:true})||!old.active&&next.active)throw new Error('周期规则不可覆盖，已停止的周期不可重新启用');
      }
      const incoming=new Map(input.tasks.map(t=>[t.id,t]));
      for(const old of current.tasks) {
        const next=incoming.get(old.id);
        if(!next) throw new Error('不能直接删除任务与历史，请使用归档');
        if(old.repeatId!==next.repeatId||old.repeatDate!==next.repeatDate)throw new Error('周期实例归属与原始日期不可修改');
        if(old.cancelled&&!next.cancelled)throw new Error('已取消的周期排期不可恢复');
        if(!old.cancelled&&next.cancelled&&!next.events.slice(old.events.length).some(e=>e.type==='cancel_repeat'))throw new Error('取消周期排期必须保留历史');
        if(old.started && next.started!==old.started) throw new Error('首次开始日期不可修改');
        if(old.startedAt && next.startedAt!==old.startedAt) throw new Error('首次开始时间不可修改');
        if(old.startedTimezone && next.startedTimezone!==old.startedTimezone) throw new Error('首次开始时区不可修改');
        if(old.initialPlan && next.initialPlan!==old.initialPlan) throw new Error('最初计划日期不可修改');
        if(next.events.length<old.events.length || !old.events.every((event,index)=>isDeepStrictEqual(event,next.events[index]))) throw new Error('历史记录只允许追加，不能覆盖');
        if(old.plan!==next.plan && !next.events.slice(old.events.length).some(e=>['later','earlier','schedule'].includes(e.type)&&e.from===old.plan&&e.to===next.plan)) throw new Error('调整计划必须同时记录历史');
        if((old.planStart||null)!==(next.planStart||null)&&!next.events.slice(old.events.length).some(e=>e.type==='plan_start'&&e.from===(old.planStart||null)&&e.to===(next.planStart||null)))throw new Error('调整计划开始日期必须同时记录历史');
      }
      this.writeTasks(input.tasks);
      this.setMeta('projects',projectList(input.projects,input.tasks));
      this.setMeta('preferences',preferences(input.preferences,input.projects,input.tasks));
      this.setMeta('opacity',Math.max(35,Math.min(95,Number(input.opacity)||82)));
      this.setMeta('dark',typeof input.dark==='boolean'?input.dark:current.dark);
      this.setMeta('recurrences',input.recurrences);
      this.setMeta('version',current.version+1);
      this.db.exec('COMMIT');
      this.dailyBackup();
      return this.snapshot();
    } catch(error) { if(this.db.isTransaction) this.db.exec('ROLLBACK'); throw error; }
  }
  purge(request,expectedVersion){
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const current=this.snapshot();if(expectedVersion!==current.version)throw new Error('另一窗口已更新数据，请取消后重新确认删除范围');
      const {snapshot:next,counts}=purgeTrash(current,request);validateSnapshot(next);
      if(!Object.values(counts).some(Boolean)){this.db.exec('ROLLBACK');return {snapshot:current,counts};}
      const remaining=new Set(next.tasks.map(t=>t.id));
      const removeEvents=this.db.prepare('DELETE FROM events WHERE task_id=?'),removeTask=this.db.prepare('DELETE FROM tasks WHERE id=?');
      for(const task of current.tasks.filter(t=>!remaining.has(t.id))){removeEvents.run(task.id);removeTask.run(task.id);}
      this.writeTasks(next.tasks);this.setMeta('projects',next.projects);this.setMeta('preferences',next.preferences);this.setMeta('recurrences',next.recurrences);this.setMeta('version',current.version+1);this.db.exec('COMMIT');this.dailyBackup();return {snapshot:this.snapshot(),counts};
    }catch(error){if(this.db.isTransaction)this.db.exec('ROLLBACK');throw error;}
  }
  ensureRecurring(today=new Date().toLocaleDateString('sv-SE')){
    const snapshot=this.snapshot(),added=materializeSeries(snapshot.recurrences,snapshot.tasks,addDays(today,45),today);
    if(!added.length)return false;
    snapshot.tasks.unshift(...added);snapshot.preferences.taskOrder=[...added.map(t=>t.id),...snapshot.preferences.taskOrder];this.commit(snapshot,snapshot.version);return true;
  }
  writeTasks(tasks) {
    const upsert=this.db.prepare('INSERT INTO tasks(id,started,initial_plan,data) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET started=excluded.started,initial_plan=excluded.initial_plan,data=excluded.data');
    const eventInsert=this.db.prepare('INSERT OR IGNORE INTO events(id,task_id,data) VALUES(?,?,?)');
    for(const task of [...tasks].reverse()) { upsert.run(task.id,task.started||null,task.initialPlan||null,JSON.stringify(task));for(const event of task.events)eventInsert.run(event.id,task.id,JSON.stringify(event)); }
  }
  dailyBackup() {
    // JSON snapshots are generated after the transaction; they include all events and settings.
    try {
      const folder=path.join(this.directory,'backups');fs.mkdirSync(folder,{recursive:true});
      const today=new Date().toLocaleDateString('sv-SE');
      const name=path.join(folder,`ToZ-${today}.json`);
      const temporary=name+'.tmp';fs.writeFileSync(temporary,JSON.stringify({...this.snapshot(),settings:this.settings()},null,2));fs.renameSync(temporary,name);
      const files=fs.readdirSync(folder).filter(n=>/^ToZ-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().reverse();
      for(const file of files.slice(14))fs.unlinkSync(path.join(folder,file));
      this.backupError=null;
    } catch(error) { this.backupError=error.message; }
  }
  restore(snapshot) {
    if(snapshot.schema!==1)throw new Error('不支持此备份版本');
    validateSnapshot(snapshot);
    const safety=path.join(this.directory,`before-restore-${Date.now()}.json`);
    fs.writeFileSync(safety,JSON.stringify({...this.snapshot(),settings:this.settings()},null,2));
    this.db.exec('BEGIN IMMEDIATE');
    try { this.db.exec('DELETE FROM events; DELETE FROM tasks;');this.writeTasks(snapshot.tasks);this.setMeta('recurrences',snapshot.recurrences||[]);this.setMeta('preferences',preferences(snapshot.preferences,projectList(snapshot.projects,snapshot.tasks),snapshot.tasks));this.setMeta('projects',projectList(snapshot.projects,snapshot.tasks));this.setMeta('dark',snapshot.dark!==false);this.setMeta('opacity',Math.max(35,Math.min(95,Number(snapshot.opacity)||82)));this.setMeta('version',this.meta('version',0)+1);this.db.exec('COMMIT'); }catch(e){this.db.exec('ROLLBACK');throw e;}
    return this.snapshot();
  }
  close(){this.db.close();}
}
module.exports={Store,validateSnapshot,DEFAULT_SETTINGS};
