import {cloudPresentation} from './cloud-status.mjs';
const api=window.toz;
const $=id=>document.getElementById(id);
export function refreshCloudChrome(state=api?.cloudStatus?.()){
  const presentation=cloudPresentation(state),badge=document.querySelector('.local-pill'),footer=$('save-status');
  if(badge){badge.textContent=presentation.badge;badge.title=presentation.title;badge.hidden=false;}
  if(footer&&!footer.classList.contains('error')){footer.replaceChildren();const dot=document.createElement('span');dot.className='live-dot';footer.append(dot,document.createTextNode(presentation.save));footer.title=presentation.title;}
  document.querySelectorAll('[data-cloud-save-label]').forEach(label=>{if(!label.dataset.saveError){label.textContent=presentation.save;label.title=presentation.title;}});
  const note=document.querySelector('[data-cloud-footnote]');if(note)note.textContent=presentation.footnote;
  const signed=!!state?.user,email=state?.user?.identities?.[0]?.address||'',name=signed?state.user.nickname||email.split('@')[0]||'我的账号':'离线使用';
  if($('sidebar-account-name')){
    $('sidebar-account-name').textContent=name;$('sidebar-account-detail').textContent=signed?'个人账号':'点击登录账号';$('account-launcher').title=signed?email:'离线使用 · 点击登录账号';
    $('account-menu-name').textContent=signed?state.user.nickname||'我的账号':'离线使用';$('account-menu-email').textContent=email||'登录后可同步多台电脑';
    const avatar=state?.user?.avatar;
    document.querySelectorAll('[data-account-avatar]').forEach(container=>{
      if(avatar?.startsWith('data:image/png;base64,')){
        if(container.querySelector('img')?.getAttribute('src')!==avatar){const image=document.createElement('img');image.alt='';image.src=avatar;container.replaceChildren(image);}
      }else container.textContent=signed?Array.from(name)[0]?.toLocaleUpperCase()||'T':'T';
    });
    for(const action of ['avatar','reset-avatar','logout','nickname'])document.querySelector(`[data-account-command="${action}"]`).disabled=!signed||action==='reset-avatar'&&!avatar;
    document.querySelector('[data-account-command="account"]').textContent=signed?'账号与同步':'登录账号';
  }
}
refreshCloudChrome();
const launcher=$('account-launcher'),menu=$('account-menu');
let accountCommand;
function closeAccountMenu(focus=false){if(!menu)return;menu.hidden=true;launcher.setAttribute('aria-expanded','false');if(focus)launcher.focus();}
launcher?.addEventListener('click',()=>{
  if(!menu.hidden){closeAccountMenu();return;}
  refreshCloudChrome();menu.hidden=false;launcher.setAttribute('aria-expanded','true');
  const anchor=launcher.getBoundingClientRect(),box=menu.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(anchor.left,innerWidth-box.width-8))+'px';menu.style.top=Math.max(8,anchor.top-box.height-8)+'px';menu.querySelector('button:not(:disabled)')?.focus();
});
menu?.addEventListener('click',event=>{const button=event.target.closest('[data-account-command]');if(!button||button.disabled)return;closeAccountMenu();const action=button.dataset.accountCommand;if(['account','settings'].includes(action))document.dispatchEvent(new CustomEvent('toz:account-open',{detail:action}));else if(action==='nickname'){const input=$('nickname-form').elements.nickname;input.value=api.cloudStatus().user?.nickname||'';input.setCustomValidity('');$('nickname-error').textContent='';$('nickname-dialog').showModal();input.focus();input.select();}else accountCommand?.(action);});
document.addEventListener('pointerdown',event=>{if(!event.target.closest('#account-menu,#account-launcher'))closeAccountMenu();});
document.addEventListener('keydown',event=>{
  if(!menu||menu.hidden)return;
  if(event.key==='Escape'){event.preventDefault();closeAccountMenu(true);}
  else if(['ArrowUp','ArrowDown','Home','End'].includes(event.key)){event.preventDefault();const buttons=[...menu.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length]?.focus();}
  else if(event.key==='Tab')closeAccountMenu();
});
window.addEventListener('resize',()=>closeAccountMenu());window.addEventListener('blur',()=>closeAccountMenu());
if(api?.cloud){
  $('cloud-offline-note').hidden=true;
  let working=false;
  const cooldowns=new Map();
  function render(state){
    const presentation=cloudPresentation(state);refreshCloudChrome(state);
    const signed=!!state.user;
    $('cloud-login-form').hidden=signed;$('cloud-signed-in').hidden=!signed;
    $('cloud-account-name').textContent=presentation.account;
    $('cloud-state').textContent=presentation.detail;
    $('cloud-status-dot').textContent=state.busy?'◌':signed&&!state.error?'●':'○';
    $('cloud-error').textContent=state.error||'';
    $('cloud-identities').textContent='已绑定：'+(state.user?.identities||[]).map(i=>i.address).join('、');
    $('cloud-conflict').hidden=!state.conflicts?.length;
    $('cloud-conflict-list').textContent=state.conflicts?.length?`${state.conflicts.length} 处冲突。双方内容已保留，请选择冲突项使用的版本。`:'';
    $('cloud-sync-now').disabled=working||state.busy;
    $('cloud-controls').hidden=false;
  }
  render(api.cloudStatus());
  api.onCloud(state=>render(state));
  async function run(fn){
    if(working)return;working=true;
    document.querySelectorAll('#cloud-controls button,#nickname-dialog button,#nickname-dialog input').forEach(b=>b.disabled=true);
    try{const result=await fn();render(result?.user!==undefined||result?.server?result:await api.cloud('status'));}
    catch(e){$('cloud-error').textContent=e.message;if($('nickname-dialog').open)$('nickname-error').textContent=e.message;document.dispatchEvent(new CustomEvent('toz:account-feedback',{detail:e.message}));}
    finally{working=false;document.querySelectorAll('#cloud-controls button,#nickname-dialog button,#nickname-dialog input').forEach(b=>b.disabled=false);updateCooldowns();}
  }
  accountCommand=action=>run(()=>api.cloud(action));
  $('nickname-form').elements.nickname.addEventListener('input',event=>{const value=event.target.value.trim();event.target.setCustomValidity(Array.from(value).length>30?'昵称最多 30 个字符':'');});
  $('nickname-form').addEventListener('submit',event=>{event.preventDefault();run(async()=>{const result=await api.cloud('nickname',{nickname:event.currentTarget.elements.nickname.value});$('nickname-dialog').close();return result;});});
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
  function refresh(){if(working)return;render(api.cloudStatus());}
  document.addEventListener('toz:settings-tab',event=>{if(event.detail==='account')refresh();});
  api.onProfile(()=>{for(const form of [$('cloud-login-form'),$('cloud-bind-form')])form.reset();});
}
