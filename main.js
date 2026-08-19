const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

function loadJSON(file, fallback) {
    try {
        if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {}
    return fallback;
}

function saveJSON(file, data) {
    try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
    catch (e) {}
}

function createWindow() {
    Menu.setApplicationMenu(null);

    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile('login.html');
}

app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('register', async (event, { username, password }) => {
    const accounts = loadJSON(ACCOUNTS_FILE, { users: [] });
    if (accounts.users.some(u => u.username === username)) {
        return { success: false, message: 'Username already exists' };
    }
    accounts.users.push({
        username,
        password,
        role: 'moderator',
        createdAt: new Date().toISOString()
    });
    saveJSON(ACCOUNTS_FILE, accounts);
    return { success: true, message: 'Account created' };
});

ipcMain.handle('login', async (event, { username, password }) => {
    const accounts = loadJSON(ACCOUNTS_FILE, { users: [] });
    const user = accounts.users.find(u => u.username === username && u.password === password);
    if (user) {
        return {
            success: true,
            message: 'Login successful',
            user: { username: user.username, role: user.role }
        };
    }
    return { success: false, message: 'Invalid username or password' };
});