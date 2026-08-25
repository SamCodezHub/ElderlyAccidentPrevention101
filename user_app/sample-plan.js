'use strict';

const SAMPLE_SENSORS = [
    { id: 'SNS-01', room: 'Master Bathroom', zone: 'Wet Zone', risk: 'critical', x: 41, y: 4.8, w: 22, h: 29, px: 52, py: 17, confidence: 97, baseHeight: 1.15 },
    { id: 'SNS-02', room: 'Transit Corridor', zone: 'Bedroom-to-Bathroom Path', risk: 'high', x: 41, y: 33.9, w: 22, h: 11.3, px: 52, py: 39.5, confidence: 94, baseHeight: 1.35 },
    { id: 'SNS-03', room: 'Master Bedroom', zone: 'Bedside Corridor', risk: 'high', x: 33, y: 6, w: 8, h: 36, px: 37, py: 24, confidence: 92, baseHeight: 1.3 },
    { id: 'SNS-04', room: 'Kitchen', zone: 'Stove & Wet Floor', risk: 'medium', x: 59, y: 45.1, w: 18, h: 22.6, px: 68, py: 56, confidence: 90, baseHeight: 1.25 },
    { id: 'SNS-05', room: 'Living Room', zone: 'Seating Area', risk: 'medium', x: 12, y: 58.1, w: 24, h: 29, px: 24, py: 72, confidence: 89, baseHeight: 1.4 }
];

const TEMPLATES = [
    { room: 'Bathroom', zone: 'Wet Zone', risk: 'critical' },
    { room: 'Transit Corridor', zone: 'Bedroom-to-Bathroom Path', risk: 'high' },
    { room: 'Bedroom', zone: 'Bedside Corridor', risk: 'high' },
    { room: 'Kitchen', zone: 'Stove & Wet Floor', risk: 'medium' },
    { room: 'Living Room', zone: 'Seating Area', risk: 'medium' },
    { room: 'Entry Foyer', zone: 'Doorway & Shoe Area', risk: 'low' }
];

