'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { samplePlanDataUrl, SAMPLE_SENSORS } = require('./sample-plan');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'auth-db.json');
const LEGACY_ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');

const REMEMBERED_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SHORT_TTL_MS = 12 * 60 * 60 * 1000;

let db = null;

function emptyDB() {
    return {
        meta: { version: 1, createdAt: new Date().toISOString() },
        users: [],
        sessions: []
    };
}

function normalizePhone(p) {
    return String(p || '').replace(/\D/g, '');
}

function makeSalt() {
    return crypto.randomBytes(16).toString('hex');
}

function hashPassword(password, salt) {
    return crypto.scryptSync(String(password), salt, 64).toString('hex');
}

function verifyPassword(password, salt, expectedHex) {
    try {
        const actual = Buffer.from(hashPassword(password, salt), 'hex');
        const expected = Buffer.from(expectedHex, 'hex');
        return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
    } catch (e) {
        return false;
    }
}

function newToken() {
    return crypto.randomBytes(32).toString('hex');
}

function newUserId() {
    return 'u_' + crypto.randomBytes(6).toString('hex');
}

function persist() {
    try {
        const tmp = DB_FILE + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
        fs.renameSync(tmp, DB_FILE);
    } catch (e) {
        console.error('[auth-store] persist failed:', e.message);
    }
}

function buildStarterProfile(opts) {
    opts = opts || {};
    const nowIso = new Date().toISOString();
    return {
        caregiver: {
            name: opts.caregiverName || '',
            relation: 'Primary Caregiver',
            phone: opts.caregiverPhone || '',
            email: opts.caregiverEmail || '',
            notificationPreferences: { pushAlerts: true, smsFallback: true, voiceCall: true, dailySummary: false }
        },
        senior: {
            name: opts.seniorName || '',
            relation: 'Parent',
            age: null,
            gender: '',
            language: 'English',
            conditions: [],
            mobility: 'Walks unaided',
            photo: null,
            address: opts.seniorAddress || '',
            roomLocation: 'Master Bathroom',
            monitoredZones: ['Master Bathroom', 'Bedroom', 'Living Room'],
            emergencyContacts: [],
            physician: { name: '', hospital: '', phone: '' }
        },
        residence: {
            flat: '', area: '', city: '', pincode: '',
            buildingType: 'Apartment Complex',
            floor: '', elevator: false,
            lockboxBrand: '', lockboxLocation: ''
        },
        onboarding: {
            completed: false,
            startedAt: nowIso,
            completedAt: null,
            schematic: null,
            sensors: []
        },
        hardware: {
            mmwaveRadar: {
                label: 'mmWave Radar — Fall Detection',
                location: 'Master Bathroom',
                statusText: 'Online — 24GHz',
                online: true,
                frequency: '24 GHz FMCW',
                lastHeartbeat: nowIso
            },
            smartLock: {
                label: 'Smart Lock — Main Entrance',
                doorLocation: 'Main Entrance',
                otpEnabled: true,
                otpLength: 6,
                otpRotationMinutes: 10,
                currentOtp: null,
                otpValidUntil: null
            }
        }
    };
}

function publicUser(u) {
    return { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, isDemo: !!u.isDemo };
}

function currentOtpFor(user, smartLock) {
    const rotMs = Math.max(1, smartLock.otpRotationMinutes || 10) * 60000;
    const bucket = Math.floor(Date.now() / rotMs);
    const digest = crypto.createHash('sha256').update(user.id + ':' + bucket + ':eap101-otp').digest();
    const code = (digest.readUInt32BE(0) % 900000) + 100000;
    return { code: String(code), validUntil: (bucket + 1) * rotMs };
}

function profileView(user) {
    const clone = JSON.parse(JSON.stringify(user.profile));
    const nowIso = new Date().toISOString();
    if (clone.hardware.mmwaveRadar && clone.hardware.mmwaveRadar.online) {
        clone.hardware.mmwaveRadar.lastHeartbeat = nowIso;
    }
    const sl = clone.hardware.smartLock;
    if (sl.otpEnabled) {
        const otp = currentOtpFor(user, sl);
        sl.currentOtp = otp.code;
        sl.otpValidUntil = otp.validUntil;
    } else {
        sl.currentOtp = null;
        sl.otpValidUntil = null;
    }
    clone.meta = {
        sessionSecuredAt: nowIso,
        storageFile: 'data/auth-db.json'
    };
    return clone;
}

