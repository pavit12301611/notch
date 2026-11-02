import {availableOpenSize, clamp} from './layout.js';
export {clamp};

/** Page budgets are clamped to the monitor; Calendar and optional content can scroll. */
export const PAGE_SIZES = Object.freeze({
    home: {width: 640, height: 220},
    calendar: {width: 640, height: 520},
    media: {width: 640, height: 320},
    notifications: {width: 640, height: 380},
    system: {width: 640, height: 360},
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
    const basePage = PAGE_SIZES[options.tab] ?? PAGE_SIZES.home;
    const extra = options.tab === 'system' ? options.systemExtra : options.tab === 'media' ? options.mediaExtra : 0;
    const page = {...basePage, height: basePage.height + Math.max(0, extra ?? 0)};
    const panelHeight = Math.max(1, options.panelHeight ?? 32);
    const available = availableOpenSize(monitor, options);
    let width;
    let height;
    if (state === 'open') {
        width = Math.min(page.width * scale, (options.expandedWidth ?? 640) * scale, available.width);
        const textScale = Math.max(0.8, options.textScale ?? 1);
        const effectiveWidth = Math.min(page.width, options.expandedWidth ?? 640) / textScale;
        // Narrow/large-text layouts wrap more. Reserve extra height instead of
        // introducing scrollbars on non-Alert pages.
        const narrowBoost = effectiveWidth < 420 ? 80 : 0;
        const veryNarrowBoost = effectiveWidth < 340 ? 160 : 0;
        const statusExtra = Math.max(0, options.statusExtra ?? 0);
        height = Math.min(page.height * scale, (options.expandedHeight ?? 480) * scale, available.height) +
            (narrowBoost + veryNarrowBoost + statusExtra) * scale;
        height = Math.min(height, available.height);
    } else if (state === 'peek') {
        width = Math.min(440 * scale, available.width);
        height = Math.min(panelHeight + 112 * scale, available.height);
    } else {
        width = Math.max(options.collapsedWidth ?? 185, 150) * scale;
        if (options.mediaWings) width += 64 * scale;
        if (options.hovered && options.placement === 'panel') width += 12 * scale;
        height = options.matchPanelHeight === true ? panelHeight : (options.collapsedHeight ?? 32) * scale;
        if (options.hovered && options.placement === 'panel') height += 4 * scale;
    }
    width = Math.round(clamp(width, 1, Math.min(monitor.width, available.width)));
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
