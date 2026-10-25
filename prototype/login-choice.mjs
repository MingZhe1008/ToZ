function chooseLocalData(taskCount,changed){
  let dialog=document.getElementById('login-data-choice');
  if(!dialog){
    dialog=document.createElement('dialog');dialog.id='login-data-choice';dialog.className='login-choice-dialog';dialog.setAttribute('aria-labelledby','login-choice-title');dialog.setAttribute('aria-describedby','login-choice-description');
    dialog.innerHTML=`<form method="dialog"><div class="login-choice-top"><span>账号与数据</span><button type="button" data-choice-cancel aria-label="关闭">×</button></div><h2 id="login-choice-title">如何处理本机任务？</h2><p id="login-choice-description"></p><fieldset><legend>选择一种处理方式</legend><label class="login-choice-option"><input type="radio" name="choice" value="keep"><span><b>保留本机任务，进入账号</b><small>离线任务单独保留，不上传到账号。</small></span></label><label class="login-choice-option"><input type="radio" name="choice" value="copy"><span><b>复制本机任务到账号</b><small>首次建立账号副本时复制，并参与后续同步。</small></span></label></fieldset><p class="login-choice-note">原离线数据始终保留；已有的账号副本不会被重复复制覆盖。</p><div class="login-choice-actions"><button type="button" data-choice-cancel autofocus>取消</button><button type="submit" data-choice-continue disabled>继续登录</button></div></form>`;
    document.body.append(dialog);
    dialog.querySelectorAll('[data-choice-cancel]').forEach(button=>button.addEventListener('click',()=>dialog.close('')));
    dialog.querySelector('form').addEventListener('change',()=>{dialog.querySelector('[data-choice-continue]').disabled=!dialog.querySelector('input:checked');});
    dialog.querySelector('form').addEventListener('submit',event=>{event.preventDefault();const choice=dialog.querySelector('input:checked')?.value;if(choice)dialog.close(choice);});
  }
  dialog.querySelector('form').reset();dialog.returnValue='';
  dialog.querySelectorAll('button,input').forEach(control=>control.disabled=false);dialog.querySelector('[data-choice-continue]').disabled=true;
  dialog.querySelector('#login-choice-description').textContent=(changed?'本机数据已更新，请重新选择。':'')+`当前有 ${taskCount} 项离线任务。退出账号后，仍可选择离线使用并查看它们。`;
  return new Promise(resolve=>{dialog.addEventListener('close',()=>resolve(['keep','copy'].includes(dialog.returnValue)?dialog.returnValue:null),{once:true});dialog.showModal();dialog.querySelector('.login-choice-actions [data-choice-cancel]').focus();});
}
export async function loginWithDataChoice(api,credentials){
  let result=await api.cloud('login',credentials);
  while(result.needsLocalChoice){
    const choice=await chooseLocalData(result.taskCount,result.choiceChanged);if(!choice)return null;
    result=await api.cloud('login',{...credentials,localDataChoice:choice,localVersion:result.localVersion});
  }
  return result;
}