function findUserByIdentifier(identifier) {
    if (!identifier) return null;
    const idLower = String(identifier).trim().toLowerCase();
    const digits = normalizePhone(identifier);
    const digits10 = digits.length > 10 ? digits.slice(-10) : digits;
    return db.users.find(u => {
        if (u.email && u.email.toLowerCase() === idLower) return true;
        if (u.phone && digits) {
            const uDigits = normalizePhone(u.phone);
            const uDigits10 = uDigits.length > 10 ? uDigits.slice(-10) : uDigits;
            if (digits10 && uDigits10 === digits10) return true;
        }
        return false;
    }) || null;
}

function createSession(userId, remember) {
    const session = {
        token: newToken(),
        userId,
        remember: !!remember,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + (remember ? REMEMBERED_TTL_MS : SHORT_TTL_MS)).toISOString()
    };
    db.sessions.push(session);
    persist();
    return session;
}

function purgeExpiredSessions() {
    const now = Date.now();
    db.sessions = db.sessions.filter(s => new Date(s.expiresAt).getTime() > now);
}

function sessionValid(s) {
    return s && new Date(s.expiresAt).getTime() > Date.now();
}

function userById(id) {
    return db.users.find(u => u.id === id) || null;
}

function viewForSession(s) {
    if (!sessionValid(s)) return null;
    const user = userById(s.userId);
    if (!user) return null;
    return { user: publicUser(user), profile: profileView(user), session: { token: s.token, remember: s.remember, expiresAt: s.expiresAt } };
}

function ensureSeedUsers() {
    if (!db.users.some(u => u.isDemo)) {
        const salt = makeSalt();
        const demo = {
            id: 'u_demo_rehan',
            name: 'Rehan Khan',
            email: 'rehan.khan@hertzandhaven.app',
            phone: '+91 98450 40240',
            salt,
            passwordHash: hashPassword('rehan@402', salt),
            role: 'customer',
            isDemo: true,
            createdAt: new Date().toISOString(),
            profile: buildStarterProfile({
                caregiverName: 'Rehan Khan',
                caregiverPhone: '+91 98450 40240',
                caregiverEmail: 'rehan.khan@hertzandhaven.app',
                seniorName: 'Yusuf Khan',
                seniorAddress: 'Flat 402, Tower B, Prestige Shantiniketan, Whitefield, Bengaluru 560066'
            })
        };
        demo.profile.caregiver.relation = 'Son — Primary Caregiver';
        demo.profile.senior.age = 74;
        demo.profile.senior.gender = 'Male';
        demo.profile.senior.language = 'Hindi';
        demo.profile.senior.conditions = ['Cardiac History', 'Arthritis'];
        demo.profile.senior.mobility = 'Walks with cane';
        demo.profile.senior.physician = { name: 'Dr. Meera Iyer', hospital: 'Manipal Hospital, Old Airport Road', phone: '+91 80 2502 4444' };
        demo.profile.residence = {
            flat: 'Flat 402, Tower B',
            area: 'Prestige Shantiniketan, Whitefield',
            city: 'Bengaluru',
            pincode: '560066',
            buildingType: 'Apartment Complex',
            floor: '4',
            elevator: true,
            lockboxBrand: 'Yale Smart Lockbox',
            lockboxLocation: 'Mounted on main door handle'
        };
        demo.profile.onboarding = {
            completed: true,
            startedAt: demo.createdAt,
            completedAt: demo.createdAt,
            schematic: { name: 'Sample 2BHK Floor Plan', dataUrl: samplePlanDataUrl() },
            sensors: JSON.parse(JSON.stringify(SAMPLE_SENSORS))
        };
        demo.profile.senior.emergencyContacts = [
            { priority: 1, name: 'Rehan Khan', relation: 'Son', phone: '+91 98450 40240' },
            { priority: 2, name: 'Dr. Meera Iyer', relation: 'Geriatric Physician — Manipal Hospital', phone: '+91 80 2502 4444' },
            { priority: 3, name: "Fatima D'Souza", relation: 'Neighbour — Flat 401', phone: '+91 99001 22334' }
        ];
        db.users.push(demo);
    }
}

