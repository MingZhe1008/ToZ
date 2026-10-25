import '../prototype/app.mjs';
import {selectSettingsTab} from '../prototype/desktop-ui.mjs';

const $=selector=>document.querySelector(selector);
// Keep desktop business flows, replace only the native shell and navigation.
const header=document.createElement('header');header.className='mobile-header';
header.innerHTML='<button id="mobile-menu" aria-label="打开导航" aria-expanded="false">☰</button><strong>ToZ<span>让开始有迹可循</span></strong><button id="mobile-settings" aria-label="打开设置">设置</button>';
document.body.prepend(header);
const backdrop=document.createElement('button');backdrop.className='mobile-scrim';backdrop.ariaLabel='关闭导航';document.body.append(backdrop);
const tabs=document.createElement('nav');tabs.className='mobile-tabs';tabs.ariaLabel='主要导航';
tabs.innerHTML='<button data-mobile-view="today">今天</button><button data-mobile-view="calendar">日历</button><button data-mobile-view="all">全部</button><button data-mobile-view="new" aria-label="添加待办">＋ 待办</button>';
document.body.append(tabs);
const closeDetail=document.createElement('button');closeDetail.className='mobile-detail-back';closeDetail.textContent='‹ 返回清单';document.body.append(closeDetail);
const setDrawer=open=>{document.documentElement.classList.toggle('mobile-drawer',open);$('#mobile-menu').setAttribute('aria-expanded',String(open));};
$('#mobile-menu').onclick=()=>setDrawer(!document.documentElement.classList.contains('mobile-drawer'));
document.addEventListener('toz:account-open',()=>setDrawer(false));
backdrop.onclick=()=>setDrawer(false);
$('#mobile-settings').onclick=()=>{selectSettingsTab('appearance');$('#settings-dialog').showModal();};
const closeTask=()=>document.documentElement.classList.remove('mobile-detail');
closeDetail.onclick=closeTask;
tabs.onclick=event=>{
  const button=event.target.closest('button');if(!button)return;
  const name=button.dataset.mobileView;
  if(name==='new')document.querySelector('.toolbar-add')?.click();
  else{$(`[data-view="${name}"]`).click();closeTask();setDrawer(false);}
};
document.addEventListener('click',event=>{
  if(event.target.closest('.sidebar [data-view]')){setDrawer(false);closeTask();}
});
document.addEventListener('click',event=>{
  if(event.target.closest('[data-action="select"],[data-action="calendar-select"],[data-gantt="select"]'))document.documentElement.classList.add('mobile-detail');
},true);
window.tozMobileBack=()=>{
  const dialog=[...document.querySelectorAll('dialog[open]')].at(-1);
  if(dialog){dialog.close();return true;}
  if(document.documentElement.classList.contains('mobile-drawer')){setDrawer(false);return true;}
  if(document.documentElement.classList.contains('mobile-detail')){closeTask();return true;}
  return false;
};
const observer=new MutationObserver(()=>{
  const active=$('.sidebar [data-view].active')?.dataset.view;
  tabs.querySelectorAll('button').forEach(button=>{if(button.dataset.mobileView===active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
});
observer.observe($('.sidebar'),{attributes:true,subtree:true,attributeFilter:['class']});
// Desktop settings markup is shared, with unavailable system controls removed.
$('[data-settings-tab="startup"]').hidden=true;
$('#native-version').textContent='ToZ 1.1.5-android.1 · Android';
$('#native-data-path').textContent='应用私有目录 · SQLite · 按账号隔离';
$('.data-storage-description').textContent='任务先保存在本机 SQLite；登录后与 Windows 及其他安卓设备同步。';
$('.data-backup-description').textContent='每日最新快照保留十四份；卸载会移除本机数据，请先导出。';
$('#settings-about .settings-footnote').textContent='手机和平板离线可用；登录邮箱账号后，可与 Windows 和其他安卓设备同步。';
$('.setting-row:has([data-action="theme-light"]) small').textContent='主界面与弹层保持一致';
$('#guide-dialog .dialog-eyebrow').textContent='ToZ · Android 使用指南';
$('#guide-dialog .guide-intro').textContent='手机上的随手清单，平板上的完整工作台。';
const guideThird=$('#guide-dialog').querySelectorAll('.guide-item')[2];
guideThird.querySelector('b').textContent='本机优先，联网同步';
guideThird.querySelector('p').textContent='新建、完成和改期先写入本机；登录后在前台同步其他设备。';
$('#guide-dialog .prototype-note p').textContent='任务使用设备当前日期，保存在应用私有 SQLite。手机底部导航切换视图；侧栏提供分区和更多视图。卸载前请导出备份。';
$('.browser-only-note')?.remove();$('.reset-button')?.remove();
$('#native-data-actions').innerHTML='<button class="button secondary" id="mobile-import">从 JSON 备份恢复…</button>';
$('#mobile-import').onclick=()=>window.toz.command('import');
const note=document.querySelector('[data-cloud-footnote]');if(note)note.textContent='本机优先保存，联网后同步。后台持续同步和系统提醒暂未接入。';
const restore=document.createElement('dialog');restore.className='mobile-restore-dialog';
restore.innerHTML='<form method="dialog"><h2>从备份恢复？</h2><p id="mobile-restore-description"></p><p>将替换当前副本；恢复前自动另存安全副本。已登录时，恢复结果会参与后续同步。</p><div class="dialog-actions"><button value="cancel" class="button secondary" autofocus>取消</button><button id="mobile-confirm-restore" type="button" class="button primary">确认恢复</button></div><p class="form-error" role="alert"></p></form>';
document.body.append(restore);
document.addEventListener('toz:import-confirm',event=>{restore.querySelector('#mobile-restore-description').textContent=`备份包含 ${event.detail} 项任务。`;restore.querySelector('.form-error').textContent='';restore.showModal();restore.querySelector('[autofocus]').focus();});
restore.addEventListener('close',()=>{window.tozPendingImport=null;});
$('#mobile-confirm-restore').onclick=()=>{try{window.tozConfirmImport();restore.close();closeTask();}catch(error){restore.querySelector('.form-error').textContent=error.message;}};
window.toz.onProfile(()=>{setDrawer(false);closeTask();});
if(!window.toz.read().ok){
  document.querySelectorAll('button,input').forEach(element=>element.disabled=true);
  const error=document.createElement('p');error.className='mobile-fatal';error.textContent='本地数据无法读取，已停止写入。请保留应用数据并联系维护人员。';document.body.append(error);
}
