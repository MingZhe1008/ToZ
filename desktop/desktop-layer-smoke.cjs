const {app,BrowserWindow}=require('electron');
const {spawn,execFile}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const output=path.resolve('artifacts/desktop-layer');fs.mkdirSync(output,{recursive:true});
app.setPath('userData',path.resolve('.runtime/desktop-layer-probe'));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const toggle=()=>new Promise((resolve,reject)=>execFile(path.join(process.env.WINDIR,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-Command','(New-Object -ComObject Shell.Application).ToggleDesktop()'],{windowsHide:true},error=>error?reject(error):resolve()));
app.whenReady().then(async()=>{
  let widget,cover,child,controller,toggled=false;const checks=[];
  try{
    widget=new BrowserWindow({x:100,y:100,width:330,height:430,frame:false,transparent:true,skipTaskbar:true,show:false});
    await widget.loadURL('data:text/html,<body style="background:%2329292c;color:white;font:24px system-ui">ToZ desktop probe</body>');widget.showInactive();
    const hwnd=widget.getNativeWindowHandle().readBigUInt64LE().toString();
    child=spawn(require('../scripts/build-desktop-layer.cjs').buildDesktopLayer(),[hwnd,String(process.pid)],{windowsHide:true});
    child.stderr.on('data',data=>console.error(data.toString()));
    let buffer='',queue=[];child.stdout.on('data',data=>{buffer+=data;let at;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);queue.shift()?.(JSON.parse(line));}});
    const command=value=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Native helper timeout')),5000);queue.push(value=>{clearTimeout(timer);resolve(value);});child.stdin.write(value+'\n');});
    const initial=await command('desktop visible');checks.push({name:'desktop owner assigned',...initial});if(initial.owner==='0'||initial.topmost)throw new Error('Desktop owner was not assigned');
    cover=new BrowserWindow({x:80,y:80,width:420,height:550,title:'ToZ isolation cover',show:false});await cover.loadURL('data:text/html,<body>Application above desktop widget</body>');cover.show();cover.focus();await delay(700);
    const coverHwnd=cover.getNativeWindowHandle().readBigUInt64LE().toString();
    const covered=await command('desktop visible '+coverHwnd);checks.push({name:'application opened',...covered,widgetHwnd:hwnd,coverHwnd,widgetTopmost:widget.isAlwaysOnTop()});
    if(!covered.covered)throw new Error('Application must cover the desktop widget');
    await toggle();toggled=true;await delay(1000);
    const shown=await command('desktop visible');checks.push({name:'show desktop',...shown,coverMinimized:cover.isMinimized(),widgetBounds:widget.getBounds()});
    if(!shown.visible||shown.iconic||shown.cloaked!==0)throw new Error('Show Desktop did not retain the widget');
    await toggle();toggled=false;await delay(700);
    const returned=await command('desktop visible '+coverHwnd);checks.push({name:'return to applications',...returned,coverMinimized:cover.isMinimized()});if(!returned.covered)throw new Error('Application must remain above the desktop widget');
    const pinned=await command('pinned visible');checks.push({name:'detach desktop owner for pinned',...pinned});if(pinned.owner!=='0'||!pinned.topmost)throw new Error('Pinned mode did not restore a topmost window');
    const bottom=await command('desktop visible '+coverHwnd);checks.push({name:'return from pinned to desktop',...bottom});if(bottom.topmost||!bottom.covered)throw new Error('Default mode did not return to the bottom');
    widget.minimize();await delay(800);const recovered=await command('desktop visible');checks.push({name:'recover shell minimization',...recovered});if(recovered.iconic||!recovered.visible)throw new Error('Desktop widget did not recover minimization');
    const hidden=await command('desktop hidden');widget.hide();await delay(800);checks.push({name:'explicit hidden remains hidden',visible:widget.isVisible()});if(widget.isVisible())throw new Error('Explicitly hidden widget resurrected');
    const exited=new Promise(resolve=>child.once('exit',resolve));child.stdin.end('stop\n');await exited;child=null;
    widget.showInactive();controller=require('./desktop-layer.cjs').createDesktopLayer(widget);
    controller.apply({widgetPinned:false,widgetVisible:true});await delay(700);
    if(!widget.isVisible()||widget.isAlwaysOnTop())throw new Error('Application bridge did not enter desktop mode');checks.push({name:'application bridge default mode',visible:widget.isVisible(),topmost:widget.isAlwaysOnTop()});
    controller.apply({widgetPinned:true,widgetVisible:true});await delay(700);if(!widget.isAlwaysOnTop())throw new Error('Application bridge did not pin widget');checks.push({name:'application bridge pinned mode',topmost:widget.isAlwaysOnTop()});
    controller.apply({widgetPinned:false,widgetVisible:false});await delay(700);if(widget.isVisible())throw new Error('Application bridge did not hide widget');checks.push({name:'application bridge hide/logout',visible:widget.isVisible()});
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:true,checks},null,2));console.log(JSON.stringify(checks));
  }catch(error){fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:false,error:error.stack,checks},null,2));console.error(error);process.exitCode=1;}
  finally{if(toggled)await toggle();controller?.dispose();child?.stdin.end('stop\n');cover?.destroy();widget?.destroy();app.exit(process.exitCode||0);}
});
