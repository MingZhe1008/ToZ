const path=require('node:path');
// Scope startup to the signed-in user, including machine-wide installations.
function createStartup(app,{name='ToZ',executable=process.execPath}={}){
  const options={name,path:executable,args:['--autostart']};
  const state=()=>{
    // Electron versions differ in parsing unquoted executable paths containing spaces.
    const entries=[executable,`"${executable}"`].flatMap(candidate=>app.getLoginItemSettings({path:candidate,args:options.args}).launchItems||[]);
    // launchItems.args excludes Chromium switches such as --autostart. Identify
    // our Run entry by its exact name, user scope and executable instead.
    const item=entries.find(item=>item.name===name&&item.scope==='user'&&path.win32.normalize(item.path.replace(/^"|"$/g,'')).toLowerCase()===path.win32.normalize(executable).toLowerCase());
    return {autoLaunch:!!item,startupEnabled:!!item?.enabled};
  };
  return {state,set(enabled){
    if(typeof enabled!=='boolean')throw new Error('无效自启动设置');
    app.setLoginItemSettings({...options,openAtLogin:enabled,enabled});
    const result=state();
    if(result.autoLaunch!==enabled)throw new Error('Windows 未能保存自启动设置，请检查账户权限后重试');
    if(enabled&&!result.startupEnabled)throw new Error('自启动已登记，但被 Windows 禁用。请在任务管理器的“启动应用”中启用 ToZ');
    return result;
  }};
}
module.exports={createStartup};
