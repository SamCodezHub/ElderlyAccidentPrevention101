const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    login: (credentials) => ipcRenderer.invoke('login', credentials),
    register: (userData) => ipcRenderer.invoke('register', userData),

    registerDevice: (device) => ipcRenderer.invoke('register-device', device),
    getDevices: () => ipcRenderer.invoke('get-devices'),
    removeDevice: (deviceId) => ipcRenderer.invoke('remove-device', deviceId),

    getAnomalies: () => ipcRenderer.invoke('get-anomalies'),
    flagAnomaly: (data) => ipcRenderer.invoke('flag-anomaly', data),

    onNewAnomaly: (callback) => {
        ipcRenderer.on('new-anomaly', (event, anomaly) => callback(anomaly));
    }
});