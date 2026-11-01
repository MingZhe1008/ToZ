const {spawn}=require('node:child_process');
function createDesktopLayer(window,{executable,onError=console.error}={}){
  let child,disposed=false,last='',ready=false;
  if(process.platform!=='win32')return {apply(settings){window.setAlwaysOnTop(settings.widgetPinned);},dispose(){}};
  executable=executable||require('../scripts/build-desktop-layer.cjs').buildDesktopLayer();
  const handle=window.getNativeWindowHandle();
  const hwnd=handle.length===8?handle.readBigUInt64LE().toString():String(handle.readUInt32LE());
  child=spawn(executable,[hwnd,String(process.pid)],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  const send=()=>{if(!disposed&&!child.killed&&child.stdin.writable)child.stdin.write(last+'\n');};
  child.on('spawn',()=>{ready=true;if(last)send();});
  child.on('error',error=>onError('桌面浮窗控制失败：'+error.message));
  child.stderr.on('data',data=>onError('桌面浮窗：'+data.toString().trim()));
  child.stdout.on('data',()=>{});
  child.stdin.on('error',()=>{});
  child.on('exit',code=>{if(!disposed&&code!==0)onError('桌面浮窗辅助程序已退出：'+code);});
  return {
    apply({widgetPinned,widgetVisible}){
      window.setAlwaysOnTop(widgetPinned);
      last=(widgetPinned?'pinned':'desktop')+' '+(widgetVisible?'visible':'hidden');
      if(ready)send();
    },
    dispose(){if(disposed)return;disposed=true;child.stdin.end('stop\n');}
  };
}
module.exports={createDesktopLayer};
