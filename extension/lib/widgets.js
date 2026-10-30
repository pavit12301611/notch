import St from 'gi://St';
import Pango from 'gi://Pango';
import Clutter from 'gi://Clutter';
import * as Slider from 'resource:///org/gnome/shell/ui/slider.js';
import {iconGicon} from './icons.js';

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
    // St.Icon has no icon_type property. St selects symbolic rendering from the
    // icon source; is_symbolic is a read-only result, not a construction option.
    return new St.Icon({gicon: iconGicon(name), icon_size: size,
        y_align: Clutter.ActorAlign.CENTER});
}

/** Switch between a loaded GIcon and a themed fallback without clearing the new source. */
export function setIconSource(widget, gicon, fallbackName) {
    widget.fallback_gicon = null;
    if (gicon) {
        // icon_name is a convenience setter for gicon. Clear it first, never last.
        widget.icon_name = null;
        widget.gicon = gicon;
    } else {
        widget.icon_name = null;
        widget.gicon = iconGicon(fallbackName);
    }
}

export function sourceIcon(gicon, fallbackName, size = 16) {
    const widget = icon(fallbackName, size);
    setIconSource(widget, gicon, fallbackName);
    return widget;
}

export function emptyState(iconName, title, body) {
    const widget = box(true, 'notch-empty', 8);
    widget.x_align = Clutter.ActorAlign.CENTER;
    widget.y_align = Clutter.ActorAlign.CENTER;
    widget.y_expand = true;
    const image = icon(iconName, 32);
    image.x_align = Clutter.ActorAlign.CENTER;
    const heading = label(title, 'notch-empty-title');
    heading.x_align = Clutter.ActorAlign.CENTER;
    const detail = wrapLabel(body, 'notch-empty-body', false);
    detail.x_align = Clutter.ActorAlign.CENTER;
    widget.add_child(image);
    widget.add_child(heading);
    widget.add_child(detail);
    return widget;
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

/** Disabled controls must look disabled and must not keep keyboard focus. */
export function setSensitive(widget, enabled) {
    if (!widget) return;
    widget.reactive = !!enabled;
    widget.can_focus = !!enabled;
    widget.opacity = enabled ? 255 : 110;
}
