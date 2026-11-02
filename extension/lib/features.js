/** Optional feature configuration shared by the Shell view and its preferences. */
export const FEATURES = [
    ['volume-indicator', 'Volume indicator', 'Replace the native volume OSD while the notch is available.'],
    ['brightness-indicator', 'Brightness indicator', 'Replace the native brightness OSD on the notch monitor.'],
    ['notification-privacy', 'Notification privacy', 'Hide titles, bodies and actions in notch peeks and Alerts. Native banners are unchanged.'],
    ['bluetooth-battery', 'Bluetooth battery', 'Connected BlueZ devices that expose battery data, plus connection cues.'],
    ['calendar-enabled', 'Calendar tab', 'Show a dedicated monthly calendar tab with date selection. No account access.'],
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

export function sameDate(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Move months without overflowing dates such as January 31 into March. */
export function shiftCalendarMonth(date, delta) {
    const first = new Date(date.getFullYear(), date.getMonth() + delta, 1, 12);
    const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12).getDate();
    return new Date(first.getFullYear(), first.getMonth(), Math.min(date.getDate(), lastDay), 12);
}

/** Local dates (not UTC) avoid day shifts near midnight. Monday is column zero. */
export function calendarMonth(year, month, today = new Date()) {
    const first = new Date(year, month, 1, 12);
    const offset = (first.getDay() + 6) % 7;
    return {year: first.getFullYear(), month: first.getMonth(),
        title: first.toLocaleDateString([], {month: 'long', year: 'numeric'}),
        cells: Array.from({length: 42}, (_, index) => {
            const date = new Date(first.getFullYear(), first.getMonth(), index - offset + 1, 12);
            return {date, day: date.getDate(), inMonth: date.getMonth() === first.getMonth(),
                weekend: index % 7 >= 5, today: sameDate(date, today)};
        })};
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
