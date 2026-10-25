const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('toz', {
  surface: process.argv.includes('--toz-entry') ? 'entry' : process.argv.includes('--toz-settings') ? 'settings' : process.argv.includes('--toz-quick-add') ? 'quick-add' : process.argv.includes('--toz-widget') ? 'widget' : 'main',
  smoke: process.argv.includes('--toz-smoke'),
  read: () => ipcRenderer.sendSync('toz:read'),
  commit: (snapshot, version) => ipcRenderer.sendSync('toz:commit', {snapshot,version}),
  purge: (request, version) => ipcRenderer.sendSync('toz:purge', {request,version}),
  settings: () => ipcRenderer.invoke('toz:settings'),
  cloud: (action,argument) => ipcRenderer.invoke('toz:cloud',action,argument),
  cloudStatus: () => ipcRenderer.sendSync('toz:cloud-status'),
  onCloud: callback => { ipcRenderer.on('toz:cloud-state',(_,state)=>callback(state)); },
  enter: action => ipcRenderer.invoke('toz:entry',action),
  onProfile: callback => { ipcRenderer.on('toz:profile',()=>callback()); },
  configure: patch => ipcRenderer.invoke('toz:configure', patch),
  command: (name, argument) => ipcRenderer.invoke('toz:command', name, argument),
  onState: callback => { ipcRenderer.on('toz:state',(_,data)=>callback(data)); },
  onCommand: callback => { ipcRenderer.on('toz:ui-command',(_,data)=>callback(data)); }
});
