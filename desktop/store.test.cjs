const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {Store,validateSnapshot}=require('./store.cjs');
const {createSeries,materializeSeries,stopSeries}=require('../prototype/recurrence.mjs');
const {createTask}=require('../prototype/domain.mjs');

function fixture(){const id=crypto.randomUUID();return {id,title:'测试离线任务',project:'ToZ',note:'记录延期历史',plan:'2026-10-20',initialPlan:'2026-10-20',started:null,done:false,completedDate:null,subtasks:[],events:[{id:crypto.randomUUID(),type:'create',date:'2026-10-20',at:'2026-10-20T08:00:00Z'}]};}
function setup(t){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'toz-test-'));const store=new Store(directory);t.after(()=>{try{store.close();}catch{}if(path.dirname(directory)===os.tmpdir()&&path.basename(directory).startsWith('toz-test-'))fs.rmSync(directory,{recursive:true,force:true});});return store;}

test('补齐周期默认置顶并插入已有排序前，保留取消置顶与旧任务缺省选择，重启后保留',t=>{
  const store=setup(t),state=store.snapshot(),old=fixture();
  const series=createSeries(createTask('补齐置顶','2026-10-20','ToZ','','2026-10-20'),{unit:'day',interval:1},'2026-10-23');
  const [first]=materializeSeries([series],[],'2026-10-20');first.top=false;
  state.recurrences=[series];state.tasks=[old,first];state.preferences.taskOrder=[old.id,first.id];store.commit(state,0);
  store.ensureRecurring('2026-10-22');const saved=store.snapshot(),added=saved.tasks.filter(t=>t.id!==old.id&&t.id!==first.id);
  assert(added.length>0&&added.every(t=>t.top));
  assert.deepEqual(saved.preferences.taskOrder,[...added.map(t=>t.id),old.id,first.id]);
  assert.equal(saved.tasks.find(t=>t.id===first.id).top,false);assert.equal(saved.tasks.find(t=>t.id===old.id).top,undefined);
  const reopened=new Store(store.directory);assert.deepEqual(reopened.snapshot().preferences.taskOrder,saved.preferences.taskOrder);assert.equal(reopened.snapshot().tasks.find(t=>t.id===first.id).top,false);reopened.close();
});
test('彻底删除独立事务清除任务与 SQL 足迹，子任务清除保留父任务历史，重启生效',t=>{
  const {deleteTask,deleteSubtask}=require('../prototype/lifecycle.mjs'),store=setup(t),snapshot=store.snapshot(),gone=fixture(),keep=fixture();keep.subtasks=[{id:'child',title:'删除子项',done:false}];snapshot.tasks=[gone,keep];store.commit(snapshot,0);
  let next=store.snapshot();deleteTask(next.tasks.find(t=>t.id===gone.id));deleteSubtask(next.tasks.find(t=>t.id===keep.id),'child');store.commit(next,next.version);const before=store.snapshot();
  assert.throws(()=>store.purge({kind:'task',id:keep.id},before.version));assert.deepEqual(store.snapshot(),before);
  store.purge({kind:'task',id:gone.id},before.version);assert.equal(store.db.prepare('SELECT count(*) AS n FROM tasks WHERE id=?').get(gone.id).n,0);assert.equal(store.db.prepare('SELECT count(*) AS n FROM events WHERE task_id=?').get(gone.id).n,0);
  next=store.snapshot();const history=structuredClone(next.tasks[0].events);store.purge({kind:'subtask',id:keep.id,subId:'child'},next.version);const reopened=new Store(store.directory),saved=reopened.snapshot();reopened.close();assert.equal(saved.tasks.length,1);assert.equal(saved.tasks[0].subtasks.length,0);assert.deepEqual(saved.tasks[0].events.slice(0,-1),history);
  next=store.snapshot();next.tasks=[];next.preferences.taskOrder=[];assert.throws(()=>store.commit(next,next.version),/直接删除/);
});
test('永久删除周期期次保存排除日期，重启与备份恢复后不补回，常规写入不可解除排除',t=>{
  const {deleteTask}=require('../prototype/lifecycle.mjs'),store=setup(t),snapshot=store.snapshot(),series=createSeries(createTask('周期','2026-10-20','ToZ','','2026-10-20'),{unit:'day',interval:1},'2026-10-30');snapshot.recurrences=[series];snapshot.tasks=materializeSeries([series],[],'2026-10-23');store.commit(snapshot,0);
  let next=store.snapshot();const gone=structuredClone(next.tasks[0]);deleteTask(next.tasks[0]);store.commit(next,next.version);store.purge({kind:'task',id:gone.id},store.snapshot().version);
  const reopened=new Store(store.directory);reopened.ensureRecurring('2026-10-24');const saved=reopened.snapshot();reopened.close();assert(!saved.tasks.some(t=>t.id===gone.id));assert(saved.recurrences[0].excludedDates.includes(gone.repeatDate));
  store.restore(saved);assert(!materializeSeries(store.snapshot().recurrences,store.snapshot().tasks,'2026-10-30','2026-10-24').some(t=>t.id===gone.id));
  next=store.snapshot();next.recurrences[0].excludedDates=[];assert.throws(()=>store.commit(next,next.version),/周期规则不可覆盖/);
  next=store.snapshot();next.tasks.push(gone);assert.throws(()=>store.commit(next,next.version),/彻底删除/);
});
test('清空回收站要求确认时的版本，冲突失败无部分删除，清空后保留正常内容',t=>{
  const {deleteTask,deleteSubtask,deleteProject}=require('../prototype/lifecycle.mjs'),store=setup(t),snapshot=store.snapshot(),gone=fixture(),keep=fixture();snapshot.tasks=[gone,keep];snapshot.projects=['ToZ','个人'];store.commit(snapshot,0);
  let next=store.snapshot();deleteTask(next.tasks.find(t=>t.id===gone.id));deleteSubtask(Object.assign(next.tasks.find(t=>t.id===keep.id),{subtasks:[{id:'child',title:'删除项',done:false}]}),'child');deleteProject(next,'个人',{mode:'trash'});store.commit(next,next.version);
  const confirmationVersion=store.snapshot().version;store.updateSettings({closeToTray:false});const before=store.snapshot();assert.throws(()=>store.purge({kind:'all'},confirmationVersion),/重新确认/);assert.deepEqual(store.snapshot(),before);
  const result=store.purge({kind:'all'},before.version);assert.equal(result.counts.projects,1);assert.equal(result.counts.tasks,1);assert.equal(result.counts.subtasks,1);assert.equal(result.snapshot.tasks.length,1);assert(!result.snapshot.projects.includes('个人'));assert.equal(result.snapshot.preferences.projectTrash.length,0);assert.equal(result.snapshot.tasks[0].subtasks.length,0);assert.equal(store.purge({kind:'all'},result.snapshot.version).snapshot.version,result.snapshot.version);
});
test('单个任务移动分区通过版本检查保存，重开数据库保留归属和移动历史',t=>{
  const {moveTask}=require('../prototype/lifecycle.mjs'),store=setup(t),snapshot=store.snapshot(),task=fixture();snapshot.tasks=[task];snapshot.projects=['ToZ','个人'];store.commit(snapshot,0);
  const other=store.snapshot(),next=store.snapshot();moveTask(next,task.id,'个人');store.commit(next,next.version);
  moveTask(other,task.id,'个人');assert.throws(()=>store.commit(other,other.version));
  const reopened=new Store(store.directory),saved=reopened.snapshot();reopened.close();assert.equal(saved.tasks[0].project,'个人');assert.equal(saved.tasks[0].initialPlan,task.initialPlan);assert.equal(saved.tasks[0].plan,task.plan);assert.equal(saved.tasks[0].events.at(-1).type,'project_move');assert.equal(saved.tasks[0].events.at(-1).fromProject,'ToZ');assert.equal(saved.tasks[0].events.at(-1).toProject,'个人');
});

