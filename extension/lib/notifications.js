import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageList from 'resource:///org/gnome/shell/ui/messageList.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

const MAX_LIST_ITEMS = 20;

/**
 * Routes GNOME's existing notification banners into the notch.
 *
 * GNOME still owns notification policy, sounds, queueing, actions and expiry.
 * While routing is active we only hide the native banner actor and mirror the
 * same Notification objects into the notch. Disabling the extension restores
 * the native banner immediately, including a banner that is currently shown.
 */
export class NotificationBridge {
    constructor(onActive, onChange) {
        this.onActive = onActive;
        this.onChange = onChange;
        this.tray = Main.messageTray;
        this.enabled = false;
        this.allowed = true;
        this.active = null;
        this.dead = false;
        this._patched = false;
        this._nativeHidden = false;
        this._sources = new Set();
    }

    start() {
        const tray = this.tray;
        this._originalShow = tray._showNotification;
        this._originalHideCompleted = tray._hideNotificationCompleted;
        this._originalUpdateState = tray._updateState;
        const bridge = this;
        this._showOverride = function (...args) {
            const result = bridge._originalShow.apply(this, args);
            if (bridge._routing()) {
                bridge._hideNativeBanner();
                bridge._setActive(this._notification ?? null);
            }
            return result;
        };
        this._hideCompletedOverride = function (...args) {
            const result = bridge._originalHideCompleted.apply(this, args);
            if (bridge._routing()) bridge._setActive(null);
            return result;
        };
        this._updateStateOverride = function (...args) {
            const result = bridge._originalUpdateState.apply(this, args);
            if (bridge._routing()) bridge._hideNativeBanner();
            else bridge._restoreNativeBanner();
            return result;
        };
        tray._showNotification = this._showOverride;
        tray._hideNotificationCompleted = this._hideCompletedOverride;
        tray._updateState = this._updateStateOverride;
        this._patched = true;

        tray.connectObject('queue-changed', () => this.onChange(),
            'source-added', (_tray, source) => this._watchSource(source),
            'source-removed', (_tray, source) => this._unwatchSource(source), this);
        for (const source of tray.getSources()) this._watchSource(source);
        // Cover a banner that was already visible when the extension was enabled.
        if (this._routing() && tray._notification) {
            this._hideNativeBanner();
            this._setActive(tray._notification);
        }
    }

    _routing() {
        return !this.dead && this.enabled && this.allowed;
    }

    configure(enabled, allowed = this.allowed) {
        this.enabled = !!enabled;
        this.allowed = !!allowed;
        if (this._routing()) {
            this._hideNativeBanner();
            if (this.tray._notification) this._setActive(this.tray._notification);
        } else {
            this._restoreNativeBanner();
            this._setActive(null);
        }
        this.onChange();
    }

    _hideNativeBanner() {
        const bin = this.tray._bannerBin;
        if (!bin || this._nativeHidden) return;
        this._nativeHidden = true;
        bin.visible = false;
        bin.reactive = false;
        Shell.util_set_hidden_from_pick(bin, true);
        this.tray.visible = false;
    }

    _restoreNativeBanner() {
        if (!this._nativeHidden) return;
        this._nativeHidden = false;
        const bin = this.tray._bannerBin;
        if (bin) {
            bin.visible = true;
            bin.reactive = true;
            Shell.util_set_hidden_from_pick(bin, false);
        }
        // Let GNOME recompute visibility from its own state machine.
        if (!this.dead) this.tray._updateState();
    }

    _setActive(notification) {
        if (this.active === notification) return;
        this.active = notification;
        this.onActive(notification);
        this.onChange();
    }

    _watchSource(source) {
        if (this._sources.has(source)) return;
        this._sources.add(source);
        source.connectObject('notification-added', () => this.onChange(),
            'notification-removed', () => this.onChange(),
            'destroy', () => this._unwatchSource(source), this);
        this.onChange();
    }

    _unwatchSource(source) {
        if (!this._sources.has(source)) return;
        source.disconnectObject(this);
        this._sources.delete(source);
        this.onChange();
    }

    get count() {
        let count = 0;
        for (const source of this.tray.getSources()) count += source.unseenCount ?? source.count ?? 0;
        return count;
    }

    items() {
        const items = [];
        for (const source of this.tray.getSources()) {
            for (const notification of source.notifications ?? []) items.push(notification);
        }
        items.sort((a, b) => {
            const ad = a.datetime ?? GLib.DateTime.new_from_unix_local(0);
            const bd = b.datetime ?? GLib.DateTime.new_from_unix_local(0);
            return bd.compare(ad);
        });
        return items.slice(0, MAX_LIST_ITEMS);
    }

    createMessage(notification) {
        // MessageList.Message exists across GNOME 46-50; NotificationMessage is
        // not exported on older supported shells, so bind the public message
        // widget to the notification ourselves.
        const message = new MessageList.Message(notification.source);
        message.add_style_class_name('notch-notification');
        message.x_expand = true;
        message.canClose = () => true;
        if (message._header?.closeButton) message._header.closeButton.visible = true;
        const flags = GObject.BindingFlags.SYNC_CREATE;
        notification.bind_property('title', message, 'title', flags);
        notification.bind_property('body', message, 'body', flags);
        notification.bind_property('use-body-markup', message, 'use-body-markup', flags);
        notification.bind_property('datetime', message, 'datetime', flags);
        notification.bind_property('gicon', message, 'icon', flags);

        let closed = false;
        const actionBox = new St.BoxLayout({style_class: 'notification-buttons-bin', x_expand: true});
        const renderActions = () => {
            actionBox.destroy_all_children();
            for (const action of notification.actions.slice(0, 3)) {
                const button = new St.Button({style_class: 'notification-button',
                    x_expand: true, label: action.label});
                button.connect('clicked', () => action.activate());
                actionBox.add_child(button);
            }
            if (notification.actions.length) {
                message.setActionArea(actionBox);
                message.expand(false);
            }
        };
        renderActions();
        notification.connectObject('action-added', renderActions, 'action-removed', renderActions,
            'destroy', () => {
                if (closed) return;
                closed = true;
                message.destroy();
            }, message);
        message.connect('close', () => {
            if (closed) return;
            closed = true;
            notification.destroy(MessageTray.NotificationDestroyedReason.DISMISSED);
        });
        message.connect('clicked', () => {
            if (!closed) notification.activate();
        });
        return message;
    }

    dismissAll() {
        for (const source of this.tray.getSources()) {
            for (const notification of [...(source.notifications ?? [])]) {
                if (!notification.resident)
                    notification.destroy(MessageTray.NotificationDestroyedReason.DISMISSED);
            }
        }
    }

    destroy() {
        this.dead = true;
        this._restoreNativeBanner();
        const tray = this.tray;
        if (this._patched) {
            if (tray._showNotification === this._showOverride)
                tray._showNotification = this._originalShow;
            if (tray._hideNotificationCompleted === this._hideCompletedOverride)
                tray._hideNotificationCompleted = this._originalHideCompleted;
            if (tray._updateState === this._updateStateOverride)
                tray._updateState = this._originalUpdateState;
            this._patched = false;
        }
        tray.disconnectObject(this);
        for (const source of [...this._sources]) source.disconnectObject(this);
        this._sources.clear();
        this.active = null;
    }
}
