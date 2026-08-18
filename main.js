const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

const DATA_DIR = path.join(__dirname, 'data');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const DEVICES_FILE = path.join(DATA_DIR, 'devices.json');
const ANOMALIES_FILE = path.join(DATA_DIR, 'anomalies.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

function loadJSON(file, fallback) {
    try {
        if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) { console.error('Load error:', file, e); }
    return fallback;
}

function saveJSON(file, data) {
    try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
    catch (e) { console.error('Save error:', file, e); }
}

function loadAccounts() { return loadJSON(ACCOUNTS_FILE, { users: [] }); }
function saveAccounts(d) { saveJSON(ACCOUNTS_FILE, d); }
function loadDevices() { return loadJSON(DEVICES_FILE, { devices: [] }); }
function saveDevices(d) { saveJSON(DEVICES_FILE, d); }
function loadAnomalies() { return loadJSON(ANOMALIES_FILE, { anomalies: [] }); }
function saveAnomalies(d) { saveJSON(ANOMALIES_FILE, d); }

let mainWindow;

function createWindow() {
    Menu.setApplicationMenu(null);

    mainWindow = new BrowserWindow({
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

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        return res.end();
    }

    if (req.method === 'POST' && req.url === '/api/data') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const payload = JSON.parse(body);
                const devices = loadDevices();
                const anomalies = loadAnomalies();

                const device = devices.devices.find(d => d.id === payload.deviceId);
                if (!device) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: 'Device not registered' }));
                }

                device.lastSeen = new Date().toISOString();
                device.pointCloud = payload.pointCloud || [];
                saveDevices(devices);

                if (payload.anomaly) {
                    const anomaly = {
                        id: `anom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                        deviceId: payload.deviceId,
                        deviceName: device.name,
                        type: payload.anomaly.type || 'unknown',
                        message: payload.anomaly.message || 'Anomaly detected',
                        velocity: payload.anomaly.velocity || 0,
                        threshold: payload.anomaly.threshold || 0,
                        pointCloud: payload.pointCloud || [],
                        timestamp: new Date().toISOString(),
                        flag: 'pending'
                    };
                    anomalies.anomalies.unshift(anomaly);
                    saveAnomalies(anomalies);

                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('new-anomaly', anomaly);
                    }
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
            } catch (e) {
                console.error('Data endpoint error:', e);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid payload' }));
            }
        });
    } else {
        res.writeHead(404);
        res.end();
    }
});

server.listen(3847, () => console.log('Data receiver listening on port 3847'));

app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    server.close();
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('register', async (event, { username, password, role }) => {
    const accounts = loadAccounts();
    if (accounts.users.some(u => u.username === username)) {
        return { success: false, message: 'Username already exists' };
    }
    accounts.users.push({
        username, password,
        role: role || 'user',
        createdAt: new Date().toISOString()
    });
    saveAccounts(accounts);
    return { success: true, message: 'Account created' };
});

ipcMain.handle('login', async (event, { username, password }) => {
    const accounts = loadAccounts();
    const user = accounts.users.find(u => u.username === username && u.password === password);
    if (user) {
        return { success: true, message: 'Login successful', user: { username: user.username, role: user.role } };
    }
    return { success: false, message: 'Invalid username or password' };
});

ipcMain.handle('register-device', async (event, { deviceId, name, location }) => {
    const devices = loadDevices();
    if (devices.devices.some(d => d.id === deviceId)) {
        return { success: false, message: 'Device already registered' };
    }
    const device = {
        id: deviceId,
        name: name || `Sensor ${devices.devices.length + 1}`,
        location: location || 'Unknown',
        registeredAt: new Date().toISOString(),
        lastSeen: null,
        pointCloud: []
    };
    devices.devices.push(device);
    saveDevices(devices);
    return { success: true, message: 'Device registered', device };
});

ipcMain.handle('get-devices', async () => {
    return loadDevices().devices;
});

ipcMain.handle('remove-device', async (event, deviceId) => {
    const devices = loadDevices();
    devices.devices = devices.devices.filter(d => d.id !== deviceId);
    saveDevices(devices);
    return { success: true };
});

ipcMain.handle('get-anomalies', async () => {
    return loadAnomalies().anomalies;
});

ipcMain.handle('flag-anomaly', async (event, { anomalyId, flag }) => {
    const anomalies = loadAnomalies();
    const anomaly = anomalies.anomalies.find(a => a.id === anomalyId);
    if (anomaly) {
        anomaly.flag = flag;
        anomaly.flaggedAt = new Date().toISOString();
        saveAnomalies(anomalies);
        return { success: true };
    }
    return { success: false, message: 'Anomaly not found' };
});