const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {Store}=require('./store.cjs');
test('阅读偏好支持旧数据缺省、持久化、非法值拒绝，恢复任务不覆盖本机偏好',t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'toz-reading-'));
  const store=new Store(directory);
  t.after(()=>{store.close();if(path.dirname(directory)===os.tmpdir()&&path.basename(directory).startsWith('toz-reading-'))fs.rmSync(directory,{recursive:true,force:true});});
  assert.equal(store.snapshot().opacity,88);assert.equal(store.settings().largeText,false);assert.equal(store.settings().reduceTransparency,false);
  store.setMeta('opacity',76);store.setMeta('settings',{widgetPinned:true});
  assert.equal(store.settings().opacity,76);assert.equal(store.settings().largeText,false);assert.equal(store.settings().widgetPinned,true);
  const data=store.snapshot();store.updateSettings({largeText:true,reduceTransparency:true});
  const version=store.snapshot().version;
  assert.throws(()=>store.updateSettings({largeText:'true'}),/类型错误/);assert.equal(store.snapshot().version,version);
  const reopened=new Store(directory);try{assert.equal(reopened.settings().largeText,true);assert.equal(reopened.snapshot().settings.reduceTransparency,true);assert.equal(reopened.settings().opacity,76);}finally{reopened.close();}
  store.restore(data);assert.equal(store.settings().largeText,true);assert.equal(store.settings().reduceTransparency,true);assert.equal(store.settings().widgetPinned,true);
});
