/** These are controller-contract mocks, not a substitute for a live GNOME session. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {FEATURES} from '../../extension/lib/features.js';

let now = 0;
let nextSource = 0;
const sources = new Map();
const artQueries = [];
let timelineCount = 0;
class Timeline {
    constructor() { timelineCount++; }
    connect() {}
    start() { this.running = true; }
    stop() { this.running = false; }
}
const GLib = {PRIORITY_DEFAULT: 0, SOURCE_REMOVE: false, SOURCE_CONTINUE: true,
    filename_from_uri: uri => [decodeURIComponent(uri.slice('file://'.length)), null],
    get_monotonic_time: () => now * 1000,
    timeout_add_seconds: (_priority, _seconds, callback) => {
        sources.set(++nextSource, callback);
        return nextSource;
    }, source_remove: id => sources.delete(id)};
class Widget {
    constructor(properties = {}) { Object.assign(this, properties); this.children = []; }
    add_child(child) { this.children.push(child); }
    destroy_all_children() { this.children = []; }
    set_width(width) { this.width = width; }
    set_size(width, height) { this.width = width; this.height = height; }
    set_height(height) { this.height = height; }
    set_position(x, y) { this.x = x; this.y = y; }
    get_preferred_width() { return [100, this.text?.length * 10 || 100]; }
    get_preferred_height() { return [25, 25]; }
}
const widgets = {
    setIconSource: (widget, gicon) => { widget.gicon = gicon; },
    box: () => new Widget(), label: (text, style) => new Widget({text, style}),
    wrapLabel: text => new Widget({text}), setText: (widget, text) => { widget.text = text; },
    button: options => new Widget({...options, _notchLabel: new Widget({text: options.text})}),
};
class InjectionManager {
    constructor() { this.originals = []; }
    overrideMethod(object, key, override) {
        this.originals.push([object, key, object[key]]);
        object[key] = override(object[key]);
    }
    clear() {
        for (const [object, key, original] of this.originals) object[key] = original;
        this.originals = [];
    }
}
class Cancellable {
    cancel() { this.cancelled = true; }
    is_cancelled() { return !!this.cancelled; }
}
const bluezRequests = [];
const Gio = {FileQueryInfoFlags: {NOFOLLOW_SYMLINKS: 1}, FileType: {REGULAR: 1},
    FileIcon: class { constructor({file}) { this.file = file; } },
    File: {new_for_path: path => ({path, query_info_async(...args) { artQueries.push({file: this, args}); }, query_info_finish: info => info})},
    BusType: {SYSTEM: 1}, DBusObjectManagerClientFlags: {DO_NOT_AUTO_START: 1}, Cancellable,
    DBusObjectManagerClient: {
        new_for_bus(...args) {
            assert.equal(args.length, 7, 'GJS hides callback user-data/destroy parameters');
            bluezRequests.push(args);
        },
        new_for_bus_finish: result => result,
    }};
let nativeCalls = 0;
const originalOsd = () => { nativeCalls++; };
const Main = {osdWindowManager: {_showOsdWindow: originalOsd, _osdWindows: [{cancel() {}}]}};
const stubs = new Map([
    ['gi://Clutter', {default: {ActorAlign: {CENTER: 1, FILL: 2}, FixedLayout: class {}, Timeline}}],
    ['gi://GLib', {default: GLib}], ['gi://Gio', {default: Gio}],
    ['gi://St', {default: {Icon: Widget, Widget, ScrollView: Widget, PolicyType: {NEVER: 0, AUTOMATIC: 1}}}],
    ['resource:///org/gnome/shell/ui/main.js', Main],
    ['resource:///org/gnome/shell/extensions/extension.js', {InjectionManager}],
    [new URL('../../extension/lib/widgets.js', import.meta.url).href, widgets],
]);
globalThis.__extrasTestStubs = stubs;
const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
        let key = specifier;
        if (specifier.startsWith('.') && context.parentURL) key = new URL(specifier, context.parentURL).href;
        if (stubs.has(key)) return {url: `extras-stub:${key}`, shortCircuit: true};
        return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
        if (!url.startsWith('extras-stub:')) return nextLoad(url, context);
        const key = url.slice('extras-stub:'.length);
        const lines = [`const values = globalThis.__extrasTestStubs.get(${JSON.stringify(key)});`];
        for (const name of Object.keys(stubs.get(key))) lines.push(name === 'default' ?
            'export default values.default;' : `export const ${name} = values.${name};`);
        return {format: 'module', source: lines.join('\n'), shortCircuit: true};
    },
});
const {Extras} = await import('../../extension/lib/extras.js');
const {BluetoothBattery} = await import('../../extension/lib/bluetooth.js');
const {MusicExtras} = await import('../../extension/lib/musicExtras.js');
hooks.deregister();
delete globalThis.__extrasTestStubs;

function fixture() {
    const values = Object.fromEntries(FEATURES.map(([key]) => [key, false]));
    Object.assign(values, {'timer-minutes': 1, 'focus-minutes': 25, 'break-minutes': 5});
    const view = {settings: {get_boolean: key => values[key], get_int: key => values[key]},
        homeDateButton: {}, readOptions: () => ({}), relayout() {}, updateClock() {},
        showCue: (...args) => { view.lastCue = args; }, hideCue() {},
        monitor: () => ({index: 0}), showLevel: () => true};
    const extras = new Extras(view);
    extras.buildHome(new Widget());
    extras.buildSystem(new Widget());
    return {extras, view, values};
}

test('all optional features off create no timer, BlueZ request, or OSD injection', () => {
    const {extras} = fixture();
    const previousRequests = bluezRequests.length;
    extras.configure();
    assert.equal(extras.timerBox.visible, false);
    assert.equal(extras.calendar.visible, false);
    assert.equal(sources.size, 0);
    assert.equal(bluezRequests.length, previousRequests);
    assert.equal(Main.osdWindowManager._showOsdWindow, originalOsd);
    extras.destroy();
});

test('timer controls pause/resume, finish once, alternate Pomodoro, and clean up on disable', () => {
    const {extras, values, view} = fixture();
    values['timer-enabled'] = true;
    extras.configure('timer-enabled');
    extras.resetTimer('focus');
    extras.timerStart.onClick();
    assert.equal(sources.size, 1);
    extras.syncTimer();
    assert.equal(sources.size, 1, 'no duplicate ticking sources');
    now += 10000;
    extras.timerStart.onClick();
    assert.equal(sources.size, 0);
    assert.equal(extras.summary(), 'Ⅱ 24:50');
    extras.timerStart.onClick();
    now += 25 * 60 * 1000;
    const [id, tick] = sources.entries().next().value;
    assert.equal(tick(), false);
    sources.delete(id); // mimic GLib removing a SOURCE_REMOVE callback
    assert.equal(extras.countdown.done, true);
    assert.match(view.lastCue[0], /Focus complete/);
    extras.timerStart.onClick();
    assert.equal(extras.timerMode, 'break');
    assert.equal(extras.countdown.running, true);
    values['timer-enabled'] = false;
    extras.configure('timer-enabled');
    assert.equal(sources.size, 0);
    assert.equal(extras.summary(), '');
    assert.equal(extras.countdown.running, false);
    extras.destroy();
});

test('OSD interception is selective and restores the exact original on disable', () => {
    const {extras, view, values} = fixture();
    nativeCalls = 0;
    values['volume-indicator'] = true;
    extras.configure('volume-indicator');
    const volume = {get_names: () => ['audio-volume-high-symbolic']};
    const brightness = {get_names: () => ['display-brightness-symbolic']};
    Main.osdWindowManager._showOsdWindow(0, volume, '', 0.5, 1);
    assert.equal(nativeCalls, 0);
    Main.osdWindowManager._showOsdWindow(0, brightness, '', 0.5, 1);
    Main.osdWindowManager._showOsdWindow(1, volume, '', 0.5, 1);
    assert.equal(nativeCalls, 2);
    view.showLevel = () => false; // hidden / locked / notification peek
    Main.osdWindowManager._showOsdWindow(0, volume, '', 0.5, 1);
    assert.equal(nativeCalls, 3);
    values['volume-indicator'] = false;
    extras.configure('volume-indicator');
    assert.equal(Main.osdWindowManager._showOsdWindow, originalOsd);
    values['brightness-indicator'] = true;
    extras.configure('brightness-indicator');
    extras.destroy();
    assert.equal(Main.osdWindowManager._showOsdWindow, originalOsd);
});

test('calendar is opt-in and disabling it closes the calendar immediately', () => {
    const {extras, values, view} = fixture();
    extras.configure();
    extras.toggleCalendar();
    assert.equal(extras.calendar.visible, false);
    values['calendar-enabled'] = true;
    extras.configure('calendar-enabled');
    extras.toggleCalendar();
    assert.equal(extras.calendar.visible, true);
    assert.equal(extras.calendar.children.length, 8);
    values['calendar-enabled'] = false;
    extras.configure('calendar-enabled');
    assert.equal(extras.calendar.visible, false);
    assert.equal(view.homeDateButton.can_focus, false);
    extras.destroy();
});

test('BlueZ startup does not peek existing devices, handles updates, and cancels late enable', () => {
    let objects = [];
    let changed = 0;
    let connected = 0;
    let disconnected = false;
    const battery = new BluetoothBattery(() => changed++, () => connected++);
    const request = bluezRequests.at(-1);
    assert.equal(request[2], 'org.bluez');
    const manager = {get_objects: () => objects, connectObject() {}, disconnectObject() { disconnected = true; }};
    request[6](null, manager);
    assert.equal(changed, 1);
    assert.equal(connected, 0);
    objects = [{get_object_path: () => '/test', get_interface: () => ({get_cached_property:
        key => ({deepUnpack: () => ({Connected: true, Alias: 'Headphones', Percentage: 80})[key]})})}];
    battery.refresh();
    assert.equal(connected, 1);
    battery.refresh();
    assert.equal(connected, 1, 'battery changes do not repeat connection cues');
    battery.destroy();
    assert.equal(disconnected, true);
    assert.equal(request[5].cancelled, true);
    const late = new BluetoothBattery(() => { throw new Error('late callback'); }, () => {});
    late.destroy();
    bluezRequests.at(-1)[6](null, manager);
    assert.equal(late.manager, null);
});

function musicFixture() {
    const {view, values} = fixture();
    Object.assign(view, {allowed: true, expanded: true, tab: 'media', motionDuration: value => value,
        media: {players: new Map(), selectPlayer: name => { view.selected = name; }}});
    const music = new MusicExtras(view);
    const title = new Widget({text: 'A very long music title '.repeat(6), clutter_text: {}});
    music.build(new Widget(), title);
    return {music, view, values};
}

test('music motion only runs for overflowing visible titles and respects switches/reduced motion', () => {
    const {music, view, values} = musicFixture();
    const state = {names: ['a'], name: 'a', artUrl: ''};
    music.update(state);
    assert.equal(music.timeline, null);
    values['music-polish'] = true;
    music.update(state);
    assert.ok(music.timeline.running);
    const count = timelineCount;
    music.update(state);
    assert.equal(timelineCount, count, 'polls do not restart the same animation');
    view.expanded = false;
    music.syncMotion();
    assert.equal(music.timeline, null);
    view.expanded = true;
    view.motionDuration = () => 0;
    music.syncMotion();
    assert.equal(music.timeline, null);
    view.motionDuration = value => value;
    music.title.text = 'Short';
    music.update(state);
    assert.equal(music.timeline, null);
    music.title.text = 'Long title '.repeat(50);
    music.update(state);
    assert.ok(music.timeline);
    values['music-polish'] = false;
    music.update(state);
    assert.equal(music.timeline, null);
    assert.equal(music.title.clutter_text.line_wrap, true);
    music.destroy();
});

test('direct player picker chooses exactly the requested player and disappears when off', () => {
    const {music, view, values} = musicFixture();
    values['music-polish'] = true;
    music.update({names: ['a', 'b'], name: 'a', artUrl: ''});
    assert.equal(music.players.visible, true);
    music.players.children[1].onClick();
    assert.equal(view.selected, 'b');
    values['music-polish'] = false;
    music.update({names: ['a', 'b'], name: 'a', artUrl: ''});
    assert.equal(music.players.visible, false);
    music.destroy();
});

test('artwork never queries HTTP URLs, rejects unsafe files, and ignores cancelled late loads', () => {
    const {music, values} = musicFixture();
    const state = {names: ['a'], name: 'a'};
    const before = artQueries.length;
    music.update({...state, artUrl: 'file:///tmp/art.png'});
    assert.equal(artQueries.length, before, 'art off means no file access');
    values['media-art'] = true;
    music.update({...state, artUrl: 'https://example.com/art.png'});
    music.update({...state, artUrl: 'file://server/art.png'});
    assert.equal(artQueries.length, before);
    const info = (mime, size = 100, type = 1) => ({get_content_type: () => mime, get_size: () => size, get_file_type: () => type});
    const finish = (query, result) => query.args.at(-1)(query.file, result);
    music.update({...state, artUrl: 'file:///tmp/a.png'});
    finish(artQueries.at(-1), info('image/png', 11 * 1024 * 1024));
    assert.equal(music.art.visible, false);
    music.update({...state, artUrl: 'file:///tmp/b.svg'});
    finish(artQueries.at(-1), info('image/svg+xml'));
    assert.equal(music.art.visible, false);
    music.update({...state, artUrl: 'file:///tmp/c.png'});
    const pending = artQueries.at(-1);
    values['media-art'] = false;
    music.update({...state, artUrl: 'file:///tmp/c.png'});
    finish(pending, info('image/png'));
    assert.equal(music.art.visible, false);
    values['media-art'] = true;
    music.update({...state, artUrl: 'file:///tmp/d.png'});
    finish(artQueries.at(-1), info('image/png'));
    assert.equal(music.art.visible, true);
    music.destroy();
    assert.equal(music.art.gicon, null);
});
