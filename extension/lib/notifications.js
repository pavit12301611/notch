/**
 * Reversible banner routing. We intercept only the tray's "show next banner"
 * step, after GNOME has applied DND / fullscreen / per-app policy. The source
 * and notification remain in GNOME's own message list; we never destroy them.
 */
export class NotificationBridge {
    constructor({tray, injections, canHandle, onActive, onFallback, criticalUrgency = 2}) {
        this.tray = tray;
        this.injections = injections;
        this.canHandle = canHandle;
        this.onActive = onActive;
        this.onFallback = onFallback;
        this.criticalUrgency = criticalUrgency;
        this.enabled = false;
        this.allowed = true;
        this.active = null;
        this._destroyed = false;
        this._sources = new Map();
        this._refreshSources();
        tray.connectObject('source-added', () => this._refreshSources(),
            'source-removed', () => this._refreshSources(),
            'notify::count', () => this.onActive?.(this.active, true), this);
    }

    get count() {
        return this.tray?.count ?? 0;
    }

    configure(enabled, allowed = true) {
        this.enabled = enabled;
        this.allowed = allowed;
        if (enabled && allowed && !this._installed && !this._destroyed) {
            this._installed = true;
            const bridge = this;
            this.injections.overrideMethod(this.tray, '_showNotification', original =>
                function () {
                    const notification = this._notificationQueue?.[0];
                    if (notification && bridge.enabled && bridge.allowed &&
                        notification.urgency !== bridge.criticalUrgency && bridge.canHandle(notification)) {
                        // Same accounting as the native banner path, without creating a banner actor.
                        notification.acknowledged = true;
                        notification.playSound();
                        this._notificationQueue.shift();
                        this.emit('queue-changed');
                        bridge.active = notification;
                        bridge.onActive(notification);
                        return;
                    }
                    if (notification) bridge.onFallback(notification);
                    original.call(this);
                });
        } else if ((!enabled || !allowed) && this._installed) {
            this.injections.restoreMethod(this.tray, '_showNotification');
            this._installed = false;
            this.release();
        }
    }

    accepts(notification) {
        return this.enabled && this.allowed && !!notification &&
            notification.urgency !== this.criticalUrgency;
    }

    release(notification = this.active) {
        if (notification && this.active !== notification) return;
        this.active = null;
        this.onActive(null);
    }

    _refreshSources() {
        const sources = new Set(this.tray.getSources());
        for (const [source] of this._sources) {
            if (!sources.has(source)) {
                source.disconnectObject(this);
                this._sources.delete(source);
            }
        }
        for (const source of sources) {
            if (!this._sources.has(source)) {
                source.connectObject('notify::count', () => this.onActive?.(this.active, true),
                    'destroy', () => {
                        source.disconnectObject(this);
                        this._sources.delete(source);
                        this.onActive?.(this.active, true);
                    }, this);
                this._sources.set(source, true);
            }
        }
        this.onActive?.(this.active, true);
    }

    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        this.enabled = false;
        if (this._installed) this.injections.restoreMethod(this.tray, '_showNotification');
        this._installed = false;
        for (const [source] of this._sources) source.disconnectObject(this);
        this._sources.clear();
        this.tray.disconnectObject(this);
        this.active = null;
        this.onActive = () => {};
        this.canHandle = () => false;
        this.onFallback = () => {};
        this.tray = null;
        this.injections = null;
    }
}