function initStore() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    let loaded = null;
    try {
        if (fs.existsSync(DB_FILE)) loaded = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        loaded = null;
    }
    db = Object.assign(emptyDB(), loaded || {});
    db.users = Array.isArray(db.users) ? db.users : [];
    db.sessions = Array.isArray(db.sessions) ? db.sessions : [];

    try {
        if (fs.existsSync(LEGACY_ACCOUNTS_FILE)) {
            const legacy = JSON.parse(fs.readFileSync(LEGACY_ACCOUNTS_FILE, 'utf8'));
            (legacy.users || []).forEach(u => {
                if (!u.username) return;
                const email = u.username + '@local.dev';
                if (db.users.some(x => (x.email || '').toLowerCase() === email.toLowerCase())) return;
                const salt = makeSalt();
                db.users.push({
                    id: newUserId(),
                    name: u.username,
                    email,
                    phone: '',
                    salt,
                    passwordHash: hashPassword(u.password || '', salt),
                    role: u.role === 'moderator' ? 'moderator' : 'customer',
                    isDemo: false,
                    createdAt: u.createdAt || new Date().toISOString(),
                    profile: buildStarterProfile({ caregiverName: u.username })
                });
            });
            persist();
        }
    } catch (e) {}

    ensureSeedUsers();
    purgeExpiredSessions();
    db.sessions = db.sessions.filter(s => s.remember);
    persist();
}

function login(payload) {
    const identifier = (payload.identifier || '').trim();
    const password = payload.password || '';
    const remember = payload.remember !== false;
    if (!identifier || !password) return { success: false, message: 'Please enter your email/mobile number and password.' };
    const user = findUserByIdentifier(identifier);
    if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
        return { success: false, message: 'We could not match those credentials. Please try again.' };
    }
    const session = createSession(user.id, remember);
    return { success: true, user: publicUser(user), profile: profileView(user), session: { token: session.token, remember: session.remember, expiresAt: session.expiresAt } };
}

function register(payload) {
    const name = String(payload.name || '').trim();
    const email = String(payload.email || '').trim().toLowerCase();
    const phone = String(payload.phone || '').trim();
    const password = String(payload.password || '');
    const remember = payload.remember !== false;

    if (name.length < 2) return { success: false, message: 'Please enter the caregiver’s full name.' };
    if (!email && !phone) return { success: false, message: 'Provide at least an email or a mobile number.' };
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false, message: 'That email address does not look right.' };
    if (phone && normalizePhone(phone).length < 8) return { success: false, message: 'That mobile number does not look right.' };
    if (password.length < 6) return { success: false, message: 'Password must be at least 6 characters.' };
    if (email && db.users.some(u => (u.email || '').toLowerCase() === email)) return { success: false, message: 'An account already exists for this email.' };
    if (phone && db.users.some(u => {
        const a = normalizePhone(u.phone), b = normalizePhone(phone);
        const a10 = a.length > 10 ? a.slice(-10) : a, b10 = b.length > 10 ? b.slice(-10) : b;
        return a && b && a10 === b10;
    })) return { success: false, message: 'An account already exists for this mobile number.' };

    const salt = makeSalt();
    const user = {
        id: newUserId(),
        name,
        email,
        phone,
        salt,
        passwordHash: hashPassword(password, salt),
        role: 'customer',
        isDemo: false,
        createdAt: new Date().toISOString(),
        profile: buildStarterProfile({
            caregiverName: name,
            caregiverEmail: email,
            caregiverPhone: phone,
            seniorName: String(payload.seniorName || '').trim(),
            seniorAddress: String(payload.seniorAddress || '').trim()
        })
    };
    if (!user.profile.senior.emergencyContacts.length && phone) {
        user.profile.senior.emergencyContacts.push({ priority: 1, name, relation: 'Primary Caregiver', phone });
    }
    db.users.push(user);
    const session = createSession(user.id, remember);
    return { success: true, user: publicUser(user), profile: profileView(user), session: { token: session.token, remember: session.remember, expiresAt: session.expiresAt } };
}

function demoLogin() {
    const user = db.users.find(u => u.isDemo) || db.users[0];
    if (!user) return { success: false, message: 'No accounts available.' };
    const session = createSession(user.id, true);
    return { success: true, user: publicUser(user), profile: profileView(user), session: { token: session.token, remember: session.remember, expiresAt: session.expiresAt } };
}

