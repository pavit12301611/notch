import GObject from 'gi://GObject';
import St from 'gi://St';
import Cairo from 'gi://cairo';

/**
 * MacBook-style silhouette: two small outward top flares plus a body with larger
 * bottom corners. Drawing is limited to the flares; the body radius is CSS so it
 * participates in St's normal painting/clipping.
 */
export const NotchSurface = GObject.registerClass({
    GTypeName: 'NotchSurface',
}, class NotchSurface extends St.BoxLayout {
    _init() {
        super._init({style_class: 'notch-surface', reactive: false});
        this._left = new St.DrawingArea({style_class: 'notch-flare', reactive: false});
        this._right = new St.DrawingArea({style_class: 'notch-flare', reactive: false});
        this._body = new St.Widget({style_class: 'notch-body', reactive: false, x_expand: true});
        this._left.connect('repaint', area => this._paintFlare(area, false));
        this._right.connect('repaint', area => this._paintFlare(area, true));
        this.add_child(this._left);
        this.add_child(this._body);
        this.add_child(this._right);
        this._geometryKey = '';
    }

    setGeometry(width, height, topRadius, bottomRadius, cssScale = 1) {
        const top = Math.max(0, Math.min(topRadius, width / 2, height));
        const bottom = Math.max(0, Math.min(bottomRadius, Math.max(0, width - 2 * top) / 2, height));
        const key = `${width}|${height}|${top}|${bottom}|${cssScale}`;
        if (key === this._geometryKey) return;
        this._geometryKey = key;
        this._top = top;
        this.set_size(width, height);
        this._left.set_size(top, top);
        this._right.set_size(top, top);
        this._body.style = `border-radius: 0 0 ${bottom / Math.max(1, cssScale)}px ${bottom / Math.max(1, cssScale)}px;`;
        this._left.queue_repaint();
        this._right.queue_repaint();
    }

    _paintFlare(area, mirrored) {
        const cr = area.get_context();
        const r = this._top ?? 0;
        if (r <= 0) return;
        cr.setSourceRGBA(0, 0, 0, 1);
        cr.setOperator(Cairo.Operator.SOURCE);
        if (!mirrored) {
            cr.moveTo(0, 0);
            cr.lineTo(r, 0);
            // Quadratic (0,0) -> control (r,0) -> (r,r), expressed as a cubic.
            cr.curveTo(2 * r / 3, 0, r, r / 3, r, r);
            cr.lineTo(0, r);
        } else {
            cr.moveTo(r, 0);
            cr.lineTo(0, 0);
            cr.lineTo(0, r);
            cr.curveTo(0, r / 3, r / 3, 0, r, 0);
        }
        cr.closePath();
        cr.fill();
    }
});
