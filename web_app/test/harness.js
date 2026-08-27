const fs = require('fs');
const path = require('path');

// Mount the browser API by mocking browser globals.
global.window = {};
global.document = { readyState: 'loading', addEventListener: () => {} };
const store = {};
global.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
};
global.sessionStorage = global.localStorage;

// Web Crypto
const { webcrypto } = require('crypto');
global.crypto = webcrypto;

// Load sample-plan (UMD -> sets window.SamplePlan since module undefined? No, module defined in node).
const root = path.join(__dirname, '..');
const planSrc = fs.readFileSync(path.join(root, 'sample-plan.js'), 'utf8');
eval(planSrc); // executes UMD; in Node module exists -> exports, does NOT set window.SamplePlan
// Re-expose onto window for app.js
global.window.SamplePlan = require(path.join(root, 'sample-plan.js'));

// Load app.js
const appSrc = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');
eval(appSrc);

const api = global.window.electronAPI;
if (!api) { console.error('electronAPI not exposed'); process.exit(1); }

(async () => {
    let pass = 0, fail = 0;
    function check(name, cond) {
        if (cond) { pass++; console.log('PASS', name); }
        else { fail++; console.log('FAIL', name); }
    }

    // Demo login
    let r = await api.demoLogin();
    check('demoLogin success', r && r.success && r.user.isDemo);

    // Session
    let s = await api.session();
    check('session returns user', s && s.user && s.user.name === 'Rehan Khan');
    check('onboarding completed', s.profile.onboarding.completed === true);

    // sampleSchematic
    let s1 = await api.sampleSchematic();
    check('sampleSchematic dataUrl', s1.success && s1.dataUrl && s1.dataUrl.indexOf('data:image/svg') === 0);

    // analyzeSchematic sample
    let a = await api.analyzeSchematic('SAMPLE_2BHK');
    check('analyzeSchematic sensors', a.success && Array.isArray(a.sensors) && a.sensors.length === 5);

    // signOut
    let so = await api.signOut();
    check('signOut success', so.success);
    check('session null after signout', (await api.session()) === null);

    // Register a fresh user
    r = await api.register({
        name: 'Test User', email: 'test@example.com', phone: '+91 98765 43210',
        password: 'secret12', seniorName: 'Grandpa', seniorAddress: 'Flat 1, Main Rd'
    });
    check('register success', r && r.success && r.user.name === 'Test User');
    s = await api.session();
    check('new user session', s && s.user.email === 'test@example.com');
    check('onboarding not completed', s.profile.onboarding.completed === false);

    // Complete onboarding
    a = await api.analyzeSchematic('x'.repeat(20));
    const plan = await api.sampleSchematic();
    r = await api.completeOnboarding({
        senior: { name: 'Grandpa', age: '78', gender: 'Male', language: 'English', conditions: ['Diabetes'], mobility: 'Walks with cane', photo: null },
        physician: { name: 'Dr A', hospital: 'Hosp', phone: '123' },
        emergencyContact: { name: 'Test User', relation: 'Grandson', phone: '+919876543210' },
        residence: { flat: 'Flat 1', area: 'Main Rd', city: 'Bengaluru', pincode: '560001', buildingType: 'Apartment Complex', floor: '2', elevator: true, lockboxBrand: '', lockboxLocation: '' },
        schematic: { name: 'Plan', dataUrl: plan.dataUrl },
        sensors: a.sensors
    });
    check('completeOnboarding success', r && r.success);
    s = await api.session();
    check('onboarding now completed', s.profile.onboarding.completed === true);

    // Update profile (prefs)
    r = await api.updateProfile({ notificationPreferences: { dailySummary: true, pushAlerts: false } });
    check('updateProfile success', r && r.success && r.profile.caregiver.notificationPreferences.dailySummary === true);

    // login again after signOut
    await api.signOut();
    r = await api.login({ identifier: 'test@example.com', password: 'secret12', remember: true });
    check('login success', r && r.success);

    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
