/** Pure geometry: all dimensions are GNOME stage/logical pixels, not physical pixels. */
export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function notchGeometry(monitor, options, expanded = false) {
    const padding = 16;
    const width = Math.min(
        expanded ? options.expandedWidth : options.collapsedWidth,
        Math.max(1, monitor.width - 2 * padding)
    );
    const height = Math.min(
        expanded ? options.expandedHeight : options.collapsedHeight,
        Math.max(1, monitor.height - 2 * padding)
    );
    let y;
    if (options.placement === 'panel') {
        y = monitor.y;
    } else if (options.placement === 'floating') {
        y = monitor.y + options.floatingMargin;
    } else {
        y = monitor.y + options.panelHeight + 6;
    }
    y = clamp(y, monitor.y, monitor.y + monitor.height - height);
    const x = clamp(
        monitor.x + (monitor.width - width) / 2 + options.horizontalOffset,
        monitor.x + padding,
        monitor.x + monitor.width - width - padding
    );
    return {x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height)};
}

export function containsPoint(rect, x, y) {
    return x >= rect.x && x < rect.x + rect.width &&
        y >= rect.y && y < rect.y + rect.height;
}
