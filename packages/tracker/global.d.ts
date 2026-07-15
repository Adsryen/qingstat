// Use a simpler approach with a comment to explain the type
declare global {
    interface Window {
        qingstat: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            q?: any[]; // Command queue for legacy API
            init: (opts: any) => void;
            trackPageview: (opts?: any) => Promise<void>;
            cleanup: () => void;
        };
        /** @deprecated rename window — keep during Counterscale → Qingstat migration */
        counterscale?: Window["qingstat"];
    }
}

export {};
