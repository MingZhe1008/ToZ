const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {dialog}=require('electron');
const {createTask}=require('../prototype/domain.mjs');
const {Cloud}=require('./cloud.cjs');
module.exports=async({getEntry,getMain,getWidget,getStore,returnToEntry,cloud,cloudTestEnv,outputDirectory})=>{
  fs.mkdirSync(outputDirectory,{recursive:true});
  const wait=async(fn)=>{for(let i=0;i<160;i++){if(await fn())return;await new Promise(resolve=>setTimeout(resolve,50));}throw new Error('启动流程等待超时');};
  const entryJS=code=>getEntry().webContents.executeJavaScript(code,true);
  assert(getEntry());assert.equal(getMain(),undefined);assert.equal(getWidget(),undefined);
  const original=getStore().snapshot();original.tasks.push(createTask('保留原离线任务','2026-10-25','ToZ','','2026-10-25'));getStore().commit(original,original.version);
  await wait(()=>entryJS("document.readyState==='complete'"));
  await new Promise(resolve=>setTimeout(resolve,200));
  fs.writeFileSync(path.join(outputDirectory,'entry-dark.png'),(await getEntry().webContents.capturePage()).toPNG());
  await entryJS("document.documentElement.dataset.theme='light'");
  await new Promise(resolve=>setTimeout(resolve,200));
  fs.writeFileSync(path.join(outputDirectory,'entry-light.png'),(await getEntry().webContents.capturePage()).toPNG());
  await entryJS("document.querySelector('#entry-offline').click()");
  await wait(()=>!getEntry()&&getMain()?.isVisible());assert.equal(getStore().snapshot().tasks[0].title,'保留原离线任务');
  await returnToEntry();assert(!getMain().isVisible());assert(!getWidget().isVisible());
  await entryJS("document.querySelector('#entry-email').value='entry@example.com';document.querySelector('#entry-send-code').click()");
  await wait(()=>cloudTestEnv.mail.has('entry@example.com'));
  await wait(()=>entryJS("!document.querySelector('#entry-login').disabled"));
  const originalConfirmation=dialog.showMessageBox;let copied=false;
  dialog.showMessageBox=async(owner,options)=>{if(options.title==='首次登录的数据处理'){copied=true;return {response:2};}return originalConfirmation(owner,options);};
  try{
    await entryJS(`document.querySelector('#entry-code').value=${JSON.stringify(cloudTestEnv.mail.get('entry@example.com'))};document.querySelector('#entry-login-form').requestSubmit()`);
    await wait(()=>!getEntry()&&cloud.user&&getMain().isVisible());
  }finally{dialog.showMessageBox=originalConfirmation;}
  assert(copied);await cloud.sync();assert.equal(getStore().snapshot().tasks[0].title,'保留原离线任务');
  // Loading a saved Windows-encrypted session supplies a user before the startup decision.
  const {safeStorage}=require('electron');let restoredId;
  const restored=new Cloud({directory:cloud.directory,getStore,switchProfile:id=>restoredId=id,seal:v=>safeStorage.encryptString(v).toString('base64'),unseal:v=>safeStorage.decryptString(Buffer.from(v,'base64'))});
  assert.equal(restored.user.id,cloud.user.id);assert.equal(restoredId,cloud.user.id);
  await getMain().webContents.executeJavaScript("window.toz.cloud('logout')",true);
  assert(getEntry()?.isVisible());assert(!getMain().isVisible());assert(!getWidget().isVisible());assert.equal(cloud.user,null);
  await entryJS("document.querySelector('#entry-offline').click()");await wait(()=>!getEntry()&&getMain().isVisible());
  assert.equal(getStore().snapshot().tasks[0].title,'保留原离线任务');
  return {ok:true,checks:['未选择前只有启动窗口，未创建主窗或浮窗','离线选择后进入任务界面','启动窗口验证码登录','首次复制离线数据','保存会话可在启动前恢复','退出账号返回启动选择','退出后再次离线使用'],realEmailSent:false};
};
