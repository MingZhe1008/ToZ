export function confirmConflict(choice){
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog');
    dialog.innerHTML='<form method="dialog"><h2>确认处理同步冲突？</h2><p></p><div class="dialog-actions"><button class="button secondary" value="cancel" autofocus>取消</button><button class="button primary" value="confirm">确认选择</button></div></form>';
    dialog.querySelector('p').textContent=`冲突项将使用${choice==='cloud'?'云端':'本机'}版本，其余修改继续合并。替换本机前会保留安全副本。关联约束无法联合满足时使用完整的一侧。`;
    document.body.append(dialog);
    dialog.addEventListener('close',()=>{const confirmed=dialog.returnValue==='confirm';dialog.remove();resolve(confirmed);},{once:true});
    dialog.showModal();dialog.querySelector('[autofocus]').focus();
  });
}
