import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';

// Exercise the real widgets.js against a strict St.Icon contract. The property
// list matches GNOME Shell 50.6 st-icon.c plus the inherited actor properties we
// use. This catches invalid constructor properties and later invalid writes;
// a syntax-only check cannot do either.
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
class BoxLayout extends Actor {
    constructor(properties = {}) {
        if (Object.hasOwn(properties, 'spacing'))
            throw new Error('No property spacing on StBoxLayout');
        super(properties);
    }
}
class Slider {
    constructor(value) { this.value = value; }
    connect() { return 1; }
    add_style_class_name() {}
}

const St = {Icon, Label, Button, BoxLayout};
const Clutter = {ActorAlign: {START: 0, CENTER: 1, FILL: 2, END: 3}};
const Pango = {EllipsizeMode: {NONE: 0, END: 3}, WrapMode: {WORD_CHAR: 2}};
const stubs = new Map([
    ['gi://St', {default: St}],
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
hooks.deregister();
delete globalThis[globalKey];

test('icon helper constructs a valid GNOME 50 St.Icon without icon_type', () => {
    const widget = widgets.icon('folder-symbolic', 22);
    assert.equal(widget.icon_name, 'folder-symbolic');
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
    assert.equal(widget.gicon.themed, 'audio-x-generic-symbolic');
    assert.equal(widget.icon_name, 'audio-x-generic-symbolic');
    widgets.setIconSource(widget, cover, 'audio-x-generic-symbolic');
    assert.equal(widget.gicon, cover);
    assert.equal(widget.fallback_gicon, null);
});

test('button, label and box helpers use valid St construction properties', () => {
    const widget = widgets.button({text: 'Shelf', iconName: 'folder-symbolic', accessibleName: 'Shelf'});
    assert.equal(widget.accessible_name, 'Shelf');
    assert.equal(widget._notchLabel.text, 'Shelf');
    assert.equal(widget._notchIcon.icon_name, 'folder-symbolic');
    const wrapped = widgets.wrapLabel('A long status message');
    assert.equal(wrapped.clutter_text.line_wrap, true);
    assert.equal(wrapped.clutter_text.ellipsize, Pango.EllipsizeMode.NONE);
    const container = widgets.box(true, 'notch-page', 6);
    assert.equal(container.vertical, true);
    assert.match(container.style, /spacing: 6px/);
});
