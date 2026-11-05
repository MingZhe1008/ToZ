const {Store}=require('./store.cjs');
function openProfileStore(previous,directory,{importLocal=false,restoreSession=false}={}){
  const current=previous.snapshot(),next=new Store(directory);
  try{
    const hasSavedSettings=next.meta('settings',null)!==null;
    if(importLocal&&next.snapshot().version===0)next.restore(current);
    // At startup the offline store is only a bootstrap source. Its older values
    // must not replace settings saved in the resumed account on the last run.
    if(!restoreSession||!hasSavedSettings){
      next.setMeta('settings',current.settings);next.setMeta('dark',current.dark);next.setMeta('opacity',current.opacity);
    }
    next.setMeta('version',Math.max(next.snapshot().version,current.version)+1);
    return next;
  }catch(error){next.close();throw error;}
}
module.exports={openProfileStore};