test('子任务改名和删除恢复经 SQLite 事务保存，重启备份后保留历史',t=>{
  const {editSubtask,deleteSubtask,restoreSubtask,deleteTask,restoreTask}=require('../prototype/lifecycle.mjs');
  const store=setup(t),snapshot=store.snapshot(),task=fixture();task.started='2026-10-20';task.subtasks=[{id:'child',title:'原名称',done:false}];snapshot.tasks=[task];store.commit(snapshot,0);
  let next=store.snapshot();editSubtask(next.tasks[0],'child','新名称');deleteSubtask(next.tasks[0],'child');store.commit(next,next.version);
  const reopened=new Store(store.directory),saved=reopened.snapshot();reopened.close();assert(saved.tasks[0].subtasks[0].deletedAt);assert.equal(saved.tasks[0].subtasks[0].title,'新名称');
  next=store.snapshot();restoreSubtask(next.tasks[0],'child');deleteTask(next.tasks[0]);store.commit(next,next.version);assert(store.snapshot().tasks[0].deletedAt);
  next=store.snapshot();restoreTask(next,task.id);store.commit(next,next.version);const restored=store.snapshot();assert.equal(restored.tasks[0].started,'2026-10-20');assert.equal(restored.tasks[0].initialPlan,task.initialPlan);assert.equal(restored.tasks[0].deletedAt,null);assert.equal(restored.tasks[0].subtasks[0].deletedAt,null);
  store.restore(restored);assert.deepEqual(store.snapshot().tasks,restored.tasks);
  next=store.snapshot();next.tasks[0].subtasks[0].title='绕过审计';assert.throws(()=>store.commit(next,next.version),/足迹/);
  next=store.snapshot();next.tasks[0].subtasks=[];assert.throws(()=>store.commit(next,next.version),/回收站/);
});
test('删除分区迁移周期与任务是原子事务，恢复分区不覆盖后续修改',t=>{
  const {deleteProject,restoreProject}=require('../prototype/lifecycle.mjs');
  const store=setup(t),snapshot=store.snapshot(),series=createSeries(createTask('迁移周期','2026-10-20','ToZ','','2026-10-20'),{unit:'day',interval:1},'2026-10-22');
  snapshot.recurrences=[series];snapshot.tasks=materializeSeries([series],[],'2026-10-22');store.commit(snapshot,0);
  let next=store.snapshot();deleteProject(next,'ToZ',{mode:'move',target:'个人'});store.commit(next,next.version);assert.equal(store.snapshot().recurrences[0].project,'个人');assert(store.snapshot().tasks.every(t=>t.project==='个人'));
  next=store.snapshot();restoreProject(next,'ToZ');store.commit(next,next.version);assert.equal(store.snapshot().preferences.projectTrash.length,0);assert(store.snapshot().tasks.every(t=>t.project==='个人'));
  next=store.snapshot();next.recurrences[0].project='生活';assert.throws(()=>store.commit(next,next.version),/周期规则/);
});

