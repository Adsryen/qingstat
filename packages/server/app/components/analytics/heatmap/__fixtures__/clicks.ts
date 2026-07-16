/**
 * Synthetic heatmap click fixtures for spike evaluation only.
 * Not derived from real user traffic.
 */

export type SyntheticDeviceBucket = "desktop" | "mobile" | "tablet" | "unknown";

export type SyntheticCoordinatePoint = {
    mode: "coordinate";
    xRatio: number;
    yRatio: number;
    viewportWidth: number;
    viewportHeight: number;
    scrollY: number;
    documentHeight: number;
    pagePath: string;
    pageVersion: string;
    deviceBucket: SyntheticDeviceBucket;
    sampleRate: number;
    timestamp: number;
    /** optional for mixed ranking demos */
    elementKey?: string;
    actionUrl?: string;
};

export type SyntheticElementEvent = {
    mode: "element";
    elementKey: string;
    pagePath: string;
    pageVersion: string;
    deviceBucket: SyntheticDeviceBucket;
    sampleRate: number;
    timestamp: number;
};

export type SyntheticLinkEvent = {
    mode: "link";
    actionUrl: string;
    elementKey?: string;
    pagePath: string;
    pageVersion: string;
    deviceBucket: SyntheticDeviceBucket;
    sampleRate: number;
    timestamp: number;
};

export type SyntheticHeatEvent =
    | SyntheticCoordinatePoint
    | SyntheticElementEvent
    | SyntheticLinkEvent;

/** Deterministic LCG for reproducible fixtures. */
function createRng(seed: number): () => number {
    let s = seed >>> 0 || 1;
    return () => {
        s = (Math.imul(1664525, s) + 1013904223) >>> 0;
        return s / 0x100000000;
    };
}

const HOTSPOTS = [
    { x: 0.5, y: 0.22, w: 0.08, h: 0.04 }, // hero CTA
    { x: 0.72, y: 0.08, w: 0.06, h: 0.03 }, // nav
    { x: 0.35, y: 0.55, w: 0.12, h: 0.05 }, // mid card
    { x: 0.5, y: 0.82, w: 0.1, h: 0.04 }, // footer CTA
];

const ELEMENT_KEYS = [
    "button#cta-primary",
    "a#nav-pricing",
    "button#cta-secondary[data-testid=try]",
    "a#footer-docs",
    "div#hero-card",
    "button#mobile-menu",
];

const LINK_PATHS = [
    "/pricing",
    "/docs/start",
    "/signup",
    "/blog/launch",
    "/contact",
    "/features",
];

export type GenerateSyntheticClicksOptions = {
    count: number;
    pageVersion?: string;
    deviceBucket?: SyntheticDeviceBucket;
    seed?: number;
    pagePath?: string;
    sampleRate?: number;
    /** fraction of points that also carry elementKey */
    elementFraction?: number;
    /** fraction of points that also carry actionUrl */
    linkFraction?: number;
};

/**
 * Generate synthetic coordinate points (with optional element/link annotations).
 */
