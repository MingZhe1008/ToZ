const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('toz', {
  surface: process.argv.includes('--toz-widget') ? 'widget' : 'main',
  smoke: process.argv.includes('--toz-smoke'),
  read: () => ipcRenderer.sendSync('toz:read'),
  commit: (snapshot, version) => ipcRenderer.sendSync('toz:commit', {snapshot,version}),
  purge: (request, version) => ipcRenderer.sendSync('toz:purge', {request,version}),
  settings: () => ipcRenderer.invoke('toz:settings'),
  configure: patch => ipcRenderer.invoke('toz:configure', patch),
  command: (name, argument) => ipcRenderer.invoke('toz:command', name, argument),
  onState: callback => { ipcRenderer.on('toz:state',(_,data)=>callback(data)); },
  onCommand: callback => { ipcRenderer.on('toz:ui-command',(_,data)=>callback(data)); }
});
