const fs=require('node:fs');
const path=require('node:path');
const {isDeepStrictEqual:equal}=require('node:util');
const {documentOf,mergeDocuments,validateDocument}=require('./sync-model.cjs');
const DEFAULT_URL='https://82.157.65.130';
class Cloud {
  constructor({directory,getStore,switchProfile,seal,unseal,notify=()=>{},url=DEFAULT_URL,request=fetch}){
    Object.assign(this,{directory,getStore,switchProfile,seal,unseal,notify,url,request});
    this.filename=path.join(directory,'cloud-session.json');this.lastError='';this.busyWrite=false;this.lastSync=null;
    try{const saved=JSON.parse(fs.readFileSync(this.filename,'utf8'));this.user=saved.user;this.token=unseal(saved.token);this.switchProfile(this.user.id,false);}catch{this.user=null;this.token=null;}
  }
  saveSession(){
    const token=this.seal(this.token),temporary=this.filename+'.tmp';
    fs.writeFileSync(temporary,JSON.stringify({user:this.user,token}),{mode:0o600});fs.renameSync(temporary,this.filename);
  }
  status(){return {user:this.user,server:this.url,busy:!!this.running,pending:!!this.user&&!equal(documentOf(this.getStore().snapshot()),this.getStore().meta('cloudBase',null)),error:this.lastError,lastSync:this.lastSync,conflicts:this.conflict?.names||[],phoneAvailable:false};}
  async api(route,body,method){
    const res=await this.request(this.url+route,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json',...(this.token?{Authorization:'Bearer '+this.token}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(25000)});
    const result=await res.json();if(!res.ok)throw Object.assign(new Error(result.error||'云服务暂时不可用'),{status:res.status});return result;
  }
  async code(email,purpose='login'){return this.api('/auth/code',{email,purpose});}
  async login(email,code,importLocal){
    if(this.user)throw new Error('请先退出当前账号');
    if(this.running)throw new Error('正在同步，请稍后重试');
    const result=await this.api('/auth/login',{email,code});
    // Encrypt before changing stores, so an unavailable Windows vault cannot strand the profile.
    this.seal(result.token);
    this.switchProfile(result.user.id,importLocal);
    this.user=result.user;this.token=result.token;this.saveSession();this.conflict=null;this.lastError='';
    await this.sync();return this.status();
  }
  async bind(email,code){
    if(!this.user)throw new Error('请先登录');
    const result=await this.api('/auth/bind',{email,code});this.user=result.user;this.saveSession();return this.status();
  }
  async avatar(avatar){
    if(!this.user)throw new Error('请先登录账号');
    if(this.running)await this.running;
    const result=await this.api('/account/avatar',{avatar},'PUT');this.user=result.user;this.saveSession();return this.status();
  }
  async logout(){
    if(this.running)throw new Error('正在同步，请稍后退出');
    try{await this.api('/auth/logout',{});}catch{/* Local logout remains available offline. */}
    fs.rmSync(this.filename,{force:true});this.user=null;this.token=null;this.conflict=null;this.lastError='';this.lastSync=null;this.switchProfile(null,false);return this.status();
  }
  sync(choice){
    if(this.authBusy)return Promise.resolve(this.status());
    if(this.running)return this.running;
    if(!this.user)return Promise.resolve(this.status());
    this.running=this.performSync(choice).catch(e=>{this.lastError=e.name==='TimeoutError'?'连接云服务超时，离线修改已保留':e instanceof TypeError?'无法连接云服务，离线修改已保留':e.message;return this.status();}).finally(()=>{this.busyWrite=false;this.running=null;this.notify();}).then(()=>this.status());
    this.notify();return this.running;
  }
  async performSync(choice){
    const remote=await this.api('/sync'),store=this.getStore(),snapshot=store.snapshot(),local=documentOf(snapshot),base=store.meta('cloudBase',null);
    if(remote.user?.id===this.user.id&&!equal(remote.user,this.user)){this.user=remote.user;this.saveSession();}
    if(!Number.isSafeInteger(remote.version)||remote.version<0)throw new Error('云端版本格式无效');
    if(remote.document!==null)validateDocument(remote.document);
    if(choice&&(!this.conflict||remote.version!==this.conflict.remoteVersion||!equal(local,this.conflict.local)))throw new Error('数据已变化，请重新同步并确认冲突');
    const merged=mergeDocuments(base,local,remote.document,choice);
    if(merged.conflicts.length&&!choice){this.conflict={names:merged.conflicts,local,remoteVersion:remote.version};this.lastError='存在冲突，请在账号与同步中选择保留版本';return this.status();}
    if(!equal(local,merged.document)){
      // Confirm local data is valid before publishing to the server.
      validateDocument(merged.document);
    }
    this.busyWrite=true;
    try{
      if(!equal(remote.document,merged.document))await this.api('/sync',{version:remote.version,document:merged.document},'PUT');
      if(!equal(local,merged.document))store.applyCloud(merged.document,snapshot.version);
      if(!equal(base,merged.document))store.setMeta('cloudBase',merged.document);this.conflict=null;this.lastError='';this.lastSync=new Date().toISOString();
    }finally{this.busyWrite=false;}
    return this.status();
  }
}
module.exports={Cloud,DEFAULT_URL};