function resolveSession(token) {
    if (token) {
        const view = viewForSession(db.sessions.find(s => s.token === token));
        if (view) return view;
    }
    const remembered = db.sessions
        .filter(s => s.remember)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .find(s => sessionValid(s));
    return remembered ? viewForSession(remembered) : null;
}

function bootSession() {
    const view = resolveSession(null);
    return view ? { user: view.user, profile: view.profile } : null;
}

function str(v, max) {
    const s = String(v === undefined || v === null ? '' : v).trim();
    return s.slice(0, max || 120);
}

function sanitizeSensors(raw) {
    if (!Array.isArray(raw)) return [];
    const RISKS = ['critical', 'high', 'medium', 'low'];
    return raw.slice(0, 12).map((s, i) => {
        s = s && typeof s === 'object' ? s : {};
        const num = (v, min, max, dflt) => {
            const n = parseFloat(v);
            return isNaN(n) ? dflt : Math.max(min, Math.min(max, n));
        };
        return {
            id: 'SNS-' + String(i + 1).padStart(2, '0'),
            room: str(s.room, 40) || 'Room ' + (i + 1),
            zone: str(s.zone, 60) || 'Coverage Zone',
            risk: RISKS.includes(s.risk) ? s.risk : 'medium',
            x: num(s.x, 0, 92, 10),
            y: num(s.y, 0, 92, 10),
            w: num(s.w, 4, 60, 18),
            h: num(s.h, 4, 60, 16),
            px: num(s.px, 0, 100, 20),
            py: num(s.py, 0, 100, 20),
            confidence: Math.round(num(s.confidence, 50, 99, 90)),
            baseHeight: num(s.baseHeight, 0.2, 2.2, 1.3)
        };
    });
}

function completeOnboardingForToken(token, payload) {
    const view = resolveSession(token);
    if (!view) return { success: false, message: 'No active session.' };
    const user = userById(view.user.id);
    if (!user || !payload || typeof payload !== 'object') return { success: false, message: 'Nothing to save.' };

    const p = user.profile;
    const data = payload;

    const senior = data.senior && typeof data.senior === 'object' ? data.senior : {};
    const name = str(senior.name, 80);
    if (name.length < 2) return { success: false, message: 'Senior name is required.' };
    p.senior.name = name;
    p.senior.age = senior.age === '' || senior.age === null || senior.age === undefined ? p.senior.age : Math.max(35, Math.min(120, parseInt(senior.age, 10) || p.senior.age));
    p.senior.gender = str(senior.gender, 20);
    p.senior.language = str(senior.language, 30) || 'English';
    p.senior.conditions = Array.isArray(senior.conditions)
        ? senior.conditions.map(c => str(c, 40)).filter(Boolean).slice(0, 10)
        : [];
    p.senior.mobility = str(senior.mobility, 60) || 'Walks unaided';
    p.senior.photo = typeof senior.photo === 'string' &&
        /^data:image\/(png|jpe?g|webp);base64,/.test(senior.photo) &&
        senior.photo.length < 400000 ? senior.photo : null;

    const ph = data.physician && typeof data.physician === 'object' ? data.physician : {};
    p.senior.physician = { name: str(ph.name, 80), hospital: str(ph.hospital, 100), phone: str(ph.phone, 24) };

    const ec = data.emergencyContact && typeof data.emergencyContact === 'object' ? data.emergencyContact : {};
    const ecName = str(ec.name, 80);
    const ecPhone = str(ec.phone, 24);
    if (!ecName || !ecPhone) return { success: false, message: 'Primary emergency contact name and phone are required.' };
    const kept = (p.senior.emergencyContacts || [])
        .filter(c => c.phone && c.phone.replace(/\D/g, '').slice(-10) !== ecPhone.replace(/\D/g, '').slice(-10))
        .slice(0, 3);
    p.senior.emergencyContacts = [
        { priority: 1, name: ecName, relation: str(ec.relation, 40) || 'Emergency Contact', phone: ecPhone },
        ...kept.map((c, i) => ({ priority: i + 2, name: c.name, relation: c.relation, phone: c.phone }))
    ];

    const res = data.residence && typeof data.residence === 'object' ? data.residence : {};
    const BUILDING_TYPES = ['Apartment Complex', 'Independent House', 'Assisted Living'];
    p.residence = {
        flat: str(res.flat, 80),
        area: str(res.area, 120),
        city: str(res.city, 60),
        pincode: str(res.pincode, 12).replace(/[^\w-]/g, ''),
        buildingType: BUILDING_TYPES.includes(res.buildingType) ? res.buildingType : 'Apartment Complex',
        floor: str(res.floor, 10),
        elevator: !!res.elevator,
        lockboxBrand: str(res.lockboxBrand, 40),
        lockboxLocation: str(res.lockboxLocation, 140)
    };
    const composedAddress = [p.residence.flat, p.residence.area].filter(Boolean).join(', ') +
        (p.residence.city ? ', ' + p.residence.city : '') +
        (p.residence.pincode ? ' ' + p.residence.pincode : '');
    if (composedAddress.trim()) p.senior.address = composedAddress;

    const sch = data.schematic && typeof data.schematic === 'object' ? data.schematic : {};
    const schData = String(sch.dataUrl || '');
    if (!/^data:image\/(png|jpe?g|jpeg|webp|svg\+xml);base64,|^data:image\/svg\+xml;charset=utf-8,/.test(schData)) {
        return { success: false, message: 'A valid floor plan image is required.' };
    }
    if (schData.length > 3500000) return { success: false, message: 'Schematic image is too large. Please use an image under ~2MB.' };

    const sensors = sanitizeSensors(data.sensors);
    if (!sensors.length) return { success: false, message: 'AI analysis must place at least one sensor before finishing.' };

    const nowIso = new Date().toISOString();
    p.onboarding = {
        completed: true,
        startedAt: (p.onboarding && p.onboarding.startedAt) || nowIso,
        completedAt: nowIso,
        schematic: { name: str(sch.name, 80) || 'Floor Plan', dataUrl: schData },
        sensors
    };
    p.senior.roomLocation = sensors[0].room;
    p.senior.monitoredZones = [...new Set(sensors.map(s => s.room))];

    persist();
    return { success: true, profile: profileView(user), session: { token: view.session.token } };
}

