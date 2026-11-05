const fs=require('node:fs');
const path=require('node:path');
module.exports=async({store,openSettingsWindow,getSettings,widgetWindow,outputDirectory})=>{
  const checks=[],states=[];const js=(window,code)=>window.webContents.executeJavaScript(code);
  const check=(pass,name)=>{if(!pass)throw new Error(name+' '+JSON.stringify(states));checks.push(name);};
  const wait=async fn=>{for(let i=0;i<100;i++){if(await fn())return;await new Promise(resolve=>setTimeout(resolve,40));}throw new Error('等待设置更新超时 '+JSON.stringify(states));};
  const state=async window=>({stored:store.settings().widgetPinned,native:widgetWindow.isAlwaysOnTop(),...await js(window,`(()=>{const input=document.querySelector('[data-preference="widgetPinned"]');return {checked:input?.checked,disabled:input?.disabled,all:[...document.querySelectorAll('[data-preference]')].map(i=>({key:i.dataset.preference,checked:i.checked}))};})()`)});
  check(store.settings().widgetPinned===false,'新建 / 重启副本默认关闭');
  await openSettingsWindow('startup');let settings=getSettings();await wait(async()=>await js(settings,`!!document.querySelector('[data-preference="widgetPinned"]')&&!document.querySelector('#settings-startup').hidden`));
  states.push(await state(settings));check(states.at(-1).checked===false,'设置首帧与默认关闭一致');
  const click=async expected=>{
    const point=await js(settings,`(()=>{const r=document.querySelector('[data-preference="widgetPinned"]+span').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);
    settings.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});settings.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});
    await new Promise(resolve=>setTimeout(resolve,500));states.push(await state(settings));
    check(states.at(-1).stored===expected&&states.at(-1).checked===expected&&states.at(-1).native===expected,'点击开关保存并应用 '+expected);
  };
  await click(true);await click(false);
  settings.close();await wait(()=>!getSettings());await openSettingsWindow('startup');settings=getSettings();await wait(async()=>await js(settings,`!!document.querySelector('[data-preference="widgetPinned"]')&&!document.querySelector('#settings-startup').hidden`));
  states.push(await state(settings));check(states.at(-1).checked===false&&states.at(-1).stored===false,'关闭设置后重新打开仍为关闭');
  settings.show();await js(settings,`document.querySelector('[data-settings-tab="startup"]').click();new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);fs.mkdirSync(outputDirectory,{recursive:true});fs.writeFileSync(path.join(outputDirectory,'pin-off.png'),(await settings.webContents.capturePage()).toPNG());
  const {Store}=require('./store.cjs');const reopened=new Store(store.directory);try{check(reopened.settings().widgetPinned===false,'重新打开 SQLite 后关闭选择保留');}finally{reopened.close();}
  return {checks,states,scope:'window pin switch persistence only',dataDirectory:store.directory};
};