test('迁入任务的分区后续改名会同步回收站目标，恢复删除分区仍可用',t=>{
  const {deleteProject,restoreProject}=require('../prototype/lifecycle.mjs'),{renameProject}=require('../prototype/preferences.mjs');
  const store=setup(t),snapshot=store.snapshot();snapshot.tasks=[fixture()];store.commit(snapshot,0);
  let next=store.snapshot();deleteProject(next,'ToZ',{mode:'move',target:'个人'});store.commit(next,next.version);
  next=store.snapshot();renameProject(next,'个人','私人安排');next.projectRenames={'个人':'私人安排'};
  for(const task of next.tasks)task.events.push({id:crypto.randomUUID(),type:'project_rename',fromProject:'个人',toProject:'私人安排',date:'2026-10-20',at:new Date().toISOString()});
  store.commit(next,next.version);assert.equal(store.snapshot().preferences.projectTrash[0].target,'私人安排');assert.equal(store.snapshot().tasks[0].project,'私人安排');
  next=store.snapshot();restoreProject(next,'ToZ');store.commit(next,next.version);assert.equal(store.snapshot().preferences.projectTrash.length,0);
});
test('分区及其任务删除、恢复与旧格式兼容，删除周期本期不会补回',t=>{
  const {deleteProject,restoreProject,deleteTask}=require('../prototype/lifecycle.mjs');
  const store=setup(t),snapshot=store.snapshot(),series=createSeries(createTask('待删除周期','2026-10-20','ToZ','','2026-10-20'),{unit:'day',interval:1},'2026-10-23');snapshot.recurrences=[series];snapshot.tasks=materializeSeries([series],[],'2026-10-23');store.commit(snapshot,0);
  let next=store.snapshot();deleteTask(next.tasks[0]);store.commit(next,next.version);assert.equal(store.ensureRecurring('2026-10-21'),false);
  next=store.snapshot();deleteProject(next,'ToZ',{mode:'trash'});store.commit(next,next.version);const deleted=store.snapshot();assert(deleted.tasks.every(t=>t.deletedAt));assert.equal(deleted.recurrences[0].active,false);
  next=store.snapshot();restoreProject(next,'ToZ');store.commit(next,next.version);const restored=store.snapshot();assert.equal(restored.tasks.filter(t=>t.deletedAt).length,1);assert.equal(restored.recurrences[0].active,false);
  const old={schema:1,tasks:[fixture()],projects:['ToZ']};store.restore(old);assert.deepEqual(store.snapshot().preferences.projectTrash,[]);
});

