import St from 'gi://St';
import Pango from 'gi://Pango';
import Clutter from 'gi://Clutter';
import * as Slider from 'resource:///org/gnome/shell/ui/slider.js';

export function label(text = '', style = 'notch-muted', expand = false) {
    const widget = new St.Label({text, style_class: style, x_expand: expand,
        y_align: Clutter.ActorAlign.CENTER});
    widget.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return widget;
}

export function icon(name, size = 16) {
    return new St.Icon({icon_name: name, icon_size: size, y_align: Clutter.ActorAlign.CENTER});
}

export function box(vertical = false, style = '', spacing = 8) {
    // St.BoxLayout has no GObject "spacing" property; spacing is an St CSS style.
    return new St.BoxLayout({vertical, style_class: style,
        style: `spacing: ${Number(spacing) || 0}px;`, x_expand: !vertical});
}

export function button({text = '', iconName = '', onClick, style = 'notch-button', accessibleName = ''}) {
    const child = box(false, '', 6);
    child.x_align = Clutter.ActorAlign.CENTER;
    if (iconName) child.add_child(icon(iconName));
    if (text) child.add_child(label(text, '', true));
    const widget = new St.Button({child, style_class: style, can_focus: true,
        accessible_name: accessibleName || text || iconName, y_align: Clutter.ActorAlign.CENTER});
    if (onClick) widget.connect('clicked', onClick);
    return widget;
}

export function slider(value, onInput, accessibleName) {
    const widget = new Slider.Slider(value);
    widget.add_style_class_name('notch-slider');
    widget.accessible_name = accessibleName;
    let dragging = false;
    widget.connect('drag-begin', () => { dragging = true; });
    widget.connect('drag-end', () => { dragging = false; onInput(widget.value); });
    widget.connect('notify::value', () => { if (!dragging) onInput(widget.value); });
    widget._notchSet = next => {
        dragging = true;
        widget.value = Math.max(0, Math.min(1, Number(next) || 0));
        dragging = false;
    };
    return widget;
}

export function setText(widget, text) {
    if (widget.text !== text) widget.text = text;
}
