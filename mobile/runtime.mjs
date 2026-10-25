import {Store,validateSnapshot} from '../desktop/store.cjs';
import {Cloud} from '../desktop/cloud.cjs';
import {call,mkdirSync} from './node-adapters.mjs';
import {chooseAvatar} from './avatar.mjs';
import {confirmConflict} from './confirm.mjs';

const listeners={state:[],cloud:[],profile:[],command:[]};
const emit=(type,value)=>listeners[type].forEach(fn=>fn(value));
const pending=new Map();let sequence=0,store,cloud,stopped=false,initializing=true;
const feedback=message=>document.dispatchEvent(new CustomEvent('toz:account-feedback',{detail:message}));
const request=(url,options={})=>new Promise((resolve,reject)=>{
  const id=String(++sequence);
  const timer=setTimeout(()=>{pending.delete(id);reject(new Error('连接云服务超时，离线修改已保留'));},55000);
  pending.set(id,{resolve,reject,timer});
  ToZAndroid.request(id,url,options.method||'GET',JSON.stringify(options.headers||{}),options.body||'');
});
function broadcast(){emit('state',store.snapshot());emit('cloud',cloud.status());}
function switchProfile(id,copy){
  if(id!==null&&!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw new Error('无效的账号标识');
  const directory=id?'profiles/'+id:'offline';
  const previous=store;
  const next=new Store(directory);
  if(copy&&next.snapshot().version===0&&previous)next.restore(previous.snapshot());
  store=next;
  if(previous)previous.close();
  // Profile versions are independent. Reload prevents old drafts / counters crossing accounts.
  if(previous&&!initializing){stopped=true;emit('profile');setTimeout(()=>location.reload(),0);}
}
function guarded(fn){try{return {ok:true,...fn()};}catch(error){return {ok:false,error:error.message,...(store?{snapshot:store.snapshot()}:{})};}}
function initialize(){
  mkdirSync('session');
  store=new Store('offline');
  cloud=new Cloud({directory:'session',getStore:()=>store,switchProfile,seal:token=>call('seal',token),unseal:token=>call('unseal',token),request,notify:()=>{if(!stopped)broadcast();}});
  stopped=false;
  initializing=false;
}
let startupError;
try{initialize();}catch(error){startupError=error;}
const ready=()=>{if(startupError)throw startupError;if(stopped)throw new Error('正在切换账号，请稍候');};
window.toz={
  platform:'android',surface:'main',
  read:()=>guarded(()=>{ready();return {snapshot:store.snapshot()};}),
  commit:(input,version)=>guarded(()=>{ready();if(cloud.busyWrite)throw new Error('正在应用同步，请稍后保存');const snapshot=store.commit(input,version);emit('cloud',cloud.status());return {snapshot,backupError:store.backupError};}),
  purge:(input,version)=>guarded(()=>{ready();if(cloud.busyWrite)throw new Error('正在同步，请稍后删除');return store.purge(input,version);}),
  settings:async()=>{ready();return {...store.settings(),version:'1.1.5-android.2',dataPath:'应用私有 SQLite（按账号隔离）'};},
  configure:async patch=>{ready();const result=store.updateSettings(patch);broadcast();return result;},
  cloudStatus:()=>cloud?.status()||{user:null,error:startupError?.message},
  cloud:async(action,args={})=>{
    ready();
    if(['login','logout','bind','nickname','avatar','reset-avatar'].includes(action)&&cloud.authBusy)throw new Error('账号操作正在进行');
    if(action==='status')return cloud.status();
    if(action==='code')return cloud.code(args.email,args.purpose);
    if(action==='sync')return cloud.sync();
    if(action==='resolve'){if(!['local','cloud'].includes(args.choice))throw new Error('请选择冲突版本');if(!await confirmConflict(args.choice))return cloud.status();return cloud.sync(args.choice);}
    if(action==='login'){
      if(cloud.user)throw new Error('请先退出当前账号');
      const snapshot=store.snapshot();
      if(snapshot.tasks.length&&(!['keep','copy'].includes(args.localDataChoice)||args.localVersion!==snapshot.version))return {needsLocalChoice:true,choiceChanged:args.localVersion!==undefined,taskCount:snapshot.tasks.length,localVersion:snapshot.version};
    }
    cloud.authBusy=true;
    try{
      let result;
      if(action==='login')result=await cloud.login(args.email,args.code,args.localDataChoice==='copy');
      else if(action==='logout')result=await cloud.logout();
      else if(action==='bind')result=await cloud.bind(args.email,args.code);
      else if(action==='nickname')result=await cloud.nickname(args.nickname);
      else if(action==='reset-avatar')result=await cloud.avatar(null);
      else if(action==='avatar'){const avatar=await chooseAvatar();result=avatar?await cloud.avatar(avatar):cloud.status();}
      else throw new Error('未知的账号操作');
      emit('cloud',cloud.status());return result;
    }finally{cloud.authBusy=false;}
  },
  command:async(name,args)=>{
    ready();
    if(name==='open-settings'){emit('command',{action:'settings',tab:args?.tab});return true;}
    if(name==='export'){
      const snapshot=store.snapshot();
      if(args?.taskId){snapshot.tasks=snapshot.tasks.filter(t=>t.id===args.taskId);snapshot.recurrences=snapshot.recurrences.filter(s=>snapshot.tasks.some(t=>t.repeatId===s.id)).map(s=>({...s,active:false}));}
      return call('export',`ToZ-${new Date().toLocaleDateString('sv-SE')}.json`,JSON.stringify(snapshot,null,2));
    }
    if(name==='import')return call('import');
    if(name==='quit')return call('quit');
    throw new Error('此功能仅适用于 Windows 桌面');
  },
  onState:fn=>listeners.state.push(fn),onCloud:fn=>listeners.cloud.push(fn),onProfile:fn=>listeners.profile.push(fn),onCommand:fn=>listeners.command.push(fn)
};
window.tozNativeEvent=(type,value)=>{
  if(type==='http'){
    const job=pending.get(value.id);if(!job)return;clearTimeout(job.timer);pending.delete(value.id);
    if(value.error)job.reject(new Error(value.error));else job.resolve({ok:value.status>=200&&value.status<300,status:value.status,json:async()=>JSON.parse(value.body)});
  }
  if(type==='feedback')feedback(value);
  if(type==='avatar-cancel')document.dispatchEvent(new CustomEvent('toz:avatar-cancel'));
  if(type==='import'){
    try{
      ready();if(cloud.running||cloud.authBusy)throw new Error('正在处理账号或同步，请完成后重试');
      const snapshot=JSON.parse(value);if(snapshot.schema!==1)throw new Error('不支持此备份版本');validateSnapshot(snapshot);
      window.tozPendingImport=snapshot;
      window.tozImportVersion=store.snapshot().version;
      document.dispatchEvent(new CustomEvent('toz:import-confirm',{detail:snapshot.tasks.length}));
    }catch(error){feedback(error.message);}
  }
};
window.tozConfirmImport=()=>{
  ready();if(cloud.running||cloud.authBusy)throw new Error('正在同步，请重新导入');
  if(!window.tozPendingImport)return;
  if(window.tozImportVersion!==undefined&&window.tozImportVersion!==store.snapshot().version)throw new Error('本机数据已更新，请重新选择备份并确认');
  store.restore(window.tozPendingImport);window.tozPendingImport=null;broadcast();feedback('已恢复备份，替换前的安全副本保存在应用内');
};
document.documentElement.classList.add('desktop','desktop-main','mobile');
document.documentElement.dataset.theme=window.toz.read().snapshot?.dark===false?'light':'dark';
const sync=()=>{if(!startupError&&!stopped&&!document.hidden)cloud.sync();};
setInterval(sync,15000);
window.tozMobileResume=sync;
document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});
document.addEventListener('DOMContentLoaded',()=>setTimeout(sync,0));
