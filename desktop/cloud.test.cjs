const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Store}=require('./store.cjs');
const {Cloud}=require('./cloud.cjs');
const {documentOf,mergeDocuments}=require('./sync-model.cjs');
const {createService}=require('../sync-server/server.cjs');
const {createTask}=require('../prototype/domain.mjs');
const {createSeries,materializeSeries}=require('../prototype/recurrence.mjs');
function fixture(t){
  const root=path.resolve('.runtime','cloud-test-'+crypto.randomUUID());fs.mkdirSync(root,{recursive:true});
  const stores=[],cleanups=[];
  t.after(async()=>{for(const cleanup of cleanups)await cleanup();for(const s of stores)try{s.close();}catch{}if(path.dirname(root)===path.resolve('.runtime'))fs.rmSync(root,{recursive:true,force:true});});
  const makeStore=name=>{const s=new Store(path.join(root,name));stores.push(s);return s;};
  return {root,makeStore,cleanups};
}
function task(title='任务'){return createTask(title,'2026-10-25','ToZ','','2026-10-25');}
function doc(){return {schema:1,tasks:[task('A'),task('B')],projects:['ToZ'],recurrences:[],projectColors:{},projectTrash:[]};}
test('旧账号表增加头像与昵称列后保留账号和缺省资料',t=>{
  const {root,cleanups}=fixture(t),directory=path.join(root,'legacy-server');fs.mkdirSync(directory,{recursive:true});
  const {DatabaseSync}=require('node:sqlite'),old=new DatabaseSync(path.join(directory,'sync.sqlite'));
  old.exec("CREATE TABLE users(id TEXT PRIMARY KEY,created INTEGER NOT NULL);INSERT INTO users VALUES('legacy-user',123)");old.close();
  const service=createService({directory,pepper:'legacy-test-secret-'.repeat(3),sendMail:async()=>{}});cleanups.push(()=>service.close());
  assert.deepEqual({...service.db.prepare('SELECT * FROM users').get()},{id:'legacy-user',created:123,avatar:null,nickname:null});
});
test('不同任务并发修改合并；同一任务冲突保留双方，选择仅作用于冲突项',()=>{
  const base=doc(),a=structuredClone(base),b=structuredClone(base);a.tasks[0].title='A 本机';b.tasks[1].title='B 云端';
  let result=mergeDocuments(base,a,b);assert.equal(result.conflicts.length,0);assert.deepEqual(result.document.tasks.map(t=>t.title),['A 本机','B 云端']);
  b.tasks[0].title='A 云端';result=mergeDocuments(base,a,b);assert.equal(result.conflicts.length,1);
  assert.equal(mergeDocuments(base,a,b,'cloud').document.tasks[0].title,'A 云端');
  assert.deepEqual(mergeDocuments(base,a,b,'local').document.tasks.map(t=>t.title),['A 本机','B 云端']);
  assert.equal(a.tasks[0].title,'A 本机');assert.equal(b.tasks[0].title,'A 云端');
});
test('永久删除不会被未修改的离线副本复活；删除与编辑形成冲突',()=>{
  const base=doc(),a=structuredClone(base),b=structuredClone(base);a.tasks.shift();
  assert.equal(mergeDocuments(base,a,b).document.tasks.length,1);
  b.tasks[0].title='离线编辑';assert.equal(mergeDocuments(base,a,b).conflicts.length,1);
  assert.equal(mergeDocuments(base,a,b,'local').document.tasks.length,1);
});
test('各电脑独立生成同一期周期任务自动去重，不合并已编辑的期次',()=>{
  const series=createSeries(task(),{unit:'day',interval:1},'2026-10-26'),a=doc(),b=doc();a.recurrences=[series];b.recurrences=[series];
  a.tasks=materializeSeries([series],[],'2026-10-25','2026-10-25');b.tasks=materializeSeries([series],[],'2026-10-25','2026-10-25');
  assert.equal(mergeDocuments(null,a,b).conflicts.length,0);b.tasks[0].title='修改';assert.equal(mergeDocuments(null,a,b).conflicts.length,1);
});
test('跨分区删除和离线新增的关联冲突不能静默生成非法状态',()=>{
  const base=doc(),a=structuredClone(base),b=structuredClone(base);a.projects=[];a.tasks=[];b.tasks.push(task('新增'));
  assert(mergeDocuments(base,a,b).conflicts.includes('分区、周期或父子任务关联'));
});
test('云端应用建立安全副本、同步硬删除、保留本机设置并拒绝过期版本',t=>{
  const {makeStore}=fixture(t),s=makeStore('store');s.restore({...s.snapshot(),...doc()});s.updateSettings({largeText:true,opacity:65});const before=s.snapshot(),remote=documentOf(before);remote.tasks.shift();
  assert.throws(()=>s.applyCloud(remote,before.version-1),/本地数据已更新/);assert.equal(s.snapshot().tasks.length,2);
  s.applyCloud(remote,before.version);assert.equal(s.snapshot().tasks.length,1);assert.equal(s.settings().largeText,true);assert.equal(s.settings().opacity,65);
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM events').get().n,remote.tasks[0].events.length);
  assert(fs.readdirSync(s.directory).some(n=>n.startsWith('before-restore-')));
});
async function service(t){
  const {root,makeStore,cleanups}=fixture(t),mail=new Map();let time=Date.now();
  const service=createService({directory:path.join(root,'server'),pepper:'test-'.repeat(10),now:()=>time,sendMail:async(email,code)=>mail.set(email,code)});
  await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve));
  cleanups.push(async()=>{service.server.closeAllConnections();await new Promise(resolve=>service.server.close(resolve));service.close();});
  const url='http://127.0.0.1:'+service.server.address().port;
  async function api(route,body,token,method){const res=await fetch(url+route,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,data:await res.json()};}
  async function login(email){time+=61000;assert.equal((await api('/auth/code',{email})).status,200);return (await api('/auth/login',{email,code:mail.get(email)})).data;}
  return {root,makeStore,api,login,mail,url,service,advance:ms=>time+=ms};
}
test('昵称需要登录、校验字符和长度、清空恢复默认且账号隔离',async t=>{
  const {api,login}=await service(t),a=await login('nick-a@example.com'),b=await login('nick-b@example.com');
  assert.equal((await api('/account/nickname',{nickname:'未登录'},null,'PUT')).status,401);
  assert.equal((await api('/account/nickname',{nickname:'甲'.repeat(31)},a.token,'PUT')).status,400);
  assert.equal((await api('/account/nickname',{nickname:'甲\n乙'},a.token,'PUT')).status,400);
  assert.equal((await api('/account/nickname',{nickname:123},a.token,'PUT')).status,400);
  const changed=await api('/account/nickname',{nickname:'  小明🌱  '},a.token,'PUT');assert.equal(changed.data.user.nickname,'小明🌱');
  assert.equal((await api('/sync',null,a.token)).data.user.nickname,'小明🌱');
  assert.equal((await api('/account',null,b.token)).data.user.nickname,null);
  assert.equal((await login('nick-a@example.com')).user.nickname,'小明🌱');
  assert.equal((await api('/account/nickname',{nickname:'  '},a.token,'PUT')).data.user.nickname,null);
});
test('验证码自动注册、单次消费、错误次数限制、过期及发送限流',async t=>{
  const {api,mail,advance}=await service(t),email='one@example.com';
  assert.equal((await api('/auth/code',{email})).status,200);const code=mail.get(email);
  assert.equal((await api('/auth/code',{email})).status,429);
  const login=await api('/auth/login',{email,code});assert.equal(login.status,200);assert.equal(login.data.user.identities[0].address,email);
  assert.equal((await api('/auth/login',{email,code})).status,400);
  advance(61000);await api('/auth/code',{email});for(let i=0;i<5;i++)assert.equal((await api('/auth/login',{email,code:'000000'})).status,400);
  assert.equal((await api('/auth/login',{email,code:mail.get(email)})).status,400);
  advance(61000);await api('/auth/code',{email});advance(600001);assert.equal((await api('/auth/login',{email,code:mail.get(email)})).status,400);
});
test('绑定邮箱可登录同一账号，不能绑定他人邮箱，注销与会话过期生效',async t=>{
  const {api,login,mail,advance}=await service(t),a=await login('a@example.com'),b=await login('b@example.com');
  assert.equal((await api('/auth/code',{email:'new@example.com',purpose:'bind'},a.token)).status,200);
  assert.equal((await api('/auth/bind',{email:'new@example.com',code:mail.get('new@example.com')},a.token)).status,200);
  assert.equal((await login('new@example.com')).user.id,a.user.id);
  advance(61000);await api('/auth/code',{email:'b@example.com',purpose:'bind'},a.token);
  assert.equal((await api('/auth/bind',{email:'b@example.com',code:mail.get('b@example.com')},a.token)).status,409);
  await api('/auth/logout',{},b.token);assert.equal((await api('/account',null,b.token)).status,401);
  advance(31*86400000);assert.equal((await api('/account',null,a.token)).status,401);
});
test('服务端账号隔离、版本 CAS 与非法数据拒绝',async t=>{
  const {api,login}=await service(t),a=await login('a@example.com'),b=await login('b@example.com'),document=doc();
  assert.equal((await api('/sync')).status,401);
  assert.equal((await api('/sync',{version:0,document},a.token,'PUT')).status,200);
  assert.equal((await api('/sync',{version:0,document},a.token,'PUT')).status,409);
  assert.equal((await api('/sync',null,b.token)).data.document,null);
  assert.equal((await api('/sync',{version:1,document:{...document,tasks:[{}]}},a.token,'PUT')).status,400);
  assert.equal((await api('/sync',null,a.token)).data.version,1);
  assert.equal((await api('/account/avatar',{avatar:null},null,'PUT')).status,401);
  assert.equal((await api('/account/avatar',{avatar:'data:image/svg+xml,<svg/>'},a.token,'PUT')).status,400);
  assert.equal((await api('/account/avatar',{avatar:null},a.token,'PUT')).data.user.avatar,null);
});
test('两台电脑同步、离线编辑、冲突选择、过期确认拒绝及网络错误保留数据',async t=>{
  const {root,makeStore,url,login}=await service(t),account=await login('sync@example.com');
  const makeClient=name=>{const store=makeStore(name);const c=new Cloud({directory:store.directory,getStore:()=>store,switchProfile:()=>{},seal:v=>v,unseal:v=>v,url});c.user=account.user;c.token=account.token;return {c,store};};
  const a=makeClient('a'),b=makeClient('b');a.store.restore({...a.store.snapshot(),...doc()});await a.c.sync();await b.c.sync();assert.equal(b.store.snapshot().tasks.length,2);
  let s=a.store.snapshot();s.tasks[0].title='A 本机';a.store.commit(s,s.version);s=b.store.snapshot();s.tasks[1].title='B 本机';b.store.commit(s,s.version);
  await a.c.sync();await b.c.sync();await a.c.sync();assert.deepEqual(a.store.snapshot().tasks.map(t=>t.title),['A 本机','B 本机']);
  s=a.store.snapshot();s.tasks[0].title='冲突 A';a.store.commit(s,s.version);s=b.store.snapshot();s.tasks[0].title='冲突 B';b.store.commit(s,s.version);
  await a.c.sync();await b.c.sync();assert.equal(b.c.status().conflicts.length,1);assert.equal(b.store.snapshot().tasks[0].title,'冲突 B');
  s=b.store.snapshot();s.tasks[0].note='继续修改';b.store.commit(s,s.version);await b.c.sync('cloud');assert.match(b.c.status().error,/数据已变化/);
  await b.c.sync();await b.c.sync('cloud');assert.equal(b.store.snapshot().tasks[0].title,'冲突 A');
  const before=b.store.snapshot();b.c.request=async()=>{throw new Error('网络中断');};await b.c.sync();assert.deepEqual(b.store.snapshot(),before);assert.match(b.c.status().error,/网络/);
  assert(!JSON.stringify(documentOf(before)).includes('largeText'));assert(path.resolve(root).startsWith(path.resolve('.runtime')));
});
