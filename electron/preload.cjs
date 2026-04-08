'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getToken:      () => ipcRenderer.invoke('auth:getToken'),
  getUser:       () => ipcRenderer.invoke('auth:getUser'),
  logout:        () => ipcRenderer.invoke('auth:logout'),
  openExternal:  (url) => ipcRenderer.invoke('shell:openExternal', url),
  savePDF:       (fileName, buffer) => ipcRenderer.invoke('pdf:save', fileName, buffer),
  isElectron:    true,
});
