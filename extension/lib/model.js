/** True only on a real plug-in transition, never on the first UPower sample. */
export function chargingStarted(previous, next) {
    return !!next?.available && next.state === 1 && !!previous?.available &&
        (previous.state === 2 || previous.state === 5 || previous.state === 6);
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

export function plainText(value) {
    return String(value ?? '')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

/** Count the actual notification cards, not GNOME's unread/banner counter. */
export function countNotifications(sources) {
    let total = 0;
    for (const source of sources ?? []) total += source?.notifications?.length ?? 0;
    return total;
}

/** Keep long notification bodies compact without hiding the full text forever. */
export function previewText(value, limit = 160) {
    const text = plainText(value);
    const max = Math.max(24, Math.floor(Number(limit) || 160));
    if (text.length <= max) return {text, truncated: false};
    return {text: `${text.slice(0, max).trimEnd()}…`, truncated: true};
}
