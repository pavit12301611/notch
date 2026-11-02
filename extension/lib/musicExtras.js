import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import {box, button, setIconSource} from './widgets.js';

/** Optional local artwork and visible-page-only title motion / direct player picker. */
export class MusicExtras {
    constructor(view) {
        this.view = view;
        this.settings = view.settings;
        this.artKey = '';
    }

    build(page, title) {
        this.title = title;
        this.art = new St.Icon({icon_size: 64, style_class: 'notch-album-art', visible: false,
            x_align: Clutter.ActorAlign.CENTER});
        page.add_child(this.art);
        this.viewport = new St.Widget({layout_manager: new Clutter.FixedLayout(),
            clip_to_allocation: true, x_expand: true});
        this.viewport.add_child(title);
        page.add_child(this.viewport);
        this.players = box(true, 'notch-player-picker', 4);
        this.players.visible = false;
        page.add_child(this.players);
    }

    update(state) {
        this.state = state;
        const polish = this.settings.get_boolean('music-polish');
        this.players.visible = polish && state.names.length > 1;
        const signature = `${polish}|${state.name}|${state.names.join('|')}`;
        if (signature !== this.playerSignature) {
            this.playerSignature = signature;
            this.players.destroy_all_children();
            if (polish && state.names.length > 1) {
                for (const name of state.names) {
                    const identity = this.view.media.players.get(name)?.root.Identity || name.replace('org.mpris.MediaPlayer2.', '');
                    const choice = button({text: identity, wrapText: true,
                        style: name === state.name ? 'notch-small-button notch-tab-active' : 'notch-small-button',
                        accessibleName: `Use player ${identity}${name === state.name ? ', selected' : ''}`,
                        onClick: () => this.view.media.selectPlayer(name)});
                    this.players.add_child(choice);
                }
            }
        }
        this.updateArt(this.settings.get_boolean('media-art') && state.names.length ? state.artUrl : '');
        this.adapt(this.view._layout);
    }

    updateArt(uri = '') {
        if (uri === this.artKey) return;
        this.artKey = uri;
        this.artCancel?.cancel();
        this.artCancel = new Gio.Cancellable();
        this.art.visible = false;
        this.art.gicon = null;
        // Local URI only, no authority, remote mount URL, SVG or network request.
        if (!uri.startsWith('file:///')) return;
        let file;
        try {
            const [path, hostname] = GLib.filename_from_uri(uri);
            if (hostname) return;
            file = Gio.File.new_for_path(path);
        } catch { return; }
        const token = this.artCancel;
        file.query_info_async('standard::type,standard::size,standard::content-type',
            Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, GLib.PRIORITY_DEFAULT, token, (source, result) => {
                try {
                    const info = source.query_info_finish(result);
                    if (this.dead || token.is_cancelled() || uri !== this.artKey) return;
                    if (info.get_file_type() !== Gio.FileType.REGULAR || info.get_size() > 10 * 1024 * 1024 ||
                        !['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'].includes(info.get_content_type())) return;
                    setIconSource(this.art, new Gio.FileIcon({file}), 'audio-x-generic-symbolic');
                    this.art.visible = true;
                } catch { /* Missing/unsupported artwork leaves the text-first layout intact. */ }
            });
    }

    adapt(layout) {
        if (!this.title) return;
        const width = Math.max(80, ((layout?.width ?? 540) - 32) * (layout?.cssScale ?? 1));
        this.viewport.set_width(width);
        const polish = this.settings.get_boolean('music-polish');
        this.title.clutter_text.line_wrap = !polish;
        this.title.set_width(polish ? -1 : width);
        const [, naturalWidth] = this.title.get_preferred_width(-1);
        const [, naturalHeight] = this.title.get_preferred_height(polish ? -1 : width);
        this.viewport.set_height(naturalHeight);
        this.title.set_position(polish ? Math.max(0, (width - naturalWidth) / 2) : 0, 0);
        this.overflow = polish ? Math.max(0, naturalWidth - width) : 0;
        this.syncMotion();
    }

    syncMotion() {
        const active = !this.dead && this.settings.get_boolean('music-polish') &&
            this.view.allowed && this.view.expanded && this.view.tab === 'media' &&
            this.state?.names.length && this.view.motionDuration(100) > 0 && this.overflow > 1;
        if (!active) {
            this.stopMotion();
            return;
        }
        const key = `${this.title.text}|${this.overflow}`;
        if (this.timeline && this.motionKey === key) return;
        this.stopMotion();
        this.motionKey = key;
        // Pause at both ends and traverse at ~30 logical pixels per second.
        const travel = Math.max(1000, this.overflow / 30 * 1000);
        const duration = 2400 + 2 * travel;
        this.timeline = new Clutter.Timeline({duration: Math.round(duration), repeat_count: -1});
        this.timeline.connect('new-frame', (_timeline, elapsed) => {
            const t = elapsed % duration;
            const position = t < 1200 ? 0 : t < 1200 + travel ? (t - 1200) / travel :
                t < 2400 + travel ? 1 : 1 - (t - 2400 - travel) / travel;
            this.title.translation_x = -this.overflow * Math.max(0, Math.min(1, position));
        });
        this.timeline.start();
    }

    stopMotion() {
        this.timeline?.stop();
        this.timeline = null;
        if (this.title) this.title.translation_x = 0;
    }

    destroy() {
        this.dead = true;
        this.stopMotion();
        this.artCancel?.cancel();
        this.art.gicon = null;
    }
}
