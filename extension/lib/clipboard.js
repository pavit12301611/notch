import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';
import {ClipboardHistory, safeTextMimetype} from './model.js';

const MAX_BYTES = 65536;

/**
 * Opt-in text history. Mutter has no public clipboard-owner signal, so automatic
 * capture uses one bounded transfer/second while enabled and unlocked.
 * Manual capture works even with automatic capture off. No history touches disk.
 */
export class ClipboardController {
    constructor(limit, onChange) {
        this.history = new ClipboardHistory(limit, MAX_BYTES);
        this.onChange = onChange;
        this.clipboard = St.Clipboard.get_default();
        this.selection = global.display.get_selection();
        this.cancellable = new Gio.Cancellable();
        this.timer = 0;
        this.pending = false;
        this.paused = false;
        this.enabled = false;
        this.dead = false;
    }

    configure(enabled, limit) {
        this.history.setLimit(limit);
        this.enabled = enabled;
        if (!enabled) this.history.clear();
        this.syncTimer();
        this.onChange();
    }

    setPaused(paused) {
        this.paused = paused;
        if (paused) this.history.clear();
        this.syncTimer();
        this.onChange();
    }

    syncTimer() {
        const active = this.enabled && !this.paused && !this.dead;
        if (active && !this.timer) {
            this.capture();
            this.timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
                this.capture();
                return GLib.SOURCE_CONTINUE;
            });
        } else if (!active && this.timer) {
            GLib.source_remove(this.timer);
            this.timer = 0;
        }
    }

    async capture() {
        if (this.pending || this.paused || this.dead) return false;
        const mime = safeTextMimetype(this.selection.get_mimetypes(Meta.SelectionType.CLIPBOARD));
        if (!mime) return false;
        this.pending = true;
        const stream = Gio.MemoryOutputStream.new_resizable();
        try {
            await new Promise((resolve, reject) => {
                this.selection.transfer_async(Meta.SelectionType.CLIPBOARD, mime, MAX_BYTES + 1,
                    stream, this.cancellable, (selection, result) => {
                        try { selection.transfer_finish(result); resolve(); } catch (e) { reject(e); }
                    });
            });
            if (this.dead || this.paused || stream.get_data_size() > MAX_BYTES) return false;
            const text = new TextDecoder('utf-8', {fatal: true}).decode(stream.steal_as_bytes().get_data());
            if (this.history.add(text)) this.onChange();
            return true;
        } catch {
            // A closed source, non-UTF8 data, cancellation or an oversized clip is skipped.
            return false;
        } finally {
            try { stream.close(null); } catch { /* already closed */ }
            this.pending = false;
        }
    }

    restore(id) {
        const item = this.history.get(id);
        if (!item || this.paused) return false;
        this.clipboard.set_text(St.ClipboardType.CLIPBOARD, item.text);
        this.history.add(item.text);
        this.onChange();
        return true;
    }

    clear() {
        this.history.clear();
        this.onChange();
    }

    destroy() {
        this.dead = true;
        this.syncTimer();
        this.cancellable.cancel();
        this.history.clear();
        this.selection = null;
        this.clipboard = null;
    }
}
