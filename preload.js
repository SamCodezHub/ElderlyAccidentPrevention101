const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    login: (credentials) => ipcRenderer.invoke('login', credentials),
    register: (userData) => ipcRenderer.invoke('register', userData)
});