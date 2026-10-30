/** Dependency-free models, also exercised by Node and GJS tests. */
export function unwrap(value) {
    return value?.deepUnpack ? value.deepUnpack() : value;
}

export function mediaMetadata(raw) {
    const metadata = unwrap(raw) ?? {};
    const string = (key, fallback = '') =>
        typeof metadata[key] === 'string' ? metadata[key] : fallback;
    const artists = metadata['xesam:artist'];
    const number = (key, fallback = 0) => {
        const n = Number(metadata[key] ?? fallback);
        return Number.isFinite(n) && n >= 0 ? n : fallback;
    };
    const trackId = string('mpris:trackid');
    return {
        title: string('xesam:title', 'Nothing playing'),
        artist: Array.isArray(artists) ? artists.filter(x => typeof x === 'string').join(', ') : '',
        album: string('xesam:album'),
        artUrl: string('mpris:artUrl'),
        lengthUs: number('mpris:length'),
        trackId: /^\/[A-Za-z0-9_/.]*$/.test(trackId) ? trackId : '',
    };
}

export function seekTarget(lengthUs, fraction) {
    return Math.round(Math.max(0, Math.min(1, fraction)) * Math.max(0, lengthUs));
}

export function cpuSample(text, previous = null) {
    const line = text.split('\n').find(l => /^cpu\s/.test(l));
    if (!line) return {percent: null, raw: null};
    // user nice system idle iowait irq softirq steal guest guest_nice.
    // guest time is already included in user/nice: never count it twice.
    const values = line.trim().split(/\s+/).slice(1, 9).map(Number);
    if (values.length !== 8 || values.some(n => !Number.isFinite(n) || n < 0))
        return {percent: null, raw: null};
    const total = values.reduce((a, b) => a + b, 0);
    const idle = values[3] + values[4];
    let percent = null;
    if (previous && total > previous.total && idle >= previous.idle)
        percent = Math.max(0, Math.min(100, 100 * (1 - (idle - previous.idle) / (total - previous.total))));
    return {percent, raw: {total, idle}};
}

export function memorySample(text) {
    const values = {};
    for (const match of text.matchAll(/^([A-Za-z()]+):\s+(\d+)\s+kB/gm))
        values[match[1]] = Number(match[2]) * 1024;
    const total = values.MemTotal;
    const available = values.MemAvailable;
    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(available))
        return {percent: null, used: null, total: null};
    const used = Math.max(0, total - available);
    return {percent: Math.min(100, 100 * used / total), used, total};
}

export function networkSample(text, previous = null, elapsedSeconds = 1, defaultInterface = '') {
    let rx = 0;
    let tx = 0;
    let found = false;
    let selected = '';
    for (const line of text.split('\n').slice(2)) {
        const parts = line.trim().split(/[\s:]+/);
        if (parts.length < 17) continue;
        const name = parts[0];
        if (defaultInterface ? name !== defaultInterface :
            name === 'lo' || /^(veth|docker|br-|virbr|tun|tap)/.test(name)) continue;
        const receive = Number(parts[1]);
        const transmit = Number(parts[9]);
        if (!Number.isFinite(receive) || !Number.isFinite(transmit)) continue;
        rx += receive;
        tx += transmit;
        selected = defaultInterface || name;
        found = true;
    }
    const raw = found ? {rx, tx, interface: selected} : null;
    let download = null;
    let upload = null;
    if (raw && previous?.interface === selected && elapsedSeconds > 0 &&
        rx >= previous.rx && tx >= previous.tx) {
        download = (rx - previous.rx) / elapsedSeconds;
        upload = (tx - previous.tx) / elapsedSeconds;
    }
    return {download, upload, raw};
}

export function defaultRouteInterface(text) {
    for (const line of text.split('\n').slice(1)) {
        const p = line.trim().split(/\s+/);
        if (p.length >= 8 && p[1] === '00000000' && (Number(p[3]) & 2))
            return p[0];
    }
    return '';
}

export function formatBytes(bytes, suffix = '') {
    if (!Number.isFinite(bytes)) return '—';
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    let value = Math.max(0, bytes);
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
    return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}${suffix}`;
}

export function formatTime(microseconds) {
    const seconds = Math.max(0, Math.floor((Number(microseconds) || 0) / 1e6));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function safeTextMimetype(types) {
    const allowed = new Set(['text/plain', 'text/plain;charset=utf-8', 'UTF8_STRING',
        'STRING', 'TEXT', 'COMPOUND_TEXT', 'TARGETS', 'TIMESTAMP', 'MULTIPLE', 'SAVE_TARGETS']);
    if (!types.length) return '';
    // Be conservative: mixed rich/secret clipboard offers are never read.
    if (types.some(t => /password|conceal|secret|sensitive|privacy/i.test(t) || !allowed.has(t)))
        return '';
    return ['text/plain;charset=utf-8', 'UTF8_STRING', 'text/plain', 'STRING']
        .find(t => types.includes(t)) ?? '';
}

export class ClipboardHistory {
    constructor(limit = 20, maxCharacters = 65536) {
        this.limit = Math.max(1, Math.min(50, limit));
        this.maxCharacters = maxCharacters;
        this.items = [];
        this.nextId = 1;
    }

    add(text, now = Date.now()) {
        if (typeof text !== 'string' || !text.trim() || text.length > this.maxCharacters) return false;
        if ([...text].some(character => {
            const code = character.charCodeAt(0);
            return code < 32 && code !== 9 && code !== 10 && code !== 13;
        })) return false;
        if (this.items[0]?.text === text) return false;
        this.items = this.items.filter(item => item.text !== text);
        this.items.unshift({id: this.nextId++, text, now});
        this.items.length = Math.min(this.items.length, this.limit);
        return true;
    }

    setLimit(limit) {
        this.limit = Math.max(1, Math.min(50, limit));
        this.items.length = Math.min(this.items.length, this.limit);
    }

    get(id) { return this.items.find(item => item.id === id); }
    clear() { this.items = []; }
}
