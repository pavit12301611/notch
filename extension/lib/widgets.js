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

export function wrapLabel(text = '', style = 'notch-muted', expand = true) {
    const widget = label(text, style, expand);
    widget.clutter_text.line_wrap = true;
    widget.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
    widget.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
    widget.y_align = Clutter.ActorAlign.START;
    return widget;
}

export function icon(name, size = 16) {
    return new St.Icon({icon_name: name, icon_size: size,
        icon_type: name.endsWith('-symbolic') ? St.IconType.SYMBOLIC : St.IconType.FULLCOLOR,
        y_align: Clutter.ActorAlign.CENTER});
}

export function box(vertical = false, style = '', spacing = 8) {
    // St.BoxLayout has no GObject "spacing" property; spacing is an St CSS style.
    return new St.BoxLayout({vertical, style_class: style,
        style: `spacing: ${Number(spacing) || 0}px;`, x_expand: !vertical});
}

export function button({text = '', iconName = '', onClick, style = 'notch-button', accessibleName = ''}) {
    const child = box(false, '', 6);
    child.x_align = Clutter.ActorAlign.CENTER;
    let iconWidget = null;
    let labelWidget = null;
    if (iconName) {
        iconWidget = icon(iconName);
        child.add_child(iconWidget);
    }
    if (text) {
        labelWidget = label(text, '', false);
        child.add_child(labelWidget);
    }
    const widget = new St.Button({child, style_class: style, can_focus: true,
        accessible_name: accessibleName || text || iconName, y_align: Clutter.ActorAlign.CENTER});
    widget._notchIcon = iconWidget;
    widget._notchLabel = labelWidget;
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
    if (widget && widget.text !== text) widget.text = text;
}
