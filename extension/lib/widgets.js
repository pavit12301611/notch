import St from 'gi://St';
import Pango from 'gi://Pango';
import Clutter from 'gi://Clutter';
import {iconGicon} from './icons.js';

export function label(text = '', style = 'notch-muted', expand = false) {
    const widget = new St.Label({text, style_class: style, x_expand: expand,
        x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER});
    widget.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
    widget.clutter_text.alignment = Pango.Alignment.CENTER;
    return widget;
}

export function wrapLabel(text = '', style = 'notch-muted', expand = true) {
    const widget = label(text, style, expand);
    widget.clutter_text.line_wrap = true;
    widget.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
    widget.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
    widget.clutter_text.alignment = Pango.Alignment.CENTER;
    widget.y_align = Clutter.ActorAlign.CENTER;
    return widget;
}

/** Non-scrolling pages are centered as a block inside the fixed page stack. */
export function pageBox(style = '', spacing = 10) {
    const page = box(true, `notch-page ${style}`.trim(), spacing);
    page.x_expand = true;
    page.x_align = Clutter.ActorAlign.FILL;
    page.y_expand = false;
    page.y_align = Clutter.ActorAlign.CENTER;
    return page;
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

export function emptyState(title, body) {
    const widget = box(true, 'notch-empty', 6);
    widget.x_align = Clutter.ActorAlign.CENTER;
    widget.y_align = Clutter.ActorAlign.CENTER;
    widget.y_expand = true;
    const heading = label(title, 'notch-empty-title');
    heading.x_align = Clutter.ActorAlign.CENTER;
    const detail = wrapLabel(body, 'notch-empty-body', false);
    detail.x_align = Clutter.ActorAlign.CENTER;
    widget.add_child(heading);
    widget.add_child(detail);
    return widget;
}

/**
 * GNOME Shell 48 added St.BoxLayout:orientation and deprecated :vertical;
 * GNOME Shell 51 removed :vertical. Detect the property once per call so one
 * build covers Shell 46-51 without a version table or a metadata-only bump.
 */
function stBoxLayoutUsesOrientation() {
    const prototype = St.BoxLayout.prototype;
    // :orientation on Shell 48+, or a future Shell that drops :vertical too.
    return 'orientation' in prototype || !('vertical' in prototype);
}

function stBoxOrientation(vertical) {
    return vertical ? Clutter.Orientation.VERTICAL : Clutter.Orientation.HORIZONTAL;
}

/** Set box direction on both the pre-48 and the 48+ St.BoxLayout API. */
export function setBoxOrientation(widget, vertical) {
    if (!widget) return;
    if ('orientation' in widget) widget.orientation = stBoxOrientation(vertical);
    else widget.vertical = !!vertical;
}

export function box(vertical = false, style = '', spacing = 8) {
    // St.BoxLayout has no GObject "spacing" property; spacing is an St CSS style.
    const properties = {style_class: style, style: `spacing: ${Number(spacing) || 0}px;`,
        x_expand: !vertical};
    if (stBoxLayoutUsesOrientation()) properties.orientation = stBoxOrientation(vertical);
    else properties.vertical = vertical;
    return new St.BoxLayout(properties);
}

export function button({text = '', iconName = '', onClick, style = 'notch-button', accessibleName = '', wrapText = false}) {
    const child = box(false, '', 6);
    child.x_align = Clutter.ActorAlign.CENTER;
    child.y_align = Clutter.ActorAlign.CENTER;
    let iconWidget = null;
    let labelWidget = null;
    if (iconName) {
        iconWidget = icon(iconName);
        child.add_child(iconWidget);
    }
    if (text) {
        labelWidget = wrapText ? wrapLabel(text, '', true) : label(text, '', false);
        if (wrapText) child.x_expand = true;
        child.add_child(labelWidget);
    }
    const widget = new St.Button({child, style_class: style, can_focus: true,
        accessible_name: accessibleName || text || iconName, y_align: Clutter.ActorAlign.CENTER});
    widget._notchIcon = iconWidget;
    widget._notchLabel = labelWidget;
    if (onClick) widget.connect('clicked', onClick);
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
