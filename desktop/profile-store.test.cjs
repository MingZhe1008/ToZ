const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {Store}=require('./store.cjs'),{Cloud}=require('./cloud.cjs');
const {openProfileStore}=require('./profile-store.cjs');
function setup(t){const root=path.resolve('.runtime');fs.mkdirSync(root,{recursive:true});const directory=fs.mkdtempSync(path.join(root,'profile-settings-'));const stores=[];t.after(()=>{for(const store of stores)store.close();if(path.dirname(directory)===root&&path.basename(directory).startsWith('profile-settings-'))fs.rmSync(directory,{recursive:true,force:true});});const open=dir=>{const store=new Store(dir);stores.push(store);return store;};return {directory,stores,open};}
test('restored login keeps the saved account pin/reading/theme instead of stale offline preferences',t=>{
  const c=setup(t),offline=c.open(c.directory),accountDirectory=path.join(c.directory,'account');offline.updateSettings({widgetPinned:true,largeText:false,opacity:61});
  const account=c.open(accountDirectory);account.updateSettings({widgetPinned:false,largeText:true,opacity:75});account.setMeta('dark',false);
  fs.writeFileSync(path.join(c.directory,'cloud-session.json'),JSON.stringify({user:{id:'profile-test',identities:[]},token:'test-token'}));
  let active=offline;
  const cloud=new Cloud({directory:c.directory,getStore:()=>active,seal:x=>x,unseal:x=>x,switchProfile:()=>{active=openProfileStore(active,accountDirectory,{restoreSession:true});c.stores.push(active);}});
  assert.equal(cloud.user.id,'profile-test');assert.equal(active.settings().widgetPinned,false);assert.equal(active.settings().largeText,true);assert.equal(active.snapshot().dark,false);assert.equal(active.settings().opacity,75);
  const reopened=c.open(accountDirectory);assert.equal(reopened.settings().widgetPinned,false);
});
test('restoring a legacy profile without settings inherits local preferences',t=>{
  const c=setup(t),offline=c.open(c.directory);offline.updateSettings({widgetPinned:true,largeText:true,opacity:70});offline.setMeta('dark',false);
  const next=openProfileStore(offline,path.join(c.directory,'account'),{restoreSession:true});c.stores.push(next);assert.equal(next.settings().widgetPinned,true);assert.equal(next.settings().largeText,true);assert.equal(next.snapshot().dark,false);assert.equal(next.settings().opacity,70);
});
test('explicit login/logout carries current device preferences across profiles',t=>{
  const c=setup(t),offline=c.open(c.directory);offline.updateSettings({widgetPinned:true});const accountDirectory=path.join(c.directory,'account');
  const next=openProfileStore(offline,accountDirectory);c.stores.push(next);assert.equal(next.settings().widgetPinned,true);
  next.updateSettings({widgetPinned:false,largeText:true});const back=openProfileStore(next,c.directory);c.stores.push(back);assert.equal(back.settings().widgetPinned,false);assert.equal(back.settings().largeText,true);
});
test('restored login preserves an intentional pinned=true choice',t=>{
  const c=setup(t),offline=c.open(c.directory),directory=path.join(c.directory,'account');
  const account=c.open(directory);account.updateSettings({widgetPinned:true});
  const resumed=openProfileStore(offline,directory,{restoreSession:true});c.stores.push(resumed);assert.equal(resumed.settings().widgetPinned,true);
});
