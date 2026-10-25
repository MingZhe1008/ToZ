import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createBridge}=require('./test-native.cjs');
const root=path.resolve(import.meta.dirname,'..');
const adapter=path.join(root,'mobile/node-adapters.mjs');
async function context(options={}){
  fs.mkdirSync(path.join(root,'.runtime'),{recursive:true});
  const dir=options.dir||fs.mkdtempSync(path.join(root,'.runtime/android-unit-'));
  const bridge=createBridge(dir),callbacks={};
  const result=await build({entryPoints:[path.join(root,'mobile/runtime.mjs')],write:false,bundle:true,format:'iife',platform:'browser',inject:[adapter],plugins:[{name:'native',setup(b){b.onResolve({filter:/^node:(fs|path|sqlite|util)$/},()=>({path:adapter}));}}]});
  const sandbox={ToZAndroid:bridge,crypto:globalThis.crypto,TextEncoder,structuredClone,Intl,console,URL,AbortSignal,setTimeout:()=>0,clearTimeout(){},setInterval(){},location:{reload(){}},CustomEvent:class{},document:{hidden:true,documentElement:{classList:{add(){}},dataset:{}},dispatchEvent(){},addEventListener(type,fn){callbacks[type]=fn;}}};
  sandbox.window=sandbox;
  if(options.request)bridge.request=(id,url,method,headers,body)=>queueMicrotask(async()=>{
    try{const response=await options.request(url,method,JSON.parse(headers),body?JSON.parse(body):null);sandbox.tozNativeEvent('http',{id,status:200,body:JSON.stringify(response)});}
    catch(error){sandbox.tozNativeEvent('http',{id,error:error.message});}
  });
  vm.runInNewContext(result.outputFiles[0].text,sandbox);
  return {api:sandbox.toz,bridge,dir,sandbox,close(){bridge.close();fs.rmSync(dir,{recursive:true,force:true});}};
}
const task=()=>({id:'mobile-task',title:'手机任务',note:'',project:'个人',planStart:null,plan:null,initialPlan:null,started:null,completedDate:null,done:false,subtasks:[],events:[{id:'create-event',type:'create',date:'2026-10-25',at:'2026-10-25T10:00:00Z'}]});
test('Android bridge persists real SQLite snapshots, rejects stale writes and protects first start / history',async()=>{
  const c=await context();try{
    const initial=c.api.read();assert.equal(initial.ok,true,initial.error);assert.equal(initial.snapshot.tasks.length,0);
    initial.snapshot.tasks=[task()];let saved=c.api.commit(initial.snapshot,0);assert.equal(saved.ok,true,saved.error);
    assert.equal(c.api.commit(initial.snapshot,0).ok,false);
    const next=structuredClone(saved.snapshot);next.tasks[0].started='2026-10-25';next.tasks[0].events.push({id:'start-event',type:'start',date:'2026-10-25',at:'2026-10-25T11:00:00Z'});
    saved=c.api.commit(next,saved.snapshot.version);assert.equal(saved.ok,true,saved.error);
    const corrupt=structuredClone(saved.snapshot);corrupt.tasks[0].started='2026-10-24';assert.equal(c.api.commit(corrupt,saved.snapshot.version).ok,false);
    const erase=structuredClone(saved.snapshot);erase.tasks[0].events=[];assert.equal(c.api.commit(erase,saved.snapshot.version).ok,false);
    assert.equal(c.api.read().snapshot.tasks[0].events.length,2);
    assert.ok(fs.existsSync(path.join(c.dir,'offline/toz.sqlite')));
    assert.ok(fs.readdirSync(path.join(c.dir,'offline/backups')).length);
  }finally{c.close();}
});
test('Android purge uses separate checked transaction; restore makes safety backup',async()=>{
  const c=await context();try{
    const state=c.api.read().snapshot;state.tasks=[task()];let saved=c.api.commit(state,state.version);assert.equal(saved.ok,true,saved.error);
    assert.equal(c.api.purge({kind:'task',id:'mobile-task'},saved.snapshot.version).ok,false);
    const next=structuredClone(saved.snapshot);next.tasks[0].deletedAt='2026-10-25T12:00:00Z';next.tasks[0].events.push({id:'delete-event',type:'task_delete',date:'2026-10-25',at:'2026-10-25T12:00:00Z'});
    saved=c.api.commit(next,saved.snapshot.version);assert.equal(saved.ok,true,saved.error);
    assert.equal(c.api.purge({kind:'task',id:'mobile-task'},0).ok,false);
    const purged=c.api.purge({kind:'task',id:'mobile-task'},saved.snapshot.version);assert.equal(purged.ok,true,purged.error);assert.equal(purged.snapshot.tasks.length,0);
    c.sandbox.tozPendingImport={...state,tasks:[task()]};c.sandbox.tozConfirmImport();
    assert.equal(c.api.read().snapshot.tasks.length,1);
    assert.ok(fs.readdirSync(path.join(c.dir,'offline')).some(name=>name.startsWith('before-restore-')));
  }finally{c.close();}
});
test('Android login prompts before consuming code, independent of network',async()=>{
  const c=await context();try{
    const state=c.api.read().snapshot;state.tasks=[task()];assert.equal(c.api.commit(state,state.version).ok,true);
    const prompt=await c.api.cloud('login',{email:'test@example.com',code:'123456'});
    assert.equal(prompt.needsLocalChoice,true);assert.equal(prompt.taskCount,1);
    const changed=await c.api.cloud('login',{localDataChoice:'copy',localVersion:0});assert.equal(changed.choiceChanged,true);
  }finally{c.close();}
});
test('Android account session resumes without profile reload loop and syncs through native HTTP adapter',async()=>{
  let document=null,version=0;
  const user={id:'android-user',identities:[{address:'android@example.com'}]};
  const request=async(url,method,headers,body)=>{
    if(url.endsWith('/auth/login'))return {user,token:'test-only-token'};
    assert.equal(headers.Authorization,'Bearer test-only-token');
    if(url.endsWith('/sync')&&method==='PUT'){assert.equal(body.version,version);document=body.document;version++;return {version};}
    if(url.endsWith('/sync'))return {document,version,user};
    return {};
  };
  const first=await context({request});let second;
  try{
    const original=first.api.read().snapshot;original.tasks=[task()];assert.equal(first.api.commit(original,0).ok,true);
    await first.api.cloud('login',{email:'android@example.com',code:'123456',localDataChoice:'copy',localVersion:1});
    const session=fs.readFileSync(path.join(first.dir,'session/cloud-session.json'),'utf8');assert.match(session,/sealed:/);
    first.bridge.close();
    second=await context({dir:first.dir,request});
    const resumed=second.api.read();assert.equal(resumed.ok,true,resumed.error);assert.equal(resumed.snapshot.tasks.length,1);
    assert.equal(second.api.cloudStatus().user.id,user.id);
    const status=await second.api.cloud('sync');assert.equal(status.error,'');assert.equal(status.pending,false);assert.equal(document.tasks[0].title,'手机任务');
    const edited=second.api.read().snapshot;edited.tasks[0].title='安卓离线编辑';assert.equal(second.api.commit(edited,edited.version).ok,true);
    await second.api.cloud('sync');assert.equal(document.tasks[0].title,'安卓离线编辑');
    assert.equal(JSON.parse(fs.readFileSync(path.join(first.dir,'offline/backups',fs.readdirSync(path.join(first.dir,'offline/backups'))[0]),'utf8')).tasks[0].title,'手机任务');
  }finally{if(second)second.bridge.close();first.close();}
});
