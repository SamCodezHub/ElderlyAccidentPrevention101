const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    login: (payload) => ipcRenderer.invoke('auth:login', payload),
    register: (payload) => ipcRenderer.invoke('auth:register', payload),
    demoLogin: () => ipcRenderer.invoke('auth:demo-login'),
    session: () => ipcRenderer.invoke('auth:session'),
    profile: () => ipcRenderer.invoke('auth:profile'),
    updateProfile: (patch) => ipcRenderer.invoke('auth:update-profile', patch),
    signOut: () => ipcRenderer.invoke('auth:sign-out'),
    sampleSchematic: () => ipcRenderer.invoke('schematic:sample'),
    analyzeSchematic: (seed) => ipcRenderer.invoke('schematic:analyze', { seed }),
    completeOnboarding: (payload) => ipcRenderer.invoke('onboarding:complete', payload)
});