test('项目改名原子同步周期与每期任务，名称颜色顺序筛选置顶重启和备份后保留',t=>{
  const {renameProject}=require('../prototype/preferences.mjs');
  const store=setup(t),snapshot=store.snapshot(),rule=createSeries(createTask('项目周期','2026-10-20','ToZ','','2026-10-20'),{unit:'day',interval:1},'2026-10-22');
  snapshot.recurrences=[rule];snapshot.tasks=materializeSeries([rule],[],'2026-10-22');store.commit(snapshot,0);
  let next=store.snapshot(),original=structuredClone(next.tasks);
  next.preferences.widgetProject='ToZ';renameProject(next,'ToZ','工作');next.projectRenames={ToZ:'工作'};
  next.projects=['生活','工作','个人'];next.preferences.projectColors={'工作':'#30b0c7'};next.preferences.menuOrder.reverse();next.preferences.taskOrder.reverse();next.tasks[0].top=true;
  for(const task of next.tasks)task.events.push({id:crypto.randomUUID(),type:'project_rename',fromProject:'ToZ',toProject:'工作',date:'2026-10-20',at:new Date().toISOString()});
  store.commit(next,next.version);const reopened=new Store(store.directory),after=reopened.snapshot();reopened.close();
  assert.deepEqual(after.projects,['生活','工作','个人']);assert.deepEqual(after.preferences,next.preferences);assert.equal(after.recurrences[0].project,'工作');assert(after.tasks.every(t=>t.project==='工作'));assert(after.tasks.some(t=>t.top));
  for(const task of after.tasks){const old=original.find(t=>t.id===task.id);assert.equal(task.initialPlan,old.initialPlan);assert.deepEqual(task.events.slice(0,old.events.length),old.events);}
  store.restore(after);assert.deepEqual(store.snapshot().preferences,after.preferences);
  next=store.snapshot();next.recurrences[0].rule.interval=2;assert.throws(()=>store.commit(next,next.version),/周期/);
});
test('项目改名不允许遗漏任务、覆盖已有项目或篡改周期规则，失败不产生部分提交',t=>{
  const store=setup(t),snapshot=store.snapshot();snapshot.tasks=[fixture()];store.commit(snapshot,0);
  const before=store.snapshot(),next=structuredClone(before);next.projects=['新名称','个人','生活'];next.projectRenames={ToZ:'新名称'};next.tasks[0].project='新名称';
  assert.throws(()=>store.commit(next,next.version),/历史/);assert.deepEqual(store.snapshot(),before);
  next.projectRenames={ToZ:'个人'};assert.throws(()=>store.commit(next,next.version),/冲突/);
});
test('农历周期保存恢复与离线补齐幂等，单任务导出顺序须只包含导出的任务',t=>{
  const store=setup(t),snapshot=store.snapshot(),s=createSeries(createTask('春节安排','2026-01-01','ToZ','','2026-01-01'),{unit:'year',interval:1,calendar:'lunar',lunar:{month:1,day:1,leap:'regular'}},'2028-12-31');
  snapshot.recurrences=[s];snapshot.tasks=materializeSeries([s],[],'2028-12-31','2026-01-01');store.commit(snapshot,0);
  const next=store.snapshot();assert.deepEqual(next.tasks.map(t=>t.repeatDate).sort(),['2026-02-17','2027-02-06','2028-01-26']);assert.equal(store.ensureRecurring('2027-01-01'),false);
  store.restore(next);assert.deepEqual(store.snapshot().recurrences,[s]);
  const single=store.snapshot();single.tasks=single.tasks.slice(0,1);assert.throws(()=>validateSnapshot(single),/排序/);single.preferences.taskOrder=single.tasks.map(t=>t.id);single.recurrences[0].active=false;validateSnapshot(single);
});

