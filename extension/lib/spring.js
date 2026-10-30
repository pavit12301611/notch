/** Small dependency-free damped spring used only while the notch is moving. */
export const SPRING_PROFILES = Object.freeze({
    open: {response: 0.42, damping: 0.8},
    close: {response: 0.45, damping: 1.0},
    resize: {response: 0.38, damping: 0.8},
});

export class SpringValue {
    constructor(value = 0, profile = SPRING_PROFILES.resize) {
        this.value = value;
        this.target = value;
        this.velocity = 0;
        this.setProfile(profile);
    }

    setProfile(profile) {
        const response = Math.max(0.05, Number(profile?.response) || 0.38);
        this.damping = Math.max(0.1, Number(profile?.damping) || 0.8);
        this.omega = 2 * Math.PI / response;
        this.stiffness = this.omega * this.omega;
        this.drag = 2 * this.damping * this.omega;
    }

    setTarget(target, profile) {
        this.target = Number.isFinite(target) ? target : this.value;
        if (profile) this.setProfile(profile);
    }

    snap(value) {
        this.value = this.target = value;
        this.velocity = 0;
    }

    get settled() {
        return Math.abs(this.target - this.value) < 0.05 && Math.abs(this.velocity) < 0.2;
    }

    step(seconds) {
        if (this.settled) {
            this.value = this.target;
            this.velocity = 0;
            return this.value;
        }
        // Semi-implicit Euler with bounded substeps stays stable after a stalled frame.
        let remaining = Math.min(Math.max(Number(seconds) || 0, 0), 0.05);
        while (remaining > 0) {
            const dt = Math.min(remaining, 1 / 240);
            const acceleration = this.stiffness * (this.target - this.value) - this.drag * this.velocity;
            this.velocity += acceleration * dt;
            this.value += this.velocity * dt;
            remaining -= dt;
        }
        if (this.settled) {
            this.value = this.target;
            this.velocity = 0;
        }
        return this.value;
    }
}

export const GEOMETRY_KEYS = ['x', 'y', 'width', 'height', 'topRadius', 'bottomRadius'];

export class SpringGeometry {
    constructor(rect) {
        this.springs = Object.fromEntries(GEOMETRY_KEYS.map(key => [key, new SpringValue(rect[key] ?? 0)]));
    }

    setTarget(rect, profile) {
        for (const key of GEOMETRY_KEYS) this.springs[key].setTarget(rect[key] ?? 0, profile);
    }

    snap(rect) {
        for (const key of GEOMETRY_KEYS) this.springs[key].snap(rect[key] ?? 0);
    }

    get settled() {
        return GEOMETRY_KEYS.every(key => this.springs[key].settled);
    }

    step(seconds) {
        const result = {};
        for (const key of GEOMETRY_KEYS) result[key] = this.springs[key].step(seconds);
        return result;
    }
}

export function easeOutCubic(t) {
    const x = Math.max(0, Math.min(1, t));
    return 1 - (1 - x) ** 3;
}

export function interpolateGeometry(from, to, progress) {
    const result = {};
    for (const key of GEOMETRY_KEYS) result[key] = from[key] + (to[key] - from[key]) * progress;
    return result;
}
