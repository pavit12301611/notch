/** Optional feature configuration shared by the Shell view and its preferences. */
export const FEATURES = [
    ['timer-enabled', 'Timer / Pomodoro', 'Countdown on Home and in the closed notch. Switching off resets it.'],
    ['volume-indicator', 'Volume indicator', 'Replace the native volume OSD while the notch is available.'],
    ['brightness-indicator', 'Brightness indicator', 'Replace the native brightness OSD on the notch monitor.'],
    ['notification-privacy', 'Notification privacy', 'Hide titles, bodies and actions in notch peeks and Alerts. Native banners are unchanged.'],
    ['bluetooth-battery', 'Bluetooth battery', 'Connected BlueZ devices that expose battery data, plus connection cues.'],
    ['calendar-enabled', 'Mini calendar', 'Click the Home date to open a local monthly calendar. No account access.'],
    ['per-app-peeks', 'Per-app notification peeks', 'Selected apps stay in Alerts without a notch peek. GNOME policy still applies.'],
    ['music-polish', 'Music title scrolling & player picker', 'Scroll overflowing titles and choose a player directly. Respects reduced motion.'],
    ['media-art', 'Local album artwork', 'Show local MPRIS artwork only. No remote image downloads.'],
];

export function notificationAppId(source) {
    const id = source?.app?.get_id?.() || source?.policy?.id;
    return id && id !== 'generic' ? String(id).replace(/\.desktop$/, '') : String(source?.title || 'Unknown app');
}

export function peekAllowed(source, enabled, blocked) {
    if (!enabled) return true;
    const id = notificationAppId(source);
    return !blocked.some(value => value.trim().replace(/\.desktop$/, '') === id);
}

export function notificationText(notification, privacy) {
    if (privacy) return {title: notification.source?.title || 'Notification', body: 'New notification'};
    return {title: notification.title || notification.source?.title || 'Notification', body: notification.body || ''};
}

/** Local dates (not UTC) avoid day shifts near midnight. Monday is column zero. */
export function calendarMonth(year, month, today = new Date()) {
    const first = new Date(year, month, 1, 12);
    const offset = (first.getDay() + 6) % 7;
    const days = new Date(year, month + 1, 0, 12).getDate();
    return {year: first.getFullYear(), month: first.getMonth(),
        title: first.toLocaleDateString([], {month: 'long', year: 'numeric'}),
        cells: Array.from({length: 42}, (_, index) => {
            const day = index - offset + 1;
            return {day: day > 0 && day <= days ? day : null,
                today: day > 0 && day <= days && today.getFullYear() === first.getFullYear() &&
                    today.getMonth() === first.getMonth() && today.getDate() === day};
        })};
}

export function countdownText(seconds) {
    const value = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

/** Injected monotonic clock makes pause/resume and delayed ticks deterministic. */
export class Countdown {
    constructor(now) {
        this.now = now;
        this.reset(25 * 60);
    }
    reset(seconds) {
        this.duration = Math.max(1, seconds);
        this.remaining = this.duration;
        this.running = false;
        this.done = false;
    }
    seconds() {
        return this.running ? Math.max(0, (this.deadline - this.now()) / 1000) : this.remaining;
    }
    start() {
        if (this.running || this.done) return;
        this.deadline = this.now() + this.remaining * 1000;
        this.running = true;
    }
    pause() {
        if (!this.running) return;
        this.remaining = this.seconds();
        this.running = false;
    }
    tick() {
        if (!this.running || this.seconds() > 0) return false;
        this.remaining = 0;
        this.running = false;
        this.done = true;
        return true;
    }
}

/** Only recognized level OSDs are routed. Microphone and unrelated OSDs stay native. */
export function osdKind(gicon) {
    const names = gicon?.get_names?.() ?? [];
    if (names.some(name => /^audio-volume-(muted|low|medium|high)(-symbolic)?$/.test(name))) return 'volume';
    if (names.some(name => /^(display|keyboard)-brightness(-symbolic)?$/.test(name))) return 'brightness';
    return null;
}

export function bluetoothDevices(objects) {
    const read = (iface, key) => iface?.get_cached_property(key)?.deepUnpack();
    return objects.flatMap(object => {
        const device = object.get_interface('org.bluez.Device1');
        const battery = object.get_interface('org.bluez.Battery1');
        const percent = read(battery, 'Percentage');
        if (!read(device, 'Connected')) return [];
        return [{path: object.get_object_path(), name: read(device, 'Alias') || 'Bluetooth device',
            percent: Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : null}];
    }).sort((a, b) => a.path.localeCompare(b.path));
}
