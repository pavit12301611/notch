export const clamp = (value, lower, upper) => Math.max(lower, Math.min(upper, value));

/** Adaptive layout decisions are pure so they can be tested without GNOME Shell. */
export const LAYOUT_LIMITS = Object.freeze({
    paddingX: 20,
    paddingTop: 8,
    paddingBottom: 16,
    headerHeight: 44,
    minContentWidth: 120,
    minContentHeight: 80,
    edgeMargin: 12,
});

export function headerMode(width) {
    // Six labelled tabs plus settings/close need ~760 logical px; below that
    // show only the active label, then icons. Never ellipsize tab text.
    if (width >= 760) return 'labels';
    if (width >= 420) return 'active';
    return 'icons';
}

export function statColumns(width) {
    if (width >= 560) return 4;
    if (width >= 320) return 2;
    return 1;
}

export function statusHeight(text, width) {
    if (!text) return 0;
    const charsPerLine = Math.max(18, Math.floor(width / 7));
    const lines = clamp(Math.ceil(String(text).length / charsPerLine), 1, 3);
    return lines * 18 + 10;
}

/**
 * Resolve the open-notch content box from the *actual* target rectangle.
 * Returned width/height/pageHeight are logical pixels before St CSS scaling.
 */
export function contentLayout(rect, options = {}, statusText = '') {
    const cssScale = Math.max(1, options.cssScale ?? 1);
    const reserveScale = Math.max(0.5, options.layoutScale ?? 1);
    const contentScale = Math.max(0.5, options.contentScale ?? reserveScale);
    const textScale = Math.max(0.5, options.textScale ?? reserveScale / contentScale);
    // Geometry reserves room for larger text, but the content actor itself is only
    // scaled by the user's notch scale. St CSS already applies text scaling.
    const scale = cssScale * contentScale;
    const panelLogical = Math.max(1, options.panelHeight ?? 32) / scale;
    const width = Math.max(LAYOUT_LIMITS.minContentWidth,
        rect.width / scale - 2 * LAYOUT_LIMITS.paddingX);
    const height = Math.max(LAYOUT_LIMITS.minContentHeight,
        rect.height / scale - panelLogical - LAYOUT_LIMITS.paddingTop - LAYOUT_LIMITS.paddingBottom);
    const effectiveWidth = width / textScale;
    const footer = statusHeight(statusText, effectiveWidth);
    const pageHeight = Math.max(48, height - LAYOUT_LIMITS.headerHeight - footer);
    return {
        scale, cssScale, layoutScale: contentScale, reserveScale: cssScale * reserveScale,
        textScale, panelLogical, width, height, pageHeight, effectiveWidth,
        headerHeight: LAYOUT_LIMITS.headerHeight,
        footerHeight: footer,
        header: headerMode(effectiveWidth),
        columns: statColumns(effectiveWidth),
        compact: effectiveWidth < 420,
        narrow: effectiveWidth < 340,
        paddingX: LAYOUT_LIMITS.paddingX,
        paddingTop: LAYOUT_LIMITS.paddingTop,
    };
}

/** Available open size on a monitor, before per-page preferences are applied. */
export function availableOpenSize(monitor, options = {}) {
    const cssScale = Math.max(1, options.cssScale ?? 1);
    const layoutScale = Math.max(0.5, options.layoutScale ?? 1);
    const scale = cssScale * layoutScale;
    const margin = LAYOUT_LIMITS.edgeMargin * scale;
    const panelHeight = Math.max(1, options.panelHeight ?? 32);
    let top = 0;
    if (options.placement === 'floating') top = (options.floatingMargin ?? 12) * scale;
    else if (options.placement !== 'panel') top = panelHeight + 6 * scale;
    return {
        width: Math.max(1, monitor.width - 2 * margin),
        height: Math.max(1, monitor.height - top - margin),
    };
}
