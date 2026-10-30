/** Dependency-free models, also exercised by Node and GJS tests. */
export function unwrap(value, depth = 0) {
    if (depth > 8 || value === null || value === undefined) return value;
    if (typeof value?.deepUnpack === 'function') return unwrap(value.deepUnpack(), depth + 1);
    if (Array.isArray(value)) return value.map(item => unwrap(item, depth + 1));
    if (typeof value === 'object') {
        const result = {};
        for (const [key, item] of Object.entries(value)) result[key] = unwrap(item, depth + 1);
        return result;
    }
    return value;
}

export function mediaMetadata(raw) {
    const metadata = unwrap(raw) ?? {};
    const string = (key, fallback = '') => {
        const value = metadata[key];
        return typeof value === 'string' && value.trim() ? value.trim() : fallback;
    };
    const artists = metadata['xesam:artist'];
    const artistList = Array.isArray(artists) ? artists : typeof artists === 'string' ? [artists] : [];
    const number = (key, fallback = 0) => {
        const n = Number(metadata[key] ?? fallback);
        return Number.isFinite(n) && n >= 0 ? n : fallback;
    };
    const trackId = string('mpris:trackid');
    return {
        title: string('xesam:title'),
        artist: artistList.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()).join(', '),
        album: string('xesam:album'),
        artUrl: string('mpris:artUrl'),
        lengthUs: number('mpris:length'),
        trackId: /^\/[A-Za-z0-9_/.]*$/.test(trackId) ? trackId : '',
    };
}

/** Never show a blank/“Nothing playing” title while a player is actually active. */
export function mediaDisplayTitle(state) {
    if (state?.title) return state.title;
    if (state?.names?.length && state.status === 'Playing')
        return `Playing in ${state.identity || 'media player'}`;
    if (state?.names?.length && state.status === 'Paused')
        return `Paused in ${state.identity || 'media player'}`;
    return 'Nothing playing';
}

export function mediaDisplayArtist(state) {
    if (state?.artist) return state.artist;
    if (state?.names?.length) return state.identity || 'Media player';
    return 'No media player connected';
}

/** Smooth closed-notch equalizer targets. Values are scale_y, not CSS heights. */
export const VISUALIZER_PATTERN = Object.freeze([
    [0.42, 0.88, 0.58],
    [0.72, 0.48, 1.00],
    [1.00, 0.34, 0.70],
    [0.58, 0.82, 0.40],
    [0.34, 1.00, 0.76],
    [0.84, 0.54, 0.34],
    [0.56, 0.74, 0.94],
    [0.94, 0.40, 0.60],
]);

export function visualizerLevels(step) {
    const length = VISUALIZER_PATTERN.length;
    const index = ((Math.trunc(Number(step) || 0) % length) + length) % length;
    return VISUALIZER_PATTERN[index];
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

/** Convert GNOME notification markup to safe single-line/plain display text. */
export function plainText(value) {
    return String(value ?? '')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

/** Turn low-level helper activation failures into a short, actionable message. */
export function helperErrorMessage(message) {
    const text = String(message ?? '');
    if (/NameHasNoOwner|ServiceUnknown|Could not activate|startup request failed|Spawn/i.test(text))
        return 'File shelf helper could not start. Press Retry on the Shelf page, or run notch-doctor.';
    if (/AccessDenied|not allowed/i.test(text))
        return 'File shelf helper was blocked by session policy. Run notch-doctor for details.';
    if (/NoReply|Timeout|timed out/i.test(text))
        return 'File shelf helper did not respond. Press Retry on the Shelf page.';
    if (/UnknownMethod|Unknown method/i.test(text))
        return 'File shelf helper is outdated. Re-run the Notch installer and log out/in.';
    return text ? `File shelf: ${text.replace(/\s+/g, ' ').slice(0, 180)}` :
        'File shelf is unavailable. Press Retry on the Shelf page.';
}
