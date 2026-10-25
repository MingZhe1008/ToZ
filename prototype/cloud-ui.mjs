const api=window.toz;
const $=id=>document.getElementById(id);
if(api?.cloud){
  $('cloud-offline-note').hidden=true;$('cloud-controls').hidden=false;
  let working=false;
  const cooldowns=new Map();
  function render(state){
    const signed=!!state.user;
    $('cloud-login-form').hidden=signed;$('cloud-signed-in').hidden=!signed;
    $('cloud-account-name').textContent=signed?state.user.identities[0]?.address||'已登录':'尚未登录';
    $('cloud-state').textContent=state.busy?'正在同步…':state.error?'同步待处理':state.lastSync?'上次同步 '+new Date(state.lastSync).toLocaleTimeString('zh-CN'):signed?'已登录，等待同步':'离线数据仍会自动保存在此电脑。';
    $('cloud-status-dot').textContent=state.busy?'◌':signed&&!state.error?'●':'○';
    $('cloud-error').textContent=state.error||'';
    $('cloud-identities').textContent='已绑定：'+(state.user?.identities||[]).map(i=>i.address).join('、');
    $('cloud-conflict').hidden=!state.conflicts?.length;
    $('cloud-conflict-list').textContent=state.conflicts?.length?`${state.conflicts.length} 处冲突。双方内容已保留，请选择冲突项使用的版本。`:'';
    $('cloud-sync-now').disabled=working||state.busy;
  }
  async function run(fn){
    if(working)return;working=true;
    $('cloud-controls').querySelectorAll('button').forEach(b=>b.disabled=true);
    try{const result=await fn();render(result?.user!==undefined||result?.server?result:await api.cloud('status'));}
    catch(e){$('cloud-error').textContent=e.message;}
    finally{working=false;$('cloud-controls').querySelectorAll('button').forEach(b=>b.disabled=false);updateCooldowns();}
  }
  for(const purpose of ['login','bind']){
    const form=$(`cloud-${purpose}-form`),button=form.querySelector('[data-cloud-code]');
    button.addEventListener('click',()=>{
      const input=form.elements.email;if(!input.reportValidity())return;
      run(async()=>{await api.cloud('code',{email:input.value,purpose});cooldowns.set(purpose,Date.now()+60000);$('cloud-state').textContent='验证码已发送，请查看收件箱或垃圾邮件。';});
    });
    form.addEventListener('submit',event=>{event.preventDefault();run(async()=>{
      const result=await api.cloud(purpose,{email:form.elements.email.value,code:form.elements.code.value});form.elements.code.value='';return result;
    });});
  }
  function updateCooldowns(){for(const purpose of ['login','bind']){const button=document.querySelector(`[data-cloud-code="${purpose}"]`),left=Math.max(0,Math.ceil(((cooldowns.get(purpose)||0)-Date.now())/1000));button.textContent=left?`${left} 秒后重发`:'获取验证码';button.disabled=working||left>0;}}
  setInterval(updateCooldowns,1000);
  $('cloud-sync-now').addEventListener('click',()=>run(()=>api.cloud('sync')));
  $('cloud-logout').addEventListener('click',()=>run(()=>api.cloud('logout')));
  document.querySelectorAll('[data-cloud-resolve]').forEach(b=>b.addEventListener('click',()=>run(()=>api.cloud('resolve',{choice:b.dataset.cloudResolve}))));
  async function refresh(){if(working||$('settings-account').hidden)return;try{render(await api.cloud('status'));}catch(e){$('cloud-error').textContent=e.message;}}
  document.querySelector('[data-settings-tab="account"]').addEventListener('click',refresh);
  setInterval(refresh,3000);
  api.onProfile(()=>{for(const form of [$('cloud-login-form'),$('cloud-bind-form')])form.reset();});
}