function buildSamplePlanSVG() {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 620">' +
        '<rect x="8" y="8" width="984" height="604" fill="#10131c"/>' +
        '<rect x="30" y="30" width="940" height="580" fill="#141826" stroke="#8fa3bf" stroke-width="5"/>' +
        '<line x1="410" y1="30" x2="410" y2="280" stroke="#55647d" stroke-width="3"/>' +
        '<line x1="630" y1="30" x2="630" y2="280" stroke="#55647d" stroke-width="3"/>' +
        '<line x1="410" y1="210" x2="630" y2="210" stroke="#55647d" stroke-width="3"/>' +
        '<line x1="30" y1="280" x2="970" y2="280" stroke="#55647d" stroke-width="3"/>' +
        '<line x1="590" y1="280" x2="590" y2="610" stroke="#55647d" stroke-width="3"/>' +
        '<rect x="480" y="205" width="44" height="10" fill="#141826"/>' +
        '<rect x="295" y="275" width="10" height="46" fill="#141826"/>' +
        '<rect x="755" y="275" width="10" height="46" fill="#141826"/>' +
        '<rect x="585" y="430" width="48" height="10" fill="#141826"/>' +
        '<rect x="60" y="60" width="150" height="190" fill="none" stroke="#46536e" stroke-width="2"/>' +
        '<rect x="60" y="60" width="150" height="34" fill="none" stroke="#46536e" stroke-width="2"/>' +
        '<rect x="330" y="70" width="70" height="180" fill="none" stroke="#3a4660" stroke-width="2"/>' +
        '<rect x="660" y="60" width="140" height="170" fill="none" stroke="#46536e" stroke-width="2"/>' +
        '<rect x="660" y="60" width="140" height="32" fill="none" stroke="#46536e" stroke-width="2"/>' +
        '<rect x="60" y="420" width="220" height="60" fill="none" stroke="#46536e" stroke-width="2"/>' +
        '<rect x="60" y="330" width="60" height="150" fill="none" stroke="#46536e" stroke-width="2"/>' +
        '<circle cx="200" cy="400" r="26" fill="none" stroke="#46536e" stroke-width="2"/>' +
        '<rect x="380" y="330" width="12" height="130" fill="none" stroke="#3a4660" stroke-width="2"/>' +
        '<rect x="600" y="300" width="350" height="60" fill="none" stroke="#46536e" stroke-width="2"/>' +
        '<circle cx="645" cy="330" r="11" fill="none" stroke="#46536e" stroke-width="2"/>' +
        '<circle cx="680" cy="330" r="11" fill="none" stroke="#46536e" stroke-width="2"/>' +
        '<rect x="850" y="315" width="64" height="30" fill="none" stroke="#46536e" stroke-width="2"/>' +
        '<rect x="640" y="480" width="170" height="90" fill="none" stroke="#3a4660" stroke-width="2"/>' +
        '<rect x="440" y="42" width="42" height="56" rx="9" fill="none" stroke="#46536e" stroke-width="2"/>' +
        '<circle cx="600" cy="72" r="16" fill="none" stroke="#46536e" stroke-width="2"/>' +
        '<rect x="418" y="118" width="84" height="84" fill="none" stroke="#46536e" stroke-width="2"/>' +
        '<line x1="418" y1="118" x2="502" y2="202" stroke="#3a4660" stroke-width="1.5"/>' +
        '<line x1="502" y1="118" x2="418" y2="202" stroke="#3a4660" stroke-width="1.5"/>' +
        '<text x="220" y="168" font-family="Consolas,monospace" font-size="17" letter-spacing="3" fill="#93a4bd" text-anchor="middle">MASTER BEDROOM</text>' +
        '<text x="520" y="128" font-family="Consolas,monospace" font-size="13" letter-spacing="2" fill="#93a4bd" text-anchor="middle">BATHROOM</text>' +
        '<text x="520" y="251" font-family="Consolas,monospace" font-size="11" letter-spacing="2" fill="#5f6f8c" text-anchor="middle">CORRIDOR</text>' +
        '<text x="800" y="168" font-family="Consolas,monospace" font-size="17" letter-spacing="3" fill="#93a4bd" text-anchor="middle">BEDROOM 2</text>' +
        '<text x="310" y="452" font-family="Consolas,monospace" font-size="17" letter-spacing="3" fill="#93a4bd" text-anchor="middle">LIVING ROOM</text>' +
        '<text x="780" y="452" font-family="Consolas,monospace" font-size="17" letter-spacing="3" fill="#93a4bd" text-anchor="middle">KITCHEN</text>' +
        '<text x="952" y="58" font-family="Consolas,monospace" font-size="14" fill="#5f6f8c" text-anchor="end">N</text>' +
        '<line x1="938" y1="66" x2="952" y2="44" stroke="#5f6f8c" stroke-width="2"/>' +
        '<line x1="48" y1="592" x2="108" y2="592" stroke="#5f6f8c" stroke-width="2"/>' +
        '<line x1="48" y1="586" x2="48" y2="598" stroke="#5f6f8c" stroke-width="2"/>' +
        '<line x1="108" y1="586" x2="108" y2="598" stroke="#5f6f8c" stroke-width="2"/>' +
        '<text x="122" y="597" font-family="Consolas,monospace" font-size="12" fill="#5f6f8c">5m</text>' +
        '</svg>';
}

function samplePlanDataUrl() {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(buildSamplePlanSVG());
}

function hashSeed(str) {
    let h = 2166136261;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function mulberry32(a) {
    return function () {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function scanLogFor(count) {
    return [
        'Initializing spatial graph…',
        'Detecting room boundaries via wall segmentation…',
        'Classifying wet zones and transit corridors…',
        'Evaluating fall-risk heatmap…',
        'Optimizing 24GHz mmWave placements…',
        'Analysis complete — ' + count + ' high-risk zones identified'
    ];
}

function analyzeSchematic(seedStr) {
    if (seedStr === 'SAMPLE_2BHK') {
        return { sensors: JSON.parse(JSON.stringify(SAMPLE_SENSORS)), scanLog: scanLogFor(SAMPLE_SENSORS.length) };
    }
    const rnd = mulberry32(hashSeed(seedStr));
    const count = 4 + Math.floor(rnd() * 3);
    const pool = TEMPLATES.slice();
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const sensors = [];
    for (let i = 0; i < count; i++) {
        const t = pool[i % pool.length];
        const w = 14 + Math.round(rnd() * 14);
        const h = 12 + Math.round(rnd() * 18);
        const x = Math.min(80, Math.round(8 + rnd() * 60));
        const y = Math.min(74, Math.round(6 + rnd() * 62));
        sensors.push({
            id: 'SNS-' + String(i + 1).padStart(2, '0'),
            room: t.room,
            zone: t.zone,
            risk: t.risk,
            x,
            y,
            w,
            h,
            px: Math.min(96, x + Math.round(w / 2)),
            py: Math.min(96, y + Math.round(h / 2)),
            confidence: 86 + Math.floor(rnd() * 12),
            baseHeight: Math.round((1.05 + rnd() * 0.4) * 100) / 100
        });
    }
    return { sensors, scanLog: scanLogFor(count) };
}

module.exports = { SAMPLE_SENSORS, samplePlanDataUrl, analyzeSchematic };
