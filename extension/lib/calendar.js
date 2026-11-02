import Clutter from 'gi://Clutter';
import St from 'gi://St';
import {calendarMonth, sameDate, shiftCalendarMonth} from './features.js';
import {box, button, label, setText, wrapLabel, pageBox} from './widgets.js';

/** Local-only date browser. No event/account access, polling or persistent state. */
export class CalendarPage {
    constructor() {
        this.enabled = false;
        const now = new Date();
        this.selected = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
        this.month = new Date(now.getFullYear(), now.getMonth(), 1, 12);
        this.page = pageBox('notch-calendar-page', 0);
        this.card = box(true, 'notch-calendar-card', 10);
        this.card.x_expand = false;
        this.card.x_align = Clutter.ActorAlign.CENTER;
        this.page.add_child(this.card);

        const header = box(false, 'notch-calendar-header', 8);
        const heading = box(true, 'notch-calendar-heading', 1);
        heading.x_expand = true;
        this.yearLabel = label('', 'notch-calendar-year');
        this.monthLabel = wrapLabel('', 'notch-calendar-month');
        for (const text of [this.yearLabel, this.monthLabel]) {
            text.x_align = Clutter.ActorAlign.START;
            heading.add_child(text);
        }
        header.add_child(heading);
        this.todayButton = button({text: 'Today', style: 'notch-calendar-today-button',
            accessibleName: 'Go to today', onClick: () => this.goToday()});

        this.header = header;
        this.navigation = box(false, 'notch-calendar-navigation', 6);
        this.previous = button({text: '‹', style: 'notch-calendar-nav-button',
            accessibleName: 'Previous month', onClick: () => this.moveMonth(-1)});
        this.next = button({text: '›', style: 'notch-calendar-nav-button',
            accessibleName: 'Next month', onClick: () => this.moveMonth(1)});
        for (const actor of [this.todayButton, this.previous, this.next]) this.navigation.add_child(actor);
        header.add_child(this.navigation);
        this.card.add_child(header);

        this.grid = box(true, 'notch-calendar-grid', 3);
        this.card.add_child(this.grid);
        this.footer = box(true, 'notch-calendar-selection', 2);
        this.selectionLabel = wrapLabel('', 'notch-calendar-selected-date');
        this.selectionHint = label('Selected date', 'notch-calendar-selection-hint');
        this.footer.add_child(this.selectionHint);
        this.footer.add_child(this.selectionLabel);
        this.card.add_child(this.footer);
        this.page.connect('key-press-event', (_actor, event) => this.keyPressed(event));
        this.render();
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        if (enabled) this.render();
    }

