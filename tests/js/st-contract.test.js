import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';

// Exercise the real widgets.js against a strict St contract. The icon property
// list matches GNOME Shell 51 st-icon.c plus the inherited actor properties we
// use, and St.BoxLayout mimics Shell 51 where :vertical is gone and only
// :orientation exists. This catches invalid constructor properties and later
// invalid writes; a syntax-only check cannot do either.
const iconProperties = new Set([
    'gicon', 'fallback_gicon', 'icon_name', 'icon_size', 'fallback_icon_name',
    'style_class', 'style', 'x_expand', 'y_expand', 'x_align', 'y_align', 'visible',
]);

class Actor {
    constructor(properties = {}) {
        this.children = [];
        Object.assign(this, properties);
    }
    add_child(child) { this.children.push(child); }
    connect() { return 1; }
    add_style_class_name() {}
}

class Icon extends Actor {
    constructor(properties = {}) {
        for (const name of Object.keys(properties)) {
            if (!iconProperties.has(name)) throw new Error(`No property ${name} on StIcon`);
        }
        super();
        this._gicon = null;
        this._icon_name = null;
        this.icon_size = -1;
        this.fallback_gicon = null;
        Object.assign(this, properties);
        return new Proxy(this, {
            set(target, name, value) {
                if (typeof name === 'string' && !name.startsWith('_') && !iconProperties.has(name))
                    throw new Error(`No property ${name} on StIcon`);
                target[name] = value;
                return true;
            },
        });
    }
    get icon_name() { return this._icon_name; }
    set icon_name(name) {
        this._icon_name = name;
        // Upstream icon_name is a convenience setter that replaces gicon.
        this._gicon = name ? {themed: name} : null;
    }
    get gicon() { return this._gicon; }
    set gicon(gicon) {
        this._gicon = gicon;
        this._icon_name = gicon?.themed ?? null;
    }
}

class Label extends Actor {
    constructor(properties = {}) {
        super(properties);
        this.clutter_text = {};
    }
}
class Button extends Actor {}
const widgetProperties = new Set([
    'style_class', 'style', 'x_expand', 'y_expand', 'x_align', 'y_align', 'visible',
]);
class Widget extends Actor {
    constructor(properties = {}) {
        for (const name of Object.keys(properties)) {
            if (!widgetProperties.has(name)) throw new Error(`No property ${name} on StWidget`);
        }
        super(properties);
    }
}
class BoxLayout extends Actor {
    constructor(properties = {}) {
        if (Object.hasOwn(properties, 'spacing'))
            throw new Error('No property spacing on StBoxLayout');
        if (Object.hasOwn(properties, 'vertical'))
            throw new Error('No property vertical on StBoxLayout (removed in GNOME Shell 51)');
        super(properties);
    }
    get orientation() { return this._orientation ?? 0; }
    set orientation(value) {
        if (value !== 0 && value !== 1) throw new Error('Invalid StBoxLayout orientation');
        this._orientation = value;
    }
}
// GNOME Shell 46/47 only had :vertical; :orientation arrived in 48.
class LegacyBoxLayout extends Actor {
    constructor(properties = {}) {
        if (Object.hasOwn(properties, 'orientation'))
            throw new Error('No property orientation on StBoxLayout before GNOME Shell 48');
        super(properties);
    }
    get vertical() { return this._vertical ?? false; }
    set vertical(value) { this._vertical = !!value; }
}
class Slider {
    constructor(value) { this.value = value; }
    connect() { return 1; }
    add_style_class_name() {}
}

class FileIcon {
    constructor(properties = {}) { Object.assign(this, properties); }
}
const Gio = {FileIcon, ThemedIcon: {new: name => ({themed: name})}};
const GLib = {get_monotonic_time: () => 1_000_000};
const St = {Icon, Label, Button, BoxLayout, Widget};
const Clutter = {ActorAlign: {START: 0, CENTER: 1, FILL: 2, END: 3},
    Orientation: {HORIZONTAL: 0, VERTICAL: 1}};
const Pango = {EllipsizeMode: {NONE: 0, END: 3}, WrapMode: {WORD_CHAR: 2}, Alignment: {CENTER: 1}};
const stubs = new Map([
    ['gi://St', {default: St}],
    ['gi://Gio', {default: Gio}],
    ['gi://GLib', {default: GLib}],
    ['gi://Clutter', {default: Clutter}],
    ['gi://Pango', {default: Pango}],
    ['resource:///org/gnome/shell/ui/slider.js', {Slider}],
]);
const prefix = 'notch-stub:';
const globalKey = '__notchStContractStubs';
globalThis[globalKey] = stubs;
const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
        if (stubs.has(specifier)) return {url: `${prefix}${specifier}`, shortCircuit: true};
        return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
        if (!url.startsWith(prefix)) return nextLoad(url, context);
        const specifier = url.slice(prefix.length);
        const exports = stubs.get(specifier);
        const lines = [`const values = globalThis.${globalKey}.get(${JSON.stringify(specifier)});`];
        for (const name of Object.keys(exports)) {
            lines.push(name === 'default' ? 'export default values.default;' :
                `export const ${name} = values.${name};`);
        }
        return {format: 'module', source: lines.join('\n'), shortCircuit: true};
    },
});
const widgets = await import('../../extension/lib/widgets.js');
const icons = await import('../../extension/lib/icons.js');
icons.setIconDirectory({get_child: name => ({name, query_exists: () => true})});
hooks.deregister();
delete globalThis[globalKey];

