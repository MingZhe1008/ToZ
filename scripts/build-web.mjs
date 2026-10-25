import fs from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';
const root=path.resolve(import.meta.dirname,'..'),output=path.join(root,'dist/web');
fs.mkdirSync(output,{recursive:true});
for(const name of fs.readdirSync(path.join(root,'prototype')))if(/\.(css|svg)$/.test(name))fs.copyFileSync(path.join(root,'prototype',name),path.join(output,name));
for(const [from,to] of [['mobile/mobile.css','mobile.css'],['web/web.css','web.css'],['node_modules/sql.js/dist/sql-wasm.js','sql-wasm.js'],['node_modules/sql.js/dist/sql-wasm.wasm','sql-wasm.wasm'],['node_modules/sql.js/LICENSE','sql.js-LICENSE.txt']])fs.copyFileSync(path.join(root,from),path.join(output,to));
let html=fs.readFileSync(path.join(root,'prototype/index.html'),'utf8')
  .replace("script-src 'self'", "script-src 'self' 'wasm-unsafe-eval'")
  .replace("connect-src 'none'", "connect-src 'self'")
  .replace('<html lang="zh-CN">','<html lang="zh-CN" class="web-starting">')
  .replace('<script src="./desktop-mode.js"></script>','<script src="./sql-wasm.js"></script>')
  .replace('width=device-width, initial-scale=1','width=device-width, initial-scale=1, viewport-fit=cover')
  .replace('</head>','<link rel="stylesheet" href="./mobile.css"><link rel="stylesheet" href="./web.css"></head>')
  .replace('<body>','<body><main id="web-loading" class="web-loading"><h1>ToZ</h1><p>正在打开你的工作台…</p></main>')
  .replace('<script type="module" src="./app.mjs"></script>','<script type="module" src="./bootstrap.js"></script>')
  .replace('<script type="module" src="./cloud-ui.mjs"></script>','');
fs.writeFileSync(path.join(output,'index.html'),html);
const adapter=path.join(root,'web/node-adapters.mjs');
await build({entryPoints:[path.join(root,'web/runtime.mjs')],outfile:path.join(output,'runtime.js'),bundle:true,format:'esm',platform:'browser',target:'chrome105',inject:[adapter],plugins:[{name:'browser-adapters',setup(b){b.onResolve({filter:/^node:(fs|path|sqlite|util)$/},()=>({path:adapter}));}}]});
await build({entryPoints:[path.join(root,'web/app.mjs')],outfile:path.join(output,'app.js'),bundle:true,format:'esm',platform:'browser',target:'chrome105'});
fs.copyFileSync(path.join(root,'web/bootstrap.mjs'),path.join(output,'bootstrap.js'));
console.log('Web assets prepared:',output);
