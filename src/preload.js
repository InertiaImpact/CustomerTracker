const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('trackerApi', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  appendVisit: (row) => ipcRenderer.invoke('data:appendVisit', row),
  readVisits: () => ipcRenderer.invoke('data:readVisits'),
  listDataFiles: () => ipcRenderer.invoke('data:listFiles'),
  readVisitsFromFile: (fileName) => ipcRenderer.invoke('data:readVisitsFromFile', fileName),
  copyFileToActive: (fileName) => ipcRenderer.invoke('data:copyFileToActive', fileName),
  backupAndClearData: () => ipcRenderer.invoke('data:backupAndClear'),
  toggleFullscreen: () => ipcRenderer.invoke('window:toggleFullscreen'),
  getFullscreen: () => ipcRenderer.invoke('window:getFullscreen'),
});
