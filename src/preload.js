const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('trackerApi', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  appendVisit: (row) => ipcRenderer.invoke('data:appendVisit', row),
  readVisits: () => ipcRenderer.invoke('data:readVisits'),
  listDataFiles: () => ipcRenderer.invoke('data:listFiles'),
  readVisitsFromFile: (fileName) => ipcRenderer.invoke('data:readVisitsFromFile', fileName),
  copyFileToActive: (fileName) => ipcRenderer.invoke('data:copyFileToActive', fileName),
  appendFileToActive: (fileName) => ipcRenderer.invoke('data:appendFileToActive', fileName),
  backupAndClearData: () => ipcRenderer.invoke('data:backupAndClear'),
  getSaveLocation: () => ipcRenderer.invoke('data:getSaveLocation'),
  openSaveLocation: () => ipcRenderer.invoke('data:openSaveLocation'),
  toggleFullscreen: () => ipcRenderer.invoke('window:toggleFullscreen'),
  getFullscreen: () => ipcRenderer.invoke('window:getFullscreen'),
});
