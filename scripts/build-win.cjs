const {spawnSync}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
const root=path.resolve(__dirname,'..');
const zip=require('7zip-bin').path7za;
if(!fs.existsSync(path.join(root,'node_modules/electron/dist/electron.exe'))){console.error('缺少 Electron 运行时，请运行 npm run install:runtime');process.exit(1);}
const env={...process.env,ELECTRON_BUILDER_7ZIP_PATH:zip};
for(const key of Object.keys(env))if(key.toLowerCase()==='path')delete env[key];
env.PATH=[path.join(process.env.WINDIR||'C:\\Windows','System32','WindowsPowerShell','v1.0'),path.join(process.env.WINDIR||'C:\\Windows','System32'),process.env.Path||process.env.PATH].join(path.delimiter);
delete env.ELECTRON_RUN_AS_NODE;
const artwork=spawnSync(path.join(process.env.WINDIR||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'build','generate-installer-art.ps1')],{cwd:root,env,stdio:'inherit',windowsHide:true});
if(artwork.error)console.error(artwork.error.message);
if(artwork.status!==0)process.exit(artwork.status??1);
const result=spawnSync(process.execPath,[require.resolve('electron-builder/cli.js'),'--config','electron-builder.json','--win','nsis','--x64'],{cwd:root,env,stdio:'inherit',windowsHide:true});
if(result.error)console.error(result.error.message);
if(result.status!==0)process.exit(result.status??1);
const installerUI=spawnSync(path.join(process.env.WINDIR||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts','build-installer-ui.ps1')],{cwd:root,env,stdio:'inherit',windowsHide:true});
if(installerUI.error)console.error(installerUI.error.message);
process.exit(installerUI.status??1);
