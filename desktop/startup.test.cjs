const test=require('node:test');
const assert=require('node:assert/strict');
const {createStartup}=require('./startup.cjs');
test('按 ToZ 名称读取当前账户启动项，兼容带空格路径与空 args',()=>{
  const executable='C:\\Program Files\\中文目录\\ToZ.exe';let entry=null;
  const app={getLoginItemSettings({path}){return {openAtLogin:false,launchItems:path.startsWith('"')&&entry?[entry]:[]};},setLoginItemSettings(options){entry=options.openAtLogin?{name:options.name,path:options.path,scope:'user',enabled:options.enabled,args:[]}:null;}};
  const startup=createStartup(app,{executable});assert.deepEqual(startup.state(),{autoLaunch:false,startupEnabled:false});assert.deepEqual(startup.set(true),{autoLaunch:true,startupEnabled:true});entry.enabled=false;assert.deepEqual(startup.state(),{autoLaunch:true,startupEnabled:false});assert.deepEqual(startup.set(false),{autoLaunch:false,startupEnabled:false});
});
test('其他用户范围或同名不同路径不算本程序的启动项，写入失败应报错',()=>{
  const executable='C:\\ToZ\\ToZ.exe';let entry={name:'ToZ',path:executable,scope:'machine',enabled:true};const app={getLoginItemSettings(){return {launchItems:[entry]};},setLoginItemSettings(){}};const startup=createStartup(app,{executable});assert.equal(startup.state().autoLaunch,false);entry={...entry,scope:'user',path:'C:\\Other\\ToZ.exe'};assert.equal(startup.state().autoLaunch,false);assert.throws(()=>startup.set(true),/未能保存/);
});
