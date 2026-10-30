import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

const MAX_ART_BYTES = 2 * 1024 * 1024;

/** Local art is immediate. Remote art is optional, bounded, cancellable and LRU-cached. */
export class ArtLoader {
    constructor(allowRemote) {
        this.allowRemote = allowRemote;
        this.cache = new Map();
        this.cancellable = new Gio.Cancellable();
        this.generation = 0;
        this.dead = false;
    }

    setAllowRemote(allow) { this.allowRemote = allow; }

    async load(url, callback) {
        const generation = ++this.generation;
        const deliver = icon => {
            if (!this.dead && generation === this.generation) callback(icon);
        };
        deliver(null);
        if (!url) return;
        if (this.cache.has(url)) {
            const icon = this.cache.get(url);
            this.cache.delete(url);
            this.cache.set(url, icon);
            deliver(icon);
            return;
        }
        try {
            let bytes;
            if (url.startsWith('file://')) {
                const file = Gio.File.new_for_uri(url);
                const info = file.query_info('standard::size,standard::type',
                    Gio.FileQueryInfoFlags.NONE, this.cancellable);
                if (info.get_size() > MAX_ART_BYTES || info.get_file_type() !== Gio.FileType.REGULAR) return;
                const [, contents] = await file.load_contents_async(this.cancellable);
                bytes = GLib.Bytes.new(contents);
            } else if (url.startsWith('data:image/')) {
                const comma = url.indexOf(',');
                if (comma < 0 || !url.slice(0, comma).endsWith(';base64') ||
                    url.length > MAX_ART_BYTES * 4 / 3 + 256) return;
                bytes = GLib.Bytes.new(GLib.base64_decode(url.slice(comma + 1)));
            } else if (/^https?:\/\//i.test(url) && this.allowRemote) {
                bytes = await this.download(url);
            } else { return; }
            if (!bytes || bytes.get_size() > MAX_ART_BYTES || bytes.get_size() === 0) return;
            const icon = new Gio.BytesIcon({bytes});
            this.cache.set(url, icon);
            while (this.cache.size > 12) this.cache.delete(this.cache.keys().next().value);
            deliver(icon);
        } catch { /* Missing art must never interrupt playback or the shell. */ }
    }

    async download(url) {
        this.session ??= new Soup.Session({timeout: 10, user_agent: 'Notch/0.1'});
        const message = Soup.Message.new('GET', url);
        // Do not forward cookies or credentials to art/CDN hosts.
        message.set_flags(Soup.MessageFlags.NO_REDIRECT);
        const input = await new Promise((resolve, reject) => {
            this.session.send_async(message, GLib.PRIORITY_DEFAULT, this.cancellable,
                (session, result) => {
                    try { resolve(session.send_finish(result)); } catch (e) { reject(e); }
                });
        });
        try {
            if (message.get_status() < 200 || message.get_status() >= 300)
                throw new Error('Art request failed');
            const type = message.get_response_headers().get_content_type()?.[0] ?? '';
            if (!/^image\/(png|jpeg|webp|gif|x-icon|vnd.microsoft.icon)$/i.test(type))
                throw new Error('Unsupported art format');
            const chunks = [];
            let size = 0;
            for (;;) {
                const chunk = await new Promise((resolve, reject) => {
                    input.read_bytes_async(65536, GLib.PRIORITY_DEFAULT, this.cancellable,
                        (stream, result) => {
                            try { resolve(stream.read_bytes_finish(result)); } catch (e) { reject(e); }
                        });
                });
                if (chunk.get_size() === 0) break;
                size += chunk.get_size();
                if (size > MAX_ART_BYTES) throw new Error('Art exceeds size limit');
                chunks.push(chunk.get_data());
            }
            const joined = new Uint8Array(size);
            let offset = 0;
            for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
            return GLib.Bytes.new(joined);
        } finally { input.close(this.cancellable); }
    }

    destroy() {
        this.dead = true;
        this.generation++;
        this.cancellable.cancel();
        this.session?.abort();
        this.cache.clear();
    }
}
