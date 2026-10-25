import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import initSqlJs from 'sql.js';
import {build} from 'esbuild';
import path from 'node:path';
const SQL=await initSqlJs(),adapter=path.resolve('web/node-adapters.mjs');
const bundle=await build({entryPoints:['web/runtime.mjs'],write:false,bundle:true,format:'iife',platform:'browser',inject:[adapter],plugins:[{name:'web-test',setup(b){b.onResolve({filter:/^node:(fs|path|sqlite|util)$/},()=>({path:adapter}));}}]});
function context({storage=new Map(),request}={}){
  let failWrites=false;
  const localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>{if(failWrites)throw new Error('quota');storage.set(key,value);},removeItem:key=>storage.delete(key)};
  const sandbox={localStorage,tozSQL:SQL,btoa,atob,TextEncoder,structuredClone,Intl,console,URL,AbortSignal,crypto,location:{origin:'https://toz.test'},fetch:request,setTimeout:()=>0,setInterval:()=>0,CustomEvent:class{},document:{hidden:true,documentElement:{classList:{add(){}},dataset:{}},dispatchEvent(){},addEventListener(){}}};sandbox.window=sandbox;
  sandbox.toz={platform:'web',surface:'main'};
  vm.runInNewContext(bundle.outputFiles[0].text,sandbox);
  return {api:sandbox.toz,storage,sandbox,failWrites(value){failWrites=value;}};
}
const task=()=>({id:'web-task',title:'网页任务',note:'',project:'个人',planStart:null,plan:null,initialPlan:null,started:null,completedDate:null,done:false,subtasks:[],events:[{id:'create',type:'create',date:'2026-10-25',at:'2026-10-25T10:00:00Z'}]});
test('Browser SQLite persists, rejects stale writes, protects history and rolls back quota failures',()=>{
  const c=context();let state=c.api.read().snapshot;assert.equal(state.tasks.length,0);state.tasks=[task()];let result=c.api.commit(state,state.version);assert.equal(result.ok,true,result.error);
  assert.equal(c.api.commit(state,state.version).ok,false);
  const next=structuredClone(result.snapshot);next.tasks[0].started='2026-10-25';next.tasks[0].events.push({id:'start',type:'start',date:'2026-10-25',at:'2026-10-25T11:00:00Z'});result=c.api.commit(next,result.snapshot.version);assert.equal(result.ok,true,result.error);
  const invalid=structuredClone(result.snapshot);invalid.tasks[0].started='2026-10-24';assert.equal(c.api.commit(invalid,result.snapshot.version).ok,false);
  const erase=structuredClone(result.snapshot);erase.tasks[0].events=[];assert.equal(c.api.commit(erase,result.snapshot.version).ok,false);
  const full=structuredClone(result.snapshot);full.tasks[0].title='无法保存';c.failWrites(true);assert.equal(c.api.commit(full,result.snapshot.version).ok,false);c.failWrites(false);
  assert.equal(c.api.read().snapshot.tasks[0].title,'网页任务');
  const reopened=context({storage:c.storage});assert.equal(reopened.api.read().snapshot.tasks[0].started,'2026-10-25');assert.equal(reopened.api.read().snapshot.tasks[0].events.length,2);
});
test('Browser account copy, sync, resume, logout and isolation use shared Cloud protocol',async()=>{
  let document=null,version=0;const user={id:'web-user',identities:[{address:'web@example.com'}]};
  const request=async(url,options={})=>{
    assert.ok(url.startsWith('https://toz.test/'));const body=options.body?JSON.parse(options.body):null;let result;
    if(url.endsWith('/auth/login'))result={user,token:'test-session'};
    else if(url.endsWith('/auth/logout'))result={ok:true};
    else if(url.endsWith('/sync')){assert.equal(options.headers.Authorization,'Bearer test-session');if(options.method==='PUT'){assert.equal(body.version,version);document=body.document;version++;result={version};}else result={version,document,user};}
    else throw new Error('Unexpected route');
    return {ok:true,json:async()=>structuredClone(result)};
  };
  const c=context({request});let state=c.api.read().snapshot;state.tasks=[task()];assert.equal(c.api.commit(state,state.version).ok,true);
  const choice=await c.api.cloud('login',{email:'web@example.com',code:'123456'});assert.equal(choice.needsLocalChoice,true);
  const changed=await c.api.cloud('login',{localDataChoice:'copy',localVersion:0});assert.equal(changed.choiceChanged,true);
  const status=await c.api.cloud('login',{email:'web@example.com',code:'123456',localDataChoice:'copy',localVersion:choice.localVersion});assert.equal(status.error,'');assert.equal(status.pending,false);assert.equal(document.tasks[0].title,'网页任务');
  state=c.api.read().snapshot;state.tasks[0].title='账号任务';assert.equal(c.api.commit(state,state.version).ok,true);await c.api.cloud('sync');assert.equal(document.tasks[0].title,'账号任务');
  const reopened=context({storage:c.storage,request});assert.equal(reopened.api.cloudStatus().user.id,user.id);assert.equal(reopened.api.read().snapshot.tasks[0].title,'账号任务');
  await reopened.api.cloud('logout');assert.equal(reopened.api.read().snapshot.tasks[0].title,'网页任务');assert.equal(reopened.api.cloudStatus().user,null);
  await reopened.api.cloud('login',{email:'web@example.com',code:'123456',localDataChoice:'keep',localVersion:reopened.api.read().snapshot.version});assert.equal(reopened.api.read().snapshot.tasks[0].title,'账号任务');
});
test('Browser restore creates safety copy and purge cannot delete active tasks',()=>{
  const c=context();const state=c.api.read().snapshot;state.tasks=[task()];const saved=c.api.commit(state,state.version);assert.equal(saved.ok,true,saved.error);
  assert.equal(c.api.purge({kind:'task',id:'web-task'},saved.snapshot.version).ok,false);
  c.sandbox.tozPendingImport={...state,tasks:[]};c.sandbox.tozConfirmImport();assert.equal(c.api.read().snapshot.tasks.length,0);assert.ok([...c.storage.keys()].some(key=>key.includes('before-restore-')));
});
