'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getToken:   () => ipcRenderer.invoke('auth:getToken'),
  getUser:    () => ipcRenderer.invoke('auth:getUser'),
  logout:     () => ipcRenderer.invoke('auth:logout'),
  isElectron: true,
});
