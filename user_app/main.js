const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const auth = require('./auth-store');
const schematic = require('./sample-plan');

const senderSessions = new Map();

function tokenFor(event) {
    return senderSessions.get(event.sender.id) || null;
}

function safe(fn) {
    try {
        return fn();
    } catch (err) {
        console.error('[main]', err);
        return { success: false, message: 'Something went wrong. Please try again.' };
    }
}

function startPageFor(boot) {
    if (!boot) return 'index.html';
    const ob = boot.profile && boot.profile.onboarding;
    if (boot.user.role === 'moderator') return 'dashboard.html';
    if (!ob || !ob.completed) return 'onboarding.html';
    return 'family-dashboard.html';
}

function createWindow() {
    Menu.setApplicationMenu(null);

    const boot = auth.bootSession();
    const mainWindow = new BrowserWindow({
        width: 1280,
        height: 840,
        minWidth: 1024,
        minHeight: 700,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile(startPageFor(boot));
}

app.whenReady().then(() => {
    auth.initStore();
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('auth:login', (event, payload) => safe(() => {
    const res = auth.login(payload || {});
    if (res.success) senderSessions.set(event.sender.id, res.session.token);
    return res;
}));

ipcMain.handle('auth:register', (event, payload) => safe(() => {
    const res = auth.register(payload || {});
    if (res.success) senderSessions.set(event.sender.id, res.session.token);
    return res;
}));

ipcMain.handle('auth:demo-login', (event) => safe(() => {
    const res = auth.demoLogin();
    if (res.success) senderSessions.set(event.sender.id, res.session.token);
    return res;
}));

ipcMain.handle('auth:session', (event) => safe(() => {
    return auth.resolveSession(tokenFor(event));
}));

ipcMain.handle('auth:profile', (event) => safe(() => {
    return auth.profileForToken(tokenFor(event));
}));

ipcMain.handle('auth:update-profile', (event, patch) => safe(() => {
    return auth.updateProfileForToken(tokenFor(event), patch);
}));

ipcMain.handle('auth:sign-out', (event) => safe(() => {
    const res = auth.signOutToken(tokenFor(event));
    senderSessions.delete(event.sender.id);
    return res;
}));

ipcMain.handle('schematic:sample', () => safe(() => {
    return { success: true, dataUrl: schematic.samplePlanDataUrl() };
}));

ipcMain.handle('schematic:analyze', (event, payload) => safe(() => {
    const seed = (payload && payload.seed) || String(Date.now());
    const res = schematic.analyzeSchematic(seed);
    return { success: true, sensors: res.sensors, scanLog: res.scanLog };
}));

ipcMain.handle('onboarding:complete', (event, payload) => safe(() => {
    const res = auth.completeOnboardingForToken(tokenFor(event), payload);
    if (res.success && res.session && res.session.token) {
        senderSessions.set(event.sender.id, res.session.token);
    }
    return res;
}));
