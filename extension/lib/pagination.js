/** Small, deterministic pagination for non-scrolling notch pages. */

export const PAGE_CAPACITY = Object.freeze({
    shelf: 2,
    clipboard: 2,
});

export function clampPage(page, totalItems, capacity) {
    const size = Math.max(1, Math.floor(capacity) || 1);
    const totalPages = Math.max(1, Math.ceil(Math.max(0, totalItems) / size));
    const current = Math.max(0, Math.min(Math.floor(page) || 0, totalPages - 1));
    return {page: current, totalPages, capacity: size};
}

export function pageSlice(items, page, capacity) {
    const list = Array.isArray(items) ? items : [];
    const {page: current, totalPages, capacity: size} = clampPage(page, list.length, capacity);
    const start = current * size;
    return {
        items: list.slice(start, start + size),
        page: current,
        totalPages,
        start,
        hasPrevious: current > 0,
        hasNext: current + 1 < totalPages,
    };
}

export function pageLabel(page, totalPages) {
    const total = Math.max(1, totalPages);
    const current = Math.max(0, Math.min(page, total - 1));
    return `${current + 1} / ${total}`;
}