test('icon helper constructs a valid GNOME 51 St.Icon without icon_type', () => {
    const widget = widgets.icon('user-home-symbolic', 22);
    assert.equal(widget.gicon.file.name, 'user-home-symbolic.svg');
    assert.equal(widget.icon_name, null);
    assert.equal(widget.icon_size, 22);
    assert.equal(Object.hasOwn(widget, 'icon_type'), false);
    assert.throws(() => { widget.icon_type = 0; }, /No property icon_type on StIcon/);
});

test('artwork switching keeps the loaded gicon and restores a themed fallback', () => {
    const cover = {file: '/tmp/cover.png'};
    const widget = widgets.sourceIcon(cover, 'audio-x-generic-symbolic', 72);
    assert.equal(widget.gicon, cover);
    assert.equal(widget.icon_name, null);
    widgets.setIconSource(widget, null, 'audio-x-generic-symbolic');
    assert.equal(widget.gicon.file.name, 'audio-x-generic-symbolic.svg');
    assert.equal(widget.icon_name, null);
    widgets.setIconSource(widget, cover, 'audio-x-generic-symbolic');
    assert.equal(widget.gicon, cover);
    assert.equal(widget.fallback_gicon, null);
});

test('button, label and box helpers use valid St construction properties', () => {
    const widget = widgets.button({text: 'Home', iconName: 'user-home-symbolic', accessibleName: 'Home'});
    assert.equal(widget.accessible_name, 'Home');
    assert.equal(widget._notchLabel.text, 'Home');
    assert.equal(widget._notchIcon.gicon.file.name, 'user-home-symbolic.svg');
    const wrapped = widgets.wrapLabel('A long status message');
    assert.equal(wrapped.clutter_text.line_wrap, true);
    assert.equal(wrapped.clutter_text.ellipsize, Pango.EllipsizeMode.NONE);
    const container = widgets.box(true, 'notch-page', 6);
    assert.equal(container.orientation, Clutter.Orientation.VERTICAL);
    assert.equal(container.vertical, undefined);
    assert.match(container.style, /spacing: 6px/);
});

test('box helper uses GNOME 51 orientation and never the removed vertical', () => {
    const row = widgets.box(false);
    assert.equal(row.orientation, Clutter.Orientation.HORIZONTAL);
    assert.equal(row.x_expand, true);
    widgets.setBoxOrientation(row, true);
    assert.equal(row.orientation, Clutter.Orientation.VERTICAL);
    assert.equal(row.vertical, undefined);
});

test('box helper falls back to vertical on GNOME 46/47', () => {
    const modern = St.BoxLayout;
    St.BoxLayout = LegacyBoxLayout;
    try {
        const container = widgets.box(true, 'notch-legacy', 4);
        assert.equal(container.vertical, true);
        assert.equal(container.orientation, undefined);
        widgets.setBoxOrientation(container, false);
        assert.equal(container.vertical, false);
    } finally {
        St.BoxLayout = modern;
    }
});

test('empty states are centered text cards with title and body', () => {
    const widget = widgets.emptyState('Nothing playing', 'Start a song to see controls.');
    assert.equal(widget.orientation, Clutter.Orientation.VERTICAL);
    assert.equal(widget.children.length, 2);
    assert.equal(widget.children[0].text, 'Nothing playing');
    assert.equal(widget.children[1].clutter_text.line_wrap, true);
});

test('CSS-sized decorative dots center themselves instead of stretching', () => {
    // BoxLayout's cross-axis default is FILL; an unaligned 5px dot was drawn as
    // a full-height white line beside the closed clock (build 20 regression).
    const dot = widgets.dot('notch-unread-dot');
    assert.equal(dot.style_class, 'notch-unread-dot');
    assert.equal(dot.x_align, Clutter.ActorAlign.CENTER);
    assert.equal(dot.y_align, Clutter.ActorAlign.CENTER);
    assert.equal(dot.visible, undefined);
});

test('disabled controls lose focus and look disabled', () => {
    const widget = widgets.button({text: 'Play', iconName: 'media-playback-start-inverse-symbolic'});
    widgets.setSensitive(widget, false);
    assert.equal(widget.reactive, false);
    assert.equal(widget.can_focus, false);
    assert.equal(widget.opacity, 110);
    widgets.setSensitive(widget, true);
    assert.equal(widget.reactive, true);
    assert.equal(widget.opacity, 255);
});
