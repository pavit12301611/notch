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
    // Four base tabs or five text-only labels fit the default 640 px notch.
    // Narrow/large-text layouts collapse to a centered icon rail.
    return width >= 560 ? 'labels' : 'icons';
}

/** Fixed header metrics. The rail, gutters and controls must fit without spill. */
export function headerLayout(width, textScale = 1, tabCount = 4) {
    const effective = width / Math.max(0.5, textScale);
    const ultra = width < (tabCount > 4 ? 396 : 360);
    const metrics = mode => {
        const gutter = ultra ? 30 : 76;
        const textOnly = mode === 'labels' && tabCount > 4;
        const ultraWidth = Math.max(12, Math.min(28, Math.floor((width - 2 * gutter - 8 - 8 - (tabCount - 1) * 2) / tabCount)));
        const tabWidth = mode === 'labels' ? (textOnly ? 80 : 92) : (ultra ? ultraWidth : 40);
        const tabSpacing = ultra ? 2 : 6;
        const headerSpacing = ultra ? 4 : 6;
        // Rail padding 3px + border 1px on each side. Tab slots are unthemed
        // fixed-size bins, so these are outer widths (St.Button padding is inside).
        const railWidth = tabCount * tabWidth + (tabCount - 1) * tabSpacing + 8;
        const requiredWidth = 2 * gutter + railWidth + 2 * headerSpacing;
        return {mode, textOnly, tabCount, ultra, gutter, controlsWidth: gutter, tabWidth, tabSpacing,
            headerSpacing, railWidth, requiredWidth, showSettings: !ultra};
    };
    // Labels must fit both the text-scaled rail and the physical notch width.
    // Small GNOME text cannot keep labels on a physically narrow notch.
    let result = metrics(headerMode(effective));
    if (result.mode === 'labels' && result.requiredWidth > width)
        result = metrics('icons');
    return result;
}

export function statColumns(width) {
    // A 2x2 metric grid gives values room to breathe; very narrow pages stack.
    return width >= 320 ? 2 : 1;
}

export function statusHeight(text, width) {
    if (!text) return 0;
    const charsPerLine = Math.max(18, Math.floor(width / 7));
    const lines = clamp(Math.ceil(String(text).length / charsPerLine), 1, 3);
    return lines * 18 + 18;
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
    // Header slots are fixed logical widths; labels also depend on text scale.
    // headerLayout() receives the physical width and downgrades labels if needed.
    const headerWidth = width;
    const footer = statusHeight(statusText, effectiveWidth);
    const pageHeight = Math.max(48, height - LAYOUT_LIMITS.headerHeight - footer);
    const header = headerLayout(width, textScale, options.tabCount ?? 4);
    return {
        scale, cssScale, layoutScale: contentScale, reserveScale: cssScale * reserveScale,
        textScale, panelLogical, width, height, pageHeight, effectiveWidth, headerWidth,
        headerHeight: LAYOUT_LIMITS.headerHeight,
        footerHeight: footer,
        header: header.mode,
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
