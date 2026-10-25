import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.join(root,'android/app/src/main/assets/app');
fs.mkdirSync(output,{recursive:true});
for(const name of fs.readdirSync(path.join(root,'prototype'))){
  if(/\.(css|svg)$/.test(name))fs.copyFileSync(path.join(root,'prototype',name),path.join(output,name));
}
let html=fs.readFileSync(path.join(root,'prototype/index.html'),'utf8');
html=html.replace('<script src="./desktop-mode.js"></script>','<script src="./android-runtime.js"></script>')
  .replace('width=device-width, initial-scale=1','width=device-width, initial-scale=1, viewport-fit=cover')
  .replace('</head>','<link rel="stylesheet" href="./mobile.css"></head>')
  .replace(/<script type="module" src="\.\/app.mjs"><\/script>/,'<script type="module" src="./android-app.js"></script>')
  .replace('<script type="module" src="./cloud-ui.mjs"></script>','');
fs.writeFileSync(path.join(output,'index.html'),html);
fs.copyFileSync(path.join(root,'mobile/mobile.css'),path.join(output,'mobile.css'));
const adapter=path.join(root,'mobile/node-adapters.mjs');
await build({entryPoints:[path.join(root,'mobile/runtime.mjs')],outfile:path.join(output,'android-runtime.js'),bundle:true,format:'iife',platform:'browser',target:'chrome105',inject:[adapter],
  plugins:[{name:'android-native-adapters',setup(builder){builder.onResolve({filter:/^node:(fs|path|sqlite|util)$/},()=>({path:adapter}));}}]});
await build({entryPoints:[path.join(root,'mobile/app.mjs')],outfile:path.join(output,'android-app.js'),bundle:true,format:'esm',platform:'browser',target:'chrome105'});
console.log('Android assets prepared:',output);