export function generateSyntheticClicks(
    options: GenerateSyntheticClicksOptions,
): SyntheticCoordinatePoint[] {
    const {
        count,
        pageVersion = "v1",
        deviceBucket = "desktop",
        seed = 42,
        pagePath = "/home",
        sampleRate = 0.1,
        elementFraction = 0.35,
        linkFraction = 0.25,
    } = options;

    const rand = createRng(seed);
    const isMobile = deviceBucket === "mobile";
    const viewportWidth = isMobile ? 390 : 1280;
    const viewportHeight = isMobile ? 844 : 800;
    const documentHeight = isMobile ? 3200 : 2400;
    const now = 1_700_000_000_000;

    const points: SyntheticCoordinatePoint[] = [];
    for (let i = 0; i < count; i++) {
        const useHot = rand() < 0.72;
        let xRatio: number;
        let yRatio: number;
        if (useHot) {
            const h = HOTSPOTS[Math.floor(rand() * HOTSPOTS.length)];
            // gaussian-ish via average of uniforms
            const jx = (rand() + rand() + rand()) / 3 - 0.5;
            const jy = (rand() + rand() + rand()) / 3 - 0.5;
            xRatio = clamp01(h.x + jx * h.w * 2);
            yRatio = clamp01(h.y + jy * h.h * 2);
        } else {
            xRatio = rand();
            yRatio = rand();
        }

        const point: SyntheticCoordinatePoint = {
            mode: "coordinate",
            xRatio,
            yRatio,
            viewportWidth,
            viewportHeight,
            scrollY: Math.floor(yRatio * Math.max(0, documentHeight - viewportHeight)),
            documentHeight,
            pagePath,
            pageVersion,
            deviceBucket,
            sampleRate,
            timestamp: now + i * 1000,
        };

        if (rand() < elementFraction) {
            point.elementKey =
                ELEMENT_KEYS[Math.floor(rand() * ELEMENT_KEYS.length)];
        }
        if (rand() < linkFraction) {
            point.actionUrl =
                LINK_PATHS[Math.floor(rand() * LINK_PATHS.length)];
        }

        points.push(point);
    }
    return points;
}

export function generateElementEvents(options: {
    count: number;
    pageVersion?: string;
    deviceBucket?: SyntheticDeviceBucket;
    seed?: number;
    pagePath?: string;
}): SyntheticElementEvent[] {
    const rand = createRng((options.seed ?? 7) + 99);
    const out: SyntheticElementEvent[] = [];
    for (let i = 0; i < options.count; i++) {
        out.push({
            mode: "element",
            elementKey: ELEMENT_KEYS[Math.floor(rand() * ELEMENT_KEYS.length)],
            pagePath: options.pagePath ?? "/home",
            pageVersion: options.pageVersion ?? "v1",
            deviceBucket: options.deviceBucket ?? "desktop",
            sampleRate: 0.1,
            timestamp: 1_700_000_000_000 + i * 500,
        });
    }
    return out;
}

export function generateLinkEvents(options: {
    count: number;
    pageVersion?: string;
    deviceBucket?: SyntheticDeviceBucket;
    seed?: number;
    pagePath?: string;
}): SyntheticLinkEvent[] {
    const rand = createRng((options.seed ?? 11) + 123);
    const out: SyntheticLinkEvent[] = [];
    for (let i = 0; i < options.count; i++) {
        const actionUrl = LINK_PATHS[Math.floor(rand() * LINK_PATHS.length)];
        out.push({
            mode: "link",
            actionUrl,
            elementKey: `a[data-path=${actionUrl}]`,
            pagePath: options.pagePath ?? "/home",
            pageVersion: options.pageVersion ?? "v1",
            deviceBucket: options.deviceBucket ?? "desktop",
            sampleRate: 0.1,
            timestamp: 1_700_000_000_000 + i * 500,
        });
    }
    return out;
}

/** Prebuilt sizes for render/cost experiments. */
export const FIXTURE_1K = generateSyntheticClicks({
    count: 1000,
    seed: 1,
    pageVersion: "v1",
});
export const FIXTURE_10K = generateSyntheticClicks({
    count: 10_000,
    seed: 2,
    pageVersion: "v1",
});
export const FIXTURE_100K = generateSyntheticClicks({
    count: 100_000,
    seed: 3,
    pageVersion: "v1",
});

export const FIXTURE_V2_DESKTOP = generateSyntheticClicks({
    count: 2000,
    seed: 4,
    pageVersion: "v2",
    deviceBucket: "desktop",
});
export const FIXTURE_V2_MOBILE = generateSyntheticClicks({
    count: 2000,
    seed: 5,
    pageVersion: "v2",
    deviceBucket: "mobile",
});

function clamp01(n: number): number {
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
}
