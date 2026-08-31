(function () {
    'use strict';

    if (window.electronAPI) return;

    var Plan = (window.SamplePlan || {});

    /* ───────────────────────── storage helpers ───────────────────────── */
    var DB_KEY = 'eap_web_auth_db';

    var REMEMBERED_TTL_MS = 30 * 24 * 60 * 60 * 1000;
    var SHORT_TTL_MS = 12 * 60 * 60 * 1000;

    function emptyDB() {
        return {
            meta: { version: 2, createdAt: new Date().toISOString() },
            users: [],
            sessions: []
        };
    }

    function loadDB() {
        try {
            var raw = localStorage.getItem(DB_KEY);
            if (raw) {
                var parsed = JSON.parse(raw);
                if (parsed && Array.isArray(parsed.users)) return parsed;
            }
        } catch (e) {}
        return emptyDB();
    }

    function persistDB() {
        try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) {}
    }

    var db = loadDB();

    /* ───────────────────────── crypto helpers ───────────────────────── */
    function randomHex(bytes) {
        var arr = new Uint8Array(bytes);
        if (window.crypto) window.crypto.getRandomValues(arr);
        else for (var i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
        return Array.prototype.map.call(arr, function (b) {
            return ('0' + b.toString(16)).slice(-2);
        }).join('');
    }

    function newToken() { return randomHex(32); }
    function newSalt() { return randomHex(16); }
    function newUserId() { return 'u_' + randomHex(6); }

    function makeSalt() { return newSalt(); }

    async function sha256Hex(str) {
        var data = new TextEncoder().encode(String(str));
        var buf;
        if (window.crypto && window.crypto.subtle) {
            buf = await window.crypto.subtle.digest('SHA-256', data);
        } else {
            buf = fallbackSha256(data);
        }
        return Array.prototype.map.call(new Uint8Array(buf), function (b) {
            return ('0' + b.toString(16)).slice(-2);
        }).join('');
    }

    function fallbackSha256(data) {
        var words = new Uint8Array(data);
        var h = 2166136261;
        for (var i = 0; i < words.length; i++) {
            h ^= words[i];
            h = Math.imul(h, 16777619);
        }
        var out = new Uint8Array(32);
        new DataView(out.buffer).setUint32(0, h >>> 0, true);
        return out;
    }

    /* ───────────────────────── profile factory ───────────────────────── */
    function buildStarterProfile(opts) {
        opts = opts || {};
        var nowIso = new Date().toISOString();
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
        var rotMs = Math.max(1, smartLock.otpRotationMinutes || 10) * 60000;
        var bucket = Math.floor(Date.now() / rotMs);
        var seed = user.id + ':' + bucket + ':eap101-otp';
        var h = 2166136261;
        for (var i = 0; i < seed.length; i++) {
            h ^= seed.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        h = h >>> 0;
        var code = (h % 900000) + 100000;
        return { code: String(code), validUntil: (bucket + 1) * rotMs };
    }

    function profileView(user) {
        var clone = JSON.parse(JSON.stringify(user.profile));
        var nowIso = new Date().toISOString();
        if (clone.hardware.mmwaveRadar && clone.hardware.mmwaveRadar.online) {
            clone.hardware.mmwaveRadar.lastHeartbeat = nowIso;
        }
        var sl = clone.hardware.smartLock;
        if (sl.otpEnabled) {
            var otp = currentOtpFor(user, sl);
            sl.currentOtp = otp.code;
            sl.otpValidUntil = otp.validUntil;
        } else {
            sl.currentOtp = null;
            sl.otpValidUntil = null;
        }
        clone.meta = {
            sessionSecuredAt: nowIso,
            storage: 'browser localStorage (per-device)'
        };
        return clone;
    }

    /* ───────────────────────── seed demo user ───────────────────────── */
    async function ensureSeedUsers() {
        if (db.users.some(function (u) { return u.isDemo; })) return;
        var salt = makeSalt();
        var passwordHash = await sha256Hex('rishabh@402' + ':' + salt);
        var demo = {
            id: 'u_demo_rishabh',
            name: 'Rishabh Sharma',
            email: 'rishabh.sharma@hertzandhaven.app',
            phone: '+91 98450 40240',
            salt: salt,
            passwordHash: passwordHash,
            role: 'customer',
            isDemo: true,
            createdAt: new Date().toISOString(),
            profile: buildStarterProfile({
                caregiverName: 'Rishabh Sharma',
                caregiverPhone: '+91 98450 40240',
                caregiverEmail: 'rishabh.sharma@hertzandhaven.app',
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
            schematic: { name: 'Sample 2BHK Floor Plan', dataUrl: (Plan && Plan.samplePlanDataUrl) ? Plan.samplePlanDataUrl() : null },
            sensors: JSON.parse(JSON.stringify((Plan && Plan.SAMPLE_SENSORS) || []))
        };
        demo.profile.senior.emergencyContacts = [
            { priority: 1, name: 'Rishabh Sharma', relation: 'Son', phone: '+91 98450 40240' },
            { priority: 2, name: 'Dr. Meera Iyer', relation: 'Geriatric Physician — Manipal Hospital', phone: '+91 80 2502 4444' },
            { priority: 3, name: "Fatima D'Souza", relation: 'Neighbour — Flat 401', phone: '+91 99001 22334' }
        ];
        db.users.push(demo);
        persistDB();
    }

    /* ───────────────────────── lookup / session ───────────────────────── */
    function normalizePhone(p) {
        return String(p || '').replace(/\D/g, '');
    }

    function findUserByIdentifier(identifier) {
        if (!identifier) return null;
        var idLower = String(identifier).trim().toLowerCase();
        var digits = normalizePhone(identifier);
        var digits10 = digits.length > 10 ? digits.slice(-10) : digits;
        for (var i = 0; i < db.users.length; i++) {
            var u = db.users[i];
            if (u.email && u.email.toLowerCase() === idLower) return u;
            if (u.phone && digits) {
                var uDigits = normalizePhone(u.phone);
                var uDigits10 = uDigits.length > 10 ? uDigits.slice(-10) : uDigits;
                if (digits10 && uDigits10 === digits10) return u;
            }
        }
        return null;
    }

    function createSession(userId, remember) {
        purgeExpiredSessions();
        var session = {
            token: newToken(),
            userId: userId,
            remember: !!remember,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + (remember ? REMEMBERED_TTL_MS : SHORT_TTL_MS)).toISOString()
        };
        db.sessions.push(session);
        persistDB();
        return session;
    }

    function purgeExpiredSessions() {
        var now = Date.now();
        db.sessions = db.sessions.filter(function (s) { return new Date(s.expiresAt).getTime() > now; });
    }

    function sessionValid(s) { return !!s && new Date(s.expiresAt).getTime() > Date.now(); }

    function userById(id) {
        for (var i = 0; i < db.users.length; i++) if (db.users[i].id === id) return db.users[i];
        return null;
    }

    function viewForSession(s) {
        if (!sessionValid(s)) return null;
        var user = userById(s.userId);
        if (!user) return null;
        return { user: publicUser(user), profile: profileView(user), session: { token: s.token, remember: s.remember, expiresAt: s.expiresAt } };
    }

    function storedToken() {
        var t = sessionStorage.getItem('eap_web_token');
        if (t) return t;
        return localStorage.getItem('eap_web_token') || null;
    }

    function resolveSession() {
        var token = storedToken();
        if (token) {
            var s = null;
            for (var i = 0; i < db.sessions.length; i++) if (db.sessions[i].token === token) s = db.sessions[i];
            var view = viewForSession(s);
            if (view) return view;
        }
        var remembered = db.sessions
            .filter(function (s) { return s.remember; })
            .sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); })
            .find(sessionValid);
        return remembered ? viewForSession(remembered) : null;
    }

    function setStoredToken(token, remember) {
        if (remember) {
            try { localStorage.setItem('eap_web_token', token); } catch (e) {}
            try { sessionStorage.removeItem('eap_web_token'); } catch (e) {}
        } else {
            try { localStorage.removeItem('eap_web_token'); } catch (e) {}
            try { sessionStorage.setItem('eap_web_token', token); } catch (e) {}
        }
    }

    /* ───────────────────────── sanitize (onboarding) ───────────────────────── */
    function str(v, max) {
        return String(v === undefined || v === null ? '' : v).trim().slice(0, max || 120);
    }

    function sanitizeSensors(raw) {
        if (!Array.isArray(raw)) return [];
        var RISKS = ['critical', 'high', 'medium', 'low'];
        return raw.slice(0, 12).map(function (s, i) {
            s = s && typeof s === 'object' ? s : {};
            function num(v, min, max, dflt) {
                var n = parseFloat(v);
                return isNaN(n) ? dflt : Math.max(min, Math.min(max, n));
            }
            return {
                id: 'SNS-' + String(i + 1).padStart(2, '0'),
                room: str(s.room, 40) || 'Room ' + (i + 1),
                zone: str(s.zone, 60) || 'Coverage Zone',
                risk: RISKS.indexOf(s.risk) >= 0 ? s.risk : 'medium',
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

    /* ───────────────────────── public API surface ───────────────────────── */
    async function login(payload) {
        payload = payload || {};
        var identifier = String(payload.identifier || '').trim();
        var password = String(payload.password || '');
        var remember = payload.remember !== false;
        if (!identifier || !password) return { success: false, message: 'Please enter your email/mobile number and password.' };
        var user = findUserByIdentifier(identifier);
        var hash = user ? await sha256Hex(password + ':' + user.salt) : null;
        if (!user || hash !== user.passwordHash) {
            return { success: false, message: 'We could not match those credentials. Please try again.' };
        }
        var session = createSession(user.id, remember);
        setStoredToken(session.token, remember);
        return { success: true, user: publicUser(user), profile: profileView(user), session: { token: session.token, remember: session.remember, expiresAt: session.expiresAt } };
    }

    async function register(payload) {
        payload = payload || {};
        var name = String(payload.name || '').trim();
        var email = String(payload.email || '').trim().toLowerCase();
        var phone = String(payload.phone || '').trim();
        var password = String(payload.password || '');
        var remember = payload.remember !== false;

        if (name.length < 2) return { success: false, message: 'Please enter the caregiver’s full name.' };
        if (!email && !phone) return { success: false, message: 'Provide at least an email or a mobile number.' };
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false, message: 'That email address does not look right.' };
        if (phone && normalizePhone(phone).length < 8) return { success: false, message: 'That mobile number does not look right.' };
        if (password.length < 6) return { success: false, message: 'Password must be at least 6 characters.' };

        for (var i = 0; i < db.users.length; i++) {
            var u = db.users[i];
            if (email && (u.email || '').toLowerCase() === email) return { success: false, message: 'An account already exists for this email.' };
            if (phone) {
                var a = normalizePhone(u.phone), b = normalizePhone(phone);
                var a10 = a.length > 10 ? a.slice(-10) : a, b10 = b.length > 10 ? b.slice(-10) : b;
                if (a && b && a10 === b10) return { success: false, message: 'An account already exists for this mobile number.' };
            }
        }

        var salt = makeSalt();
        var passwordHash = await sha256Hex(password + ':' + salt);
        var user = {
            id: newUserId(),
            name: name,
            email: email,
            phone: phone,
            salt: salt,
            passwordHash: passwordHash,
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
        if (!user.profile.senior.emergencyContacts.length && phone && name) {
            user.profile.senior.emergencyContacts.push({ priority: 1, name: name, relation: 'Primary Caregiver', phone: phone });
        }
        db.users.push(user);
        var session = createSession(user.id, remember);
        setStoredToken(session.token, remember);
        return { success: true, user: publicUser(user), profile: profileView(user), session: { token: session.token, remember: session.remember, expiresAt: session.expiresAt } };
    }

    async function demoLogin() {
        await ensureSeedUsers();
        var user = null;
        for (var i = 0; i < db.users.length; i++) if (db.users[i].isDemo) { user = db.users[i]; break; }
        if (!user) user = db.users[0];
        if (!user) return { success: false, message: 'No accounts available.' };
        var session = createSession(user.id, true);
        setStoredToken(session.token, true);
        return { success: true, user: publicUser(user), profile: profileView(user), session: { token: session.token, remember: session.remember, expiresAt: session.expiresAt } };
    }

    function session() { return resolveSession(); }

    function profile() {
        var view = resolveSession();
        if (!view) return { success: false, message: 'No active session.' };
        return { success: true, user: view.user, profile: view.profile, session: { remember: view.session.remember, expiresAt: view.session.expiresAt } };
    }

    function updateProfile(patch) {
        var view = resolveSession();
        if (!view) return { success: false, message: 'No active session.' };
        var user = userById(view.user.id);
        if (!user || !patch || typeof patch !== 'object') return { success: false, message: 'Nothing to update.' };

        var prof = user.profile;
        if (patch.notificationPreferences && typeof patch.notificationPreferences === 'object') {
            var np = prof.caregiver.notificationPreferences;
            ['pushAlerts', 'smsFallback', 'voiceCall', 'dailySummary'].forEach(function (k) {
                if (k in patch.notificationPreferences) np[k] = !!patch.notificationPreferences[k];
            });
        }
        if (patch.smartLock && typeof patch.smartLock === 'object') {
            var sl = prof.hardware.smartLock;
            if ('otpEnabled' in patch.smartLock) sl.otpEnabled = !!patch.smartLock.otpEnabled;
            if ('otpRotationMinutes' in patch.smartLock) {
                var mins = parseInt(patch.smartLock.otpRotationMinutes, 10);
                if (!isNaN(mins)) sl.otpRotationMinutes = Math.max(1, Math.min(120, mins));
            }
        }
        if (patch.senior && typeof patch.senior === 'object') {
            ['name', 'address', 'roomLocation'].forEach(function (k) {
                if (typeof patch.senior[k] === 'string') prof.senior[k] = patch.senior[k].slice(0, 240);
            });
        }
        persistDB();
        return { success: true, profile: profileView(user) };
    }

    function signOut() {
        var token = storedToken();
        var found = false;
        if (token) {
            db.sessions = db.sessions.filter(function (s) { return s.token !== token; });
            found = true;
        } else {
            db.sessions = [];
            found = true;
        }
        try { localStorage.removeItem('eap_web_token'); } catch (e) {}
        try { sessionStorage.removeItem('eap_web_token'); } catch (e) {}
        persistDB();
        return { success: true };
    }

    function sampleSchematic() {
        var dataUrl = Plan && Plan.samplePlanDataUrl ? Plan.samplePlanDataUrl() : null;
        return { success: !!dataUrl, dataUrl: dataUrl };
    }

    function analyzeSchematic(seed) {
        var result = Plan && Plan.analyzeSchematic
            ? Plan.analyzeSchematic(seed || String(Date.now()))
            : { sensors: [], scanLog: ['Analysis unavailable'] };
        return { success: true, sensors: result.sensors, scanLog: result.scanLog };
    }

    function completeOnboarding(payload) {
        var view = resolveSession();
        if (!view) return { success: false, message: 'No active session.' };
        var user = userById(view.user.id);
        if (!user || !payload || typeof payload !== 'object') return { success: false, message: 'Nothing to save.' };

        var p = user.profile;
        var data = payload;

        var senior = data.senior && typeof data.senior === 'object' ? data.senior : {};
        var name = str(senior.name, 80);
        if (name.length < 2) return { success: false, message: 'Senior name is required.' };
        p.senior.name = name;
        p.senior.age = senior.age === '' || senior.age === null || senior.age === undefined ? p.senior.age : Math.max(35, Math.min(120, parseInt(senior.age, 10) || p.senior.age));
        p.senior.gender = str(senior.gender, 20);
        p.senior.language = str(senior.language, 30) || 'English';
        p.senior.conditions = Array.isArray(senior.conditions) ? senior.conditions.map(function (c) { return str(c, 40); }).filter(Boolean).slice(0, 10) : [];
        p.senior.mobility = str(senior.mobility, 60) || 'Walks unaided';
        p.senior.photo = typeof senior.photo === 'string' && /^data:image\/(png|jpe?g|webp);base64,/.test(senior.photo) && senior.photo.length < 400000 ? senior.photo : null;

        var ph = data.physician && typeof data.physician === 'object' ? data.physician : {};
        p.senior.physician = { name: str(ph.name, 80), hospital: str(ph.hospital, 100), phone: str(ph.phone, 24) };

        var ec = data.emergencyContact && typeof data.emergencyContact === 'object' ? data.emergencyContact : {};
        var ecName = str(ec.name, 80);
        var ecPhone = str(ec.phone, 24);
        if (!ecName || !ecPhone) return { success: false, message: 'Primary emergency contact name and phone are required.' };
        var kept = (p.senior.emergencyContacts || [])
            .filter(function (c) { return c.phone && c.phone.replace(/\D/g, '').slice(-10) !== ecPhone.replace(/\D/g, '').slice(-10); })
            .slice(0, 3);
        p.senior.emergencyContacts = [].concat([{ priority: 1, name: ecName, relation: str(ec.relation, 40) || 'Emergency Contact', phone: ecPhone }],
            kept.map(function (c, i) { return { priority: i + 2, name: c.name, relation: c.relation, phone: c.phone }; }));

        var res = data.residence && typeof data.residence === 'object' ? data.residence : {};
        var BUILDING_TYPES = ['Apartment Complex', 'Independent House', 'Assisted Living'];
        p.residence = {
            flat: str(res.flat, 80),
            area: str(res.area, 120),
            city: str(res.city, 60),
            pincode: str(res.pincode, 12).replace(/[^\w-]/g, ''),
            buildingType: BUILDING_TYPES.indexOf(res.buildingType) >= 0 ? res.buildingType : 'Apartment Complex',
            floor: str(res.floor, 10),
            elevator: !!res.elevator,
            lockboxBrand: str(res.lockboxBrand, 40),
            lockboxLocation: str(res.lockboxLocation, 140)
        };
        var composedAddress = [p.residence.flat, p.residence.area].filter(Boolean).join(', ') +
            (p.residence.city ? ', ' + p.residence.city : '') +
            (p.residence.pincode ? ' ' + p.residence.pincode : '');
        if (composedAddress.trim()) p.senior.address = composedAddress;

        var sch = data.schematic && typeof data.schematic === 'object' ? data.schematic : {};
        var schData = String(sch.dataUrl || '');
        if (!/^data:image\/(png|jpe?g|jpeg|webp|svg\+xml);base64,|^data:image\/svg\+xml;charset=utf-8,/.test(schData)) {
            return { success: false, message: 'A valid floor plan image is required.' };
        }
        if (schData.length > 3500000) return { success: false, message: 'Schematic image is too large. Please use an image under ~2MB.' };

        var sensors = sanitizeSensors(data.sensors);
        if (!sensors.length) return { success: false, message: 'AI analysis must place at least one sensor before finishing.' };

        var nowIso = new Date().toISOString();
        p.onboarding = {
            completed: true,
            startedAt: (p.onboarding && p.onboarding.startedAt) || nowIso,
            completedAt: nowIso,
            schematic: { name: str(sch.name, 80) || 'Floor Plan', dataUrl: schData },
            sensors: sensors
        };
        p.senior.roomLocation = sensors[0].room;
        p.senior.monitoredZones = [];
        for (var zi = 0; zi < sensors.length; zi++) {
            if (p.senior.monitoredZones.indexOf(sensors[zi].room) < 0) p.senior.monitoredZones.push(sensors[zi].room);
        }

        persistDB();
        return { success: true, profile: profileView(user), session: { token: view.session.token } };
    }

    /* ───────────────────────── expose ───────────────────────── */
    async function init() { await ensureSeedUsers(); }

    window.electronAPI = {
        login: login,
        register: register,
        demoLogin: demoLogin,
        session: session,
        profile: profile,
        updateProfile: updateProfile,
        signOut: signOut,
        sampleSchematic: sampleSchematic,
        analyzeSchematic: analyzeSchematic,
        completeOnboarding: completeOnboarding
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