test('周期规则和每期实例离线持久化，补齐幂等，备份恢复完整',t=>{
  const store=setup(t),snapshot=store.snapshot(),s=createSeries(createTask('每日复盘','2026-10-20','ToZ','','2026-10-20'),{unit:'day',interval:1},'2026-10-24');
  snapshot.recurrences.push(s);snapshot.tasks=materializeSeries([s],[],'2026-10-21');store.commit(snapshot,0);
  const reopened=new Store(store.directory);assert.deepEqual(reopened.snapshot().recurrences,[s]);assert.equal(reopened.ensureRecurring('2026-10-23'),true);assert.equal(reopened.ensureRecurring('2026-10-23'),false);
  const before=reopened.snapshot();assert.equal(before.tasks.length,5);reopened.close();store.restore(before);assert.deepEqual(store.snapshot().recurrences,[s]);assert.equal(store.snapshot().tasks.length,5);
});
test('周期规则和原始期次不可覆盖，停止后取消未来项并保持原有历史',t=>{
  const store=setup(t),s=createSeries(createTask('每周复盘','2026-10-20','ToZ','','2026-10-20'),{unit:'week',interval:1,weekdays:[1]});
  const snapshot=store.snapshot();snapshot.recurrences=[s];snapshot.tasks=materializeSeries([s],[],'2026-11-10');store.commit(snapshot,0);
  let next=store.snapshot();next.recurrences[0].rule.interval=2;assert.throws(()=>store.commit(next,next.version));
  next=store.snapshot();next.tasks[0].repeatDate='2026-11-11';assert.throws(()=>store.commit(next,next.version));
  next=store.snapshot();stopSeries(next.recurrences[0],next.tasks);store.commit(next,next.version);
  assert(store.snapshot().tasks.filter(t=>t.repeatDate>'2026-10-20').every(t=>t.cancelled&&t.events.at(-1).type==='cancel_repeat'));
  assert.equal(store.ensureRecurring('2026-12-01'),false);next=store.snapshot();next.recurrences[0].active=true;assert.throws(()=>store.commit(next,next.version));
});
test('拒绝周期实例重复、脱离规则和遗漏周期元数据，旧版备份仍兼容',t=>{
  const store=setup(t),s=createSeries(createTask('周期','2026-10-20','ToZ','','2026-10-20'),{unit:'day',interval:1},'2026-10-20'),tasks=materializeSeries([s],[],'2026-10-20');
  assert.throws(()=>validateSnapshot({tasks,projects:['ToZ']}));
  const duplicate=structuredClone(tasks[0]);duplicate.id='different-id';duplicate.events=[];
  assert.throws(()=>validateSnapshot({tasks:[...tasks,duplicate],projects:['ToZ'],recurrences:[s]}));
  const old={schema:1,tasks:[fixture()],projects:['ToZ']};store.restore(old);assert.deepEqual(store.snapshot().recurrences,[]);
});
test('SQLite 离线保存、关闭重启恢复完整任务和历史',t=>{const store=setup(t),task=fixture();store.commit({tasks:[task],opacity:80},0);const reopened=new Store(store.directory);assert.deepEqual(reopened.snapshot().tasks,[task]);assert.equal(reopened.snapshot().opacity,80);assert(fs.existsSync(path.join(store.directory,'backups')));reopened.close();});
test('首次开始与最初计划锁定，失败后事务可继续写入',t=>{const store=setup(t),task=fixture();task.started='2026-10-19';store.commit({tasks:[task]},0);const input=structuredClone(store.snapshot());input.tasks[0].started='2026-10-20';assert.throws(()=>store.commit(input,1),/首次开始/);assert.equal(store.snapshot().tasks[0].started,'2026-10-19');input.tasks[0].started='2026-10-19';input.tasks[0].title='合法重命名';store.commit(input,1);assert.equal(store.snapshot().version,2);});
test('延期必须记录历史，历史不可覆盖，数据库状态不部分提交',t=>{const store=setup(t),task=fixture();store.commit({tasks:[task]},0);const input=structuredClone(store.snapshot());input.tasks[0].plan='2026-10-22';assert.throws(()=>store.commit(input,1),/历史/);input.tasks[0].events.push({id:crypto.randomUUID(),type:'later',date:'2026-10-20',at:new Date().toISOString(),from:'2026-10-20',to:'2026-10-22',reason:'等待资料'});store.commit(input,1);const tamper=structuredClone(store.snapshot());tamper.tasks[0].events[0].type='start';assert.throws(()=>store.commit(tamper,2),/只允许追加/);assert.equal(store.snapshot().tasks[0].events.length,2);assert.equal(store.snapshot().tasks[0].initialPlan,'2026-10-20');});
test('多窗口版本冲突会拒绝旧数据覆盖',t=>{const store=setup(t),task=fixture();const old=store.snapshot();store.commit({tasks:[task]},0);assert.throws(()=>store.commit(old,0),/另一窗口/);assert.equal(store.snapshot().tasks.length,1);});
test('恢复前自动保存安全副本，并保留本机设置',t=>{const store=setup(t),task=fixture();store.commit({tasks:[task]},0);store.updateSettings({widgetPinned:true});const backup=store.snapshot();const changed=structuredClone(backup);changed.tasks[0].title='另一个标题';store.commit(changed,backup.version);store.restore(backup);assert.equal(store.snapshot().tasks[0].title,task.title);assert.equal(store.settings().widgetPinned,true);assert(fs.readdirSync(store.directory).some(f=>f.startsWith('before-restore-')));});
test('设置持久化且拒绝不合法设置，完成父任务仍要求完成子任务',t=>{const store=setup(t);store.updateSettings({closeToTray:false,startMinimized:true,opacity:88});assert.equal(store.settings().closeToTray,false);assert.equal(store.settings().opacity,88);assert.throws(()=>store.updateSettings({opacity:10}));const task=fixture();task.done=true;task.completedDate='2026-10-20';task.subtasks=[{id:'sub',title:'未完成',done:false}];assert.throws(()=>validateSnapshot({tasks:[task]}),/子任务/);});
test('自定义空项目重启仍保留，任务可归属新项目，备份可完整恢复',t=>{const store=setup(t);const initial=store.snapshot();assert.equal(initial.dark,true);initial.projects.push('工作与研究');store.commit(initial,0);const reopened=new Store(store.directory);assert(reopened.snapshot().projects.includes('工作与研究'));reopened.close();const next=store.snapshot(),task=fixture();task.project='工作与研究';next.tasks.push(task);next.dark=true;store.commit(next,next.version);const backup=JSON.parse(fs.readFileSync(path.join(store.directory,'backups',fs.readdirSync(path.join(store.directory,'backups'))[0]),'utf8'));assert(backup.projects.includes('工作与研究'));store.restore(backup);assert.equal(store.snapshot().tasks[0].project,'工作与研究');assert.equal(store.snapshot().dark,true);});
test('拒绝空名称、重名和未注册项目；旧格式兼容且不丢弃空项目',t=>{const store=setup(t);for(const projects of [[''],['ToZ','toz'],['x'.repeat(41)]])assert.throws(()=>store.commit({tasks:[],projects},0));store.commit({tasks:[],projects:['空项目']},0);const task=fixture();task.project='其他';assert.throws(()=>store.commit({tasks:[task],projects:['空项目']},1),/不存在/);store.commit({tasks:[task]},1);assert(store.snapshot().projects.includes('空项目'));assert(store.snapshot().projects.includes('其他'));});
test('计划起止保存及恢复，改变开始计划需留痕且实际开始始终锁定',t=>{
  const store=setup(t),task=fixture();task.planStart='2026-10-18';task.started='2026-10-19';store.commit({tasks:[task]},0);
  const input=store.snapshot();input.tasks[0].planStart='2026-10-17';assert.throws(()=>store.commit(input,1),/开始日期必须/);
  input.tasks[0].events.push({id:crypto.randomUUID(),type:'plan_start',from:'2026-10-18',to:'2026-10-17',date:'2026-10-20',at:new Date().toISOString()});store.commit(input,1);
  const backup=store.snapshot();store.restore(backup);assert.equal(store.snapshot().tasks[0].planStart,'2026-10-17');assert.equal(store.snapshot().tasks[0].started,'2026-10-19');
  const bad=store.snapshot();bad.tasks[0].planStart='2026-10-21';assert.throws(()=>store.commit(bad,bad.version),/不能早于/);
});
test('默认深色，已有浅色选择在升级、无外观字段写入及重启后保持',t=>{const store=setup(t);assert.equal(store.snapshot().dark,true);store.commit({tasks:[],dark:false},0);store.commit({tasks:[]},1);const reopened=new Store(store.directory);assert.equal(reopened.snapshot().dark,false);reopened.close();});