    goToday() {
        const now = new Date();
        this.choose(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12));
    }

    moveMonth(delta, focus = false) {
        // Navigate relative to the displayed month, keeping the selected day if possible.
        const base = new Date(this.month.getFullYear(), this.month.getMonth(), 1, 12);
        base.setDate(Math.min(this.selected.getDate(), new Date(base.getFullYear(), base.getMonth() + 1, 0, 12).getDate()));
        this.choose(shiftCalendarMonth(base, delta), focus);
    }

    choose(date, focus = false) {
        this.selected = date;
        this.month = new Date(date.getFullYear(), date.getMonth(), 1, 12);
        this.render();
        if (focus) this.selectedButton?.grab_key_focus();
    }

    keyPressed(event) {
        if (!this.enabled || (event.get_state() & (Clutter.ModifierType.CONTROL_MASK | Clutter.ModifierType.MOD1_MASK | Clutter.ModifierType.SUPER_MASK)))
            return Clutter.EVENT_PROPAGATE;
        const key = event.get_key_symbol();
        const offsets = new Map([[Clutter.KEY_Left, -1], [Clutter.KEY_Right, 1],
            [Clutter.KEY_Up, -7], [Clutter.KEY_Down, 7]]);
        if (offsets.has(key)) {
            const date = new Date(this.selected);
            date.setDate(date.getDate() + offsets.get(key));
            this.choose(date, true);
        } else if (key === Clutter.KEY_Page_Up || key === Clutter.KEY_Page_Down) {
            this.moveMonth(key === Clutter.KEY_Page_Up ? -1 : 1, true);
        } else if (key === Clutter.KEY_Home) {
            this.goToday();
            this.selectedButton?.grab_key_focus();
        } else return Clutter.EVENT_PROPAGATE;
        return Clutter.EVENT_STOP;
    }

    render() {
        if (this.dead || !this.enabled) return;
        const data = calendarMonth(this.month.getFullYear(), this.month.getMonth());
        setText(this.yearLabel, this.month.toLocaleDateString([], {year: 'numeric'}));
        setText(this.monthLabel, this.month.toLocaleDateString([], {month: 'long'}));
        const today = new Date();
        setText(this.selectionLabel, this.selected.toLocaleDateString([], {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'}));
        setText(this.selectionHint, sameDate(this.selected, today) ? 'Today' : 'Selected date');
        const restoreFocus = this.selectedButton?.has_key_focus?.() ?? false;
        this.grid.destroy_all_children();
        this.selectedButton = null;
        const weekdays = box(false, 'notch-calendar-weekdays', 3);
        weekdays.x_align = Clutter.ActorAlign.CENTER;
        for (let day = 0; day < 7; day++) {
            const name = new Date(2024, 0, day + 1, 12).toLocaleDateString([], {weekday: this.compact ? 'narrow' : 'short'});
            const cell = label(name, 'notch-calendar-weekday');
            cell.set_width(this.cellWidth ?? 52);
            weekdays.add_child(cell);
        }
        this.grid.add_child(weekdays);
        for (let row = 0; row < 6; row++) {
            const line = box(false, 'notch-calendar-week', 3);
            line.x_align = Clutter.ActorAlign.CENTER;
            for (const cell of data.cells.slice(row * 7, row * 7 + 7)) {
                const selected = sameDate(cell.date, this.selected);
                const styles = ['notch-calendar-day', cell.inMonth ? '' : 'notch-calendar-adjacent',
                    cell.weekend ? 'notch-calendar-weekend' : '', cell.today ? 'notch-calendar-today' : '',
                    selected ? 'notch-calendar-selected' : ''].filter(Boolean).join(' ');
                const day = button({text: String(cell.day), style: styles,
                    accessibleName: `${cell.date.toLocaleDateString([], {dateStyle: 'full'})}${cell.today ? ', today' : ''}${selected ? ', selected' : ''}`,
                    onClick: () => this.choose(cell.date, true)});
                // Unthemed slots keep CSS borders/padding inside the equal-width grid.
                const slot = new St.Widget({layout_manager: new Clutter.BinLayout()});
                slot.set_size(this.cellWidth ?? 52, this.cellHeight ?? 32);
                day.can_focus = selected;
                day.x_expand = true;
                day.y_expand = true;
                slot.add_child(day);
                line.add_child(slot);
                if (selected) this.selectedButton = day;
            }
            this.grid.add_child(line);
        }
        if (restoreFocus) this.selectedButton?.grab_key_focus();
    }

    adapt(layout) {
        const css = layout.cssScale;
        this.header.vertical = layout.effectiveWidth < 340;
        this.navigation.x_align = this.header.vertical ? Clutter.ActorAlign.START : Clutter.ActorAlign.END;
        const width = Math.max(84 * css, Math.min(480 * css, (layout.width - 20) * css));
        this.card.set_width(width);
        // Card padding 12px, six 3px gutters; font growth is handled vertically.
        const cellWidth = Math.max(12, Math.floor((width - 26 * css - 18 * css) / 7));
        const cellHeight = Math.max(30, 30 * layout.textScale) * css;
        if (cellWidth !== this.cellWidth || cellHeight !== this.cellHeight || this.compact !== (layout.effectiveWidth < 340)) {
            this.compact = layout.effectiveWidth < 340;
            this.cellWidth = cellWidth;
            this.cellHeight = cellHeight;
            this.render();
        }
    }

    destroy() {
        this.dead = true;
        // The view destroys the actor tree, including event handlers. No timers to stop.
        this.selectedButton = null;
    }
}