function profileForToken(token) {
    const view = resolveSession(token);
    if (!view) return { success: false, message: 'No active session.' };
    return { success: true, user: view.user, profile: view.profile, session: { remember: view.session.remember, expiresAt: view.session.expiresAt } };
}

function updateProfileForToken(token, patch) {
    const view = resolveSession(token);
    if (!view) return { success: false, message: 'No active session.' };
    const user = userById(view.user.id);
    if (!user || !patch || typeof patch !== 'object') return { success: false, message: 'Nothing to update.' };

    const prof = user.profile;
    if (patch.notificationPreferences && typeof patch.notificationPreferences === 'object') {
        const np = prof.caregiver.notificationPreferences;
        ['pushAlerts', 'smsFallback', 'voiceCall', 'dailySummary'].forEach(k => {
            if (k in patch.notificationPreferences) np[k] = !!patch.notificationPreferences[k];
        });
    }
    if (patch.smartLock && typeof patch.smartLock === 'object') {
        const sl = prof.hardware.smartLock;
        if ('otpEnabled' in patch.smartLock) sl.otpEnabled = !!patch.smartLock.otpEnabled;
        if ('otpRotationMinutes' in patch.smartLock) {
            const mins = parseInt(patch.smartLock.otpRotationMinutes, 10);
            if (!isNaN(mins)) sl.otpRotationMinutes = Math.max(1, Math.min(120, mins));
        }
    }
    if (patch.senior && typeof patch.senior === 'object') {
        ['name', 'address', 'roomLocation'].forEach(k => {
            if (typeof patch.senior[k] === 'string') prof.senior[k] = patch.senior[k].slice(0, 240);
        });
    }
    persist();
    return { success: true, profile: profileView(user) };
}

function signOutToken(token) {
    let target = token ? db.sessions.find(s => s.token === token) : null;
    if (!target) {
        target = db.sessions
            .filter(s => sessionValid(s))
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
    }
    if (!target) {
        db.sessions = [];
        persist();
        return { success: true };
    }
    db.sessions = db.sessions.filter(s => s.userId !== target.userId);
    persist();
    return { success: true };
}

module.exports = {
    initStore,
    login,
    register,
    demoLogin,
    resolveSession,
    bootSession,
    profileForToken,
    updateProfileForToken,
    completeOnboardingForToken,
    signOutToken
};
