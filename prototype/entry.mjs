import {loginWithDataChoice} from './login-choice.mjs';
const api=window.toz,$=id=>document.getElementById(id);
let working=false,nextSend=0;
function update(){const seconds=Math.max(0,Math.ceil((nextSend-Date.now())/1000));$('entry-send-code').disabled=working||seconds>0;$('entry-send-code').textContent=seconds?`${seconds} 秒后重发`:'获取验证码';}
async function run(action){
  if(working)return;working=true;$('entry-error').textContent='';
  document.querySelectorAll('button,input').forEach(element=>element.disabled=true);
  try{await action();}catch(error){$('entry-error').textContent=error.message;}
  finally{working=false;document.querySelectorAll('button,input').forEach(element=>element.disabled=false);update();}
}
$('entry-send-code').addEventListener('click',()=>{
  if(!$('entry-email').reportValidity())return;
  run(async()=>{await api.cloud('code',{email:$('entry-email').value});nextSend=Date.now()+60000;$('entry-message').textContent='验证码已发送，请查看收件箱或垃圾邮件。';});
});
$('entry-login-form').addEventListener('submit',event=>{
  event.preventDefault();run(async()=>{
    const result=await loginWithDataChoice(api,{email:$('entry-email').value,code:$('entry-code').value});
    if(result?.user)await api.enter('account');
  });
});
$('entry-offline').addEventListener('click',()=>run(()=>api.enter('offline')));
setInterval(update,1000);
