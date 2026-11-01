const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
function buildDesktopLayer(){
  const root=path.resolve(__dirname,'..'),output=path.join(root,'.runtime/native/toz-desktop-layer.exe');
  const source=path.join(root,'desktop/desktop-layer.cs');
  if(fs.existsSync(output)&&fs.statSync(output).mtimeMs>=fs.statSync(source).mtimeMs)return output;
  fs.mkdirSync(path.dirname(output),{recursive:true});
  const compiler=path.join(process.env.WINDIR||'C:\\Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');
  const result=spawnSync(compiler,['/nologo','/target:exe','/platform:x64','/optimize+','/out:'+output,source],{encoding:'utf8',windowsHide:true});
  if(result.error||result.status!==0)throw new Error('桌面浮窗辅助程序编译失败：'+(result.error?.message||result.stdout||result.stderr));
  return output;
}
if(require.main===module)console.log(buildDesktopLayer());
module.exports={buildDesktopLayer};
