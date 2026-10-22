import path from 'node:path';
import { rcedit } from 'rcedit';
export default async function afterPack(context) {
  if(context.electronPlatformName!=='win32')return;
  await rcedit(path.join(context.appOutDir,'ToZ.exe'),{
    icon:path.resolve('build/icon.ico'),
    'file-version':context.packager.appInfo.version,
    'product-version':context.packager.appInfo.version,
    'version-string':{ProductName:'ToZ',FileDescription:'ToZ 离线待办',CompanyName:'ToZ',OriginalFilename:'ToZ.exe'},
    'requested-execution-level':'asInvoker'
  });
}