test('子任务排期经 SQLite 持久保存，导出恢复和重启保留，越界和无足迹更新被拒绝',t=>{
  const {addSubtask,editSubtask}=require('../prototype/lifecycle.mjs'),store=setup(t),task=createTask('父子计划','2026-10-30','ToZ','','2026-10-20');
  const sub=addSubtask(task,'带日期的子任务','2026-10-21','2026-10-25'),state=store.snapshot();state.tasks=[task];store.commit(state,state.version);
  const saved=store.snapshot();assert.equal(saved.tasks[0].subtasks[0].plan,'2026-10-25');
  const other=new Store(store.directory);try{assert.deepEqual(other.snapshot().tasks[0].subtasks,saved.tasks[0].subtasks);}finally{other.close();}
  for(const mutate of [s=>s.tasks[0].subtasks[0].plan='2026-10-31',s=>s.tasks[0].subtasks[0].planStart=null,s=>s.tasks[0].subtasks[0].planStart='bad',s=>s.tasks[0].subtasks[0].plan='2026-10-24']){
    const bad=structuredClone(saved);mutate(bad);assert.throws(()=>store.commit(bad,bad.version));assert.deepEqual(store.snapshot(),saved);
  }
  editSubtask(saved.tasks[0],sub.id,'带日期的子任务',{planStart:'2026-10-22',plan:'2026-10-26'});store.commit(saved,saved.version);
  const exported=JSON.parse(JSON.stringify(store.snapshot()));store.restore(exported);assert.equal(store.snapshot().tasks[0].subtasks[0].plan,'2026-10-26');
  const badImport=structuredClone(exported);badImport.tasks[0].subtasks[0].plan='2026-10-31';assert.throws(()=>store.restore(badImport));
});
