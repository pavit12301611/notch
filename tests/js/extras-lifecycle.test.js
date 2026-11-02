/** These are controller-contract mocks, not a substitute for a live GNOME session. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {FEATURES} from '../../extension/lib/features.js';

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
};

class Widget {
    constructor(properties = {}) { Object.assign(this, properties); this.children = []; }
    add_child(child) { this.children.push(child); }
    connect() {}
    remove_all_transitions() {}
    get_children() { return this.children; }
    grab_key_focus() { this.focused = true; }
    destroy_all_children() { this.children = []; }
    set_width(width) { this.width = width; }
    set_size(width, height) { this.width = width; this.height = height; }
    set_height(height) { this.height = height; }
    set_position(x, y) { this.x = x; this.y = y; }
    get_preferred_width() { return [100, this.text?.length * 10 || 100]; }
    get_preferred_height() { return [25, 25]; }
}
const widgets = {
    icon: () => new Widget(), sourceIcon: () => new Widget(), emptyState: () => new Widget(),
    slider: () => new Widget(), setSensitive() {},
    setIconSource: (widget, gicon) => { widget.gicon = gicon; },
    box: () => new Widget(), label: (text, style) => new Widget({text, style}),
    wrapLabel: text => new Widget({text}), setText: (widget, text) => { widget.text = text; },
    pageBox: () => new Widget(),
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
const Main = {overview: {visible: false}, sessionMode: {isLocked: false, isGreeter: false}, layoutManager: {},
    osdWindowManager: {_showOsdWindow: originalOsd, _osdWindows: [{cancel() {}}]}};
const stubs = new Map([
    ['gi://Clutter', {default: {ActorAlign: {CENTER: 1, FILL: 2, START: 0, END: 3}, BinLayout: class {}, ModifierType: {CONTROL_MASK: 1, MOD1_MASK: 2, SUPER_MASK: 4}, KEY_Left: 100, KEY_Right: 101, KEY_Up: 102, KEY_Down: 103, KEY_Page_Up: 104, KEY_Page_Down: 105, KEY_Home: 106, EVENT_STOP: true, EVENT_PROPAGATE: false, FixedLayout: class {}, Timeline}}],
    ['gi://GnomeDesktop?version=4.0', {default: {}}],
    ['resource:///org/gnome/shell/ui/messageTray.js', {Urgency: {CRITICAL: 2}}],
    [new URL('../../extension/lib/surface.js', import.meta.url).href, {NotchSurface: class {}}],
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
const {CalendarPage} = await import('../../extension/lib/calendar.js');
const {NotchView} = await import('../../extension/lib/view.js');
hooks.deregister();
delete globalThis.__extrasTestStubs;

function fixture() {
    const values = Object.fromEntries(FEATURES.map(([key]) => [key, false]));
    const view = {settings: {get_boolean: key => values[key], get_int: key => values[key]},
        readOptions: () => ({}), relayout() {}, updateClock() {},
        showCue: (...args) => { view.lastCue = args; }, hideCue() {},
        monitor: () => ({index: 0}), showLevel: () => true};
    const extras = new Extras(view);
    extras.buildSystem(new Widget());
    return {extras, view, values};
}

test('all optional features off create no BlueZ request or OSD injection', () => {
    const {extras} = fixture();
    const previousRequests = bluezRequests.length;
    extras.configure();
    assert.equal(bluezRequests.length, previousRequests);
    assert.equal(Main.osdWindowManager._showOsdWindow, originalOsd);
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

test('calendar is a separate styled page with 42 selectable dates and stable navigation', () => {
    const calendar = new CalendarPage();
    assert.equal(calendar.grid.children.length, 0, 'disabled calendar does no rendering');
    calendar.setEnabled(true);
    assert.equal(calendar.grid.children.length, 7, 'weekday row plus six date rows');
    const dates = calendar.grid.children.slice(1).flatMap(row => row.children.map(slot => slot.children[0]));
    assert.equal(dates.length, 42);
    assert.equal(dates.filter(day => day.can_focus).length, 1, 'roving keyboard focus');
    assert.equal(dates.filter(day => day.style.includes('notch-calendar-selected')).length, 1);
    assert.equal(dates.filter(day => day.style.includes('notch-calendar-today')).length, 1);
    assert.ok(calendar.selectedButton.accessibleName.includes('selected'));
    calendar.choose(new Date(2024, 0, 31, 12));
    calendar.next.onClick();
    assert.equal(calendar.selected.getMonth(), 1);
    assert.equal(calendar.selected.getDate(), 29);
    calendar.previous.onClick();
    assert.equal(calendar.selected.getMonth(), 0);
    calendar.todayButton.onClick();
    assert.equal(calendar.selected.toDateString(), new Date().toDateString());
    calendar.destroy();
});

test('calendar keyboard crosses month boundaries, supports paging/Today, and preserves Escape', () => {
    const calendar = new CalendarPage();
    calendar.setEnabled(true);
    calendar.choose(new Date(2024, 1, 29, 12));
    const press = (key, state = 0) => calendar.keyPressed({get_key_symbol: () => key, get_state: () => state});
    assert.equal(press(101), true); // right
    assert.equal(calendar.selected.getMonth(), 2);
    assert.equal(calendar.selected.getDate(), 1);
    assert.equal(calendar.selectedButton.focused, true);
    press(102); // up one week
    assert.equal(calendar.selected.getDate(), 23);
    assert.equal(calendar.selected.getMonth(), 1);
    press(105); // next month
    assert.equal(calendar.selected.getMonth(), 2);
    press(104); // previous month
    assert.equal(calendar.selected.getMonth(), 1);
    assert.equal(press(101, 4), false, 'do not intercept Super shortcuts');
    assert.equal(press(999), false, 'Escape and unrelated keys propagate');
    press(106); // Home
    assert.equal(calendar.selected.toDateString(), new Date().toDateString());
    calendar.setEnabled(false);
    assert.equal(press(101), false);
    calendar.destroy();
});

test('calendar adapts equal-width slots and overflows vertically without horizontal spill', () => {
    const calendar = new CalendarPage();
    calendar.setEnabled(true);
    for (const width of [200, 320, 480, 600]) {
        for (const cssScale of [1, 2]) {
            calendar.adapt({width, cssScale, textScale: 2, effectiveWidth: width / 2});
            const row = calendar.grid.children[1];
            assert.ok(row.children.every(slot => slot.width === calendar.cellWidth));
            assert.ok(7 * calendar.cellWidth + 18 * cssScale <= calendar.card.width - 24 * cssScale);
            assert.equal(calendar.cellHeight, 60 * cssScale);
            assert.equal(calendar.header.vertical, true);
        }
    }
    calendar.destroy();
});

test('calendar master switch hides its tab/slot and returns an active Calendar to Home', () => {
    let enabled = true;
    const calendarTab = new Widget();
    const calendarSlot = new Widget();
    const homeTab = new Widget();
    const container = new Widget();
    const view = {
        settings: {get_boolean: () => enabled}, calendarPage: new CalendarPage(),
        tabButtons: new Map([['calendar', calendarTab], ['home', homeTab]]),
        tabSlots: new Map([['calendar', calendarSlot]]), pageContainers: {calendar: container},
        tab: 'calendar', expanded: true, selectTab: id => { view.tab = id; },
    };
    NotchView.prototype.syncCalendarTab.call(view);
    assert.equal(calendarTab.visible, true);
    assert.equal(calendarSlot.visible, true);
    enabled = false;
    NotchView.prototype.syncCalendarTab.call(view);
    assert.equal(view.tab, 'home');
    assert.equal(homeTab.focused, true);
    assert.equal(calendarTab.visible, false);
    assert.equal(calendarTab.can_focus, false);
    assert.equal(calendarSlot.visible, false);
    assert.equal(container.visible, false);
    assert.equal(container.reactive, false);
    assert.equal(view.calendarPage.enabled, false);
    // Direct/programmatic tab selection must not open a disabled calendar either.
    NotchView.prototype.selectTab.call({pages: {calendar: {}}, settings: view.settings}, 'calendar');
    view.calendarPage.destroy();
});

function overviewFixture() {
    const oldDisplay = global.display;
    const oldTop = global.top_window_group;
    const oldLayout = {...Main.layoutManager};
    const children = [];
    const parent = {
        set_child_above_sibling(actor, sibling) {
            children.splice(children.indexOf(actor), 1);
            children.splice(children.indexOf(sibling) + 1, 0, actor);
        },
        set_child_below_sibling(actor, sibling) {
            children.splice(children.indexOf(actor), 1);
            children.splice(children.indexOf(sibling), 0, actor);
        },
    };
    const actor = name => ({name, get_parent: () => parent});
    const overview = actor('overview');
    const shield = actor('lock shield');
    const top = actor('top windows');
    const notch = actor('notch');
    const modal = actor('modal');
    children.push(overview, shield, notch, top, modal);
    Object.assign(Main.layoutManager, {uiGroup: parent, overviewGroup: overview});
    let fullscreen = false;
    global.display = {get_monitor_in_fullscreen: () => fullscreen};
    global.top_window_group = top;
    const values = {'hide-in-overview': false, 'hide-on-fullscreen': true,
        'notifications-in-notch': true, 'volume-indicator': true};
    const view = {
        settings: {get_boolean: key => values[key]}, allowed: true, expanded: true, mode: 'open', tab: 'media',
        actor: notch, monitor: () => ({index: 0}), reserve: {}, hideCue() { this.cueHidden = true; },
        syncPanelClock() {}, syncVisualizer() {}, musicExtras: {syncMotion() {}},
        diagnostics: {setActive() {}}, media: {setPositionActive: active => { view.positionActive = active; }},
        notifications: {configure: (_enabled, allowed) => { view.notificationAllowed = allowed; }},
        setExpanded: expanded => { view.expanded = expanded; view.mode = expanded ? 'open' : 'closed'; },
        showCue: () => view.allowed && view.mode !== 'peek',
        statusLevel: {_notchSet: value => { view.indicatedLevel = value; }},
        cueIcon: {}, cueText: {}, cueLevel: {_notchSet: value => { view.indicatedLevel = value; }},
    };
    view.syncOverviewStacking = inOverview => NotchView.prototype.syncOverviewStacking.call(view, inOverview);
    view.showLevel = (...args) => NotchView.prototype.showLevel.call(view, ...args);
    const sync = () => NotchView.prototype.syncVisibility.call(view);
    const restore = () => {
        global.display = oldDisplay;
        global.top_window_group = oldTop;
        for (const key of Object.keys(Main.layoutManager)) delete Main.layoutManager[key];
        Object.assign(Main.layoutManager, oldLayout);
        Main.overview.visible = false;
        Main.sessionMode.isLocked = false;
        Main.sessionMode.isGreeter = false;
    };
    return {view, values, sync, restore, children, overview, shield, notch, top, modal,
        setFullscreen: value => { fullscreen = value; }};
}

test('Super overview keeps Music active and lifts notch above workspaces, below lock/modal layers', () => {
    const f = overviewFixture();
    try {
        f.sync();
        assert.equal(f.view.allowed, true);
        assert.equal(f.view.positionActive, true);
        assert.equal(f.children[f.children.indexOf(f.notch) + 1], f.top);
        Main.overview.visible = true;
        f.sync();
        assert.equal(f.view.allowed, true);
        assert.equal(f.view.expanded, true, 'do not collapse playing media on Super');
        assert.equal(f.view.positionActive, true);
        assert.equal(f.children[f.children.indexOf(f.overview) + 1], f.notch);
        assert.ok(f.children.indexOf(f.notch) < f.children.indexOf(f.shield));
        assert.ok(f.children.indexOf(f.notch) < f.children.indexOf(f.modal));
        f.setFullscreen(true); // workspace picker over an otherwise fullscreen player
        f.sync();
        assert.equal(f.view.allowed, true);
        Main.overview.visible = false; // hidden transition must restore desktop rules
        f.setFullscreen(false);
        f.sync();
        assert.equal(f.view.allowed, true);
        assert.equal(f.view.positionActive, true);
        assert.equal(f.children[f.children.indexOf(f.notch) + 1], f.top);
    } finally { f.restore(); }
});

test('explicit overview hiding, fullscreen, lock and greeter still hide media and stop polling', () => {
    const f = overviewFixture();
    try {
        Main.overview.visible = true;
        f.values['hide-in-overview'] = true;
        f.sync();
        assert.equal(f.view.allowed, false);
        assert.equal(f.view.actor.reactive, false);
        assert.equal(f.view.positionActive, false);
        assert.equal(f.view.expanded, false);
        Main.overview.visible = false;
        f.sync();
        assert.equal(f.view.allowed, true, 'hidden signal re-enables notch after overview exits');
        assert.equal(f.view.actor.reactive, true);
        f.setFullscreen(true);
        f.sync();
        assert.equal(f.view.allowed, false);
        f.values['hide-in-overview'] = false;
        Main.overview.visible = true;
        for (const key of ['isLocked', 'isGreeter']) {
            Main.sessionMode[key] = true;
            f.sync();
            assert.equal(f.view.allowed, false);
            assert.equal(f.view.notificationAllowed, false);
            assert.equal(f.view.actor.visible, false);
            Main.sessionMode[key] = false;
        }
        f.view.locked = true; // ScreenSaver signal must also win over overview
        f.sync();
        assert.equal(f.view.allowed, false);
    } finally { f.restore(); }
});

test('volume OSD routes in overview; hiding/lock/peek fall back natively without duplicates', () => {
    const f = overviewFixture();
    const extras = new Extras(f.view);
    const volume = {get_names: () => ['audio-volume-high-symbolic']};
    try {
        nativeCalls = 0;
        extras.configureOsd();
        Main.overview.visible = true;
        f.sync();
        Main.osdWindowManager._showOsdWindow(0, volume, '', 0.65, 1);
        assert.equal(nativeCalls, 0);
        assert.equal(f.view.indicatedLevel, 0.65);
        f.values['hide-in-overview'] = true;
        f.sync();
        Main.osdWindowManager._showOsdWindow(0, volume, '', 0.7, 1);
        assert.equal(nativeCalls, 1);
        f.values['hide-in-overview'] = false;
        Main.sessionMode.isLocked = true;
        f.sync();
        Main.osdWindowManager._showOsdWindow(0, volume, '', 0.75, 1);
        assert.equal(nativeCalls, 2);
        Main.sessionMode.isLocked = false;
        f.sync();
        f.view.mode = 'peek';
        Main.osdWindowManager._showOsdWindow(0, volume, '', 0.8, 1);
        assert.equal(nativeCalls, 3);
        f.view.mode = 'closed';
        Main.overview.visible = false;
        f.sync();
        Main.osdWindowManager._showOsdWindow(0, volume, '', 0.85, 1);
        assert.equal(nativeCalls, 3);
        assert.equal(f.view.indicatedLevel, 0.85);
    } finally { extras.destroy(); f.restore(); }
    assert.equal(Main.osdWindowManager._showOsdWindow, originalOsd);
});
