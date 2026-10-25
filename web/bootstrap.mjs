function fail(message){document.documentElement.classList.remove('web-starting');document.body.replaceChildren();const main=document.createElement('main');main.className='web-loading';const title=document.createElement('h1');title.textContent='ToZ';const text=document.createElement('p');text.textContent=message;const retry=document.createElement('button');retry.textContent='重新加载';retry.onclick=()=>location.reload();main.append(title,text,retry);document.body.append(main);}
async function start(){
  globalThis.tozSQL=await globalThis.initSqlJs({locateFile:()=>new URL('./sql-wasm.wasm',import.meta.url).href});
  // Store's bundled domain module must see the real-device mode on first import.
  window.toz={platform:'web',surface:'main'};
  await import('./runtime.js');
  await import('./app.js');
  document.querySelector('#web-loading')?.remove();
  document.documentElement.classList.remove('web-starting');
}
if(!globalThis.isSecureContext||!navigator.locks)fail('请使用 HTTPS 和较新的浏览器打开 ToZ。');
else navigator.locks.request('toz-web-writer',{ifAvailable:true},async lock=>{
  if(!lock){fail('另一个标签页正在使用 ToZ。请关闭该标签页后重新加载，避免覆盖任务。');return;}
  try{await start();await new Promise(()=>{});}catch(error){fail('启动失败：'+error.message+'。浏览器原有数据未清除。');}
}).catch(error=>fail(error.message));
