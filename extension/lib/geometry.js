export const clamp = (value, lower, upper) => Math.max(lower, Math.min(upper, value));

/** Logical page sizes inspired by native MacBook notch apps; never one giant window. */
export const PAGE_SIZES = Object.freeze({
    home: {width: 640, height: 210},
    media: {width: 640, height: 300},
    notifications: {width: 560, height: 320},
    system: {width: 640, height: 260},
    shelf: {width: 640, height: 240},
    clipboard: {width: 580, height: 300},
});

export function surfaceRadii(mode, options = {}) {
    const scale = (options.cssScale ?? 1) * (options.layoutScale ?? 1);
    const opened = mode === 'open';
    const top = (opened ? 19 : 6) * scale;
    const bottom = options.adaptiveCorners === false ? (options.cornerRadius ?? 24) * scale :
        (opened ? 24 : 14) * scale;
    return {topRadius: top, bottomRadius: bottom};
}

/** Pure monitor geometry. All returned coordinates are Shell stage pixels. */
export function notchGeometry(monitor, options, expanded = false, mode = null) {
    const cssScale = Math.max(1, options.cssScale ?? 1);
    const layoutScale = Math.max(0.5, options.layoutScale ?? 1);
    const scale = cssScale * layoutScale;
    const state = mode ?? (expanded ? 'open' : 'closed');
    const page = PAGE_SIZES[options.tab] ?? PAGE_SIZES.home;
    const panelHeight = Math.max(1, options.panelHeight ?? 32);
    let width;
    let height;
    if (state === 'open') {
        width = Math.min(page.width * scale, (options.expandedWidth ?? 640) * scale);
        height = Math.min(page.height * scale, (options.expandedHeight ?? 320) * scale);
    } else if (state === 'peek') {
        width = 440 * scale;
        height = panelHeight + 112 * scale;
    } else {
        width = Math.max(options.collapsedWidth ?? 185, 150) * scale;
        if (options.mediaWings) width += 64 * scale;
        if (options.hovered && options.placement === 'panel') width += 12 * scale;
        height = options.matchPanelHeight === true ? panelHeight : (options.collapsedHeight ?? 32) * scale;
        if (options.hovered && options.placement === 'panel') height += 4 * scale;
    }
    width = Math.round(clamp(width, 1, monitor.width));
    height = Math.round(clamp(height, 1, monitor.height));
    const x = Math.round(monitor.x + clamp((monitor.width - width) / 2 +
        (options.horizontalOffset ?? 0) * scale, 0, monitor.width - width));
    let y = monitor.y;
    if (options.placement === 'floating') y += Math.round((options.floatingMargin ?? 12) * scale);
    else if (options.placement !== 'panel') y += panelHeight + Math.round(6 * scale);
    y = Math.round(clamp(y, monitor.y, monitor.y + monitor.height - height));
    return {x, y, width, height, ...surfaceRadii(state, options)};
}

export function containsPoint(rect, x, y) {
    return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}
