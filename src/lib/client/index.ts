import { MagicEventType } from "$lib/index.js";
import {
    type DebugLogger,
    invariant,
    parseMagicMessage
} from "$lib/protocol.js";

/**
 * Strongly-typed subset of the DOM `EventTarget` API using `CustomEvent<detail>`.
 *
 * This abstraction ensures that event listeners always receive a typed
 * `CustomEvent` with a strongly-typed `detail` payload.
 *
 * @typeParam T - Event map where keys are event names and values are payload types.
 *
 * @public
 */
export type TypedEventTarget<T extends Record<string, unknown>> = {
    addEventListener<K extends keyof T>(
        type: K,
        listener: (event: CustomEvent<T[K]>) => void,
        options?: boolean | AddEventListenerOptions
    ): void;

    removeEventListener<K extends keyof T>(
        type: K,
        listener: (event: CustomEvent<T[K]>) => void,
        options?: boolean | EventListenerOptions
    ): void;

    dispatch<K extends keyof T>(type: K, detail: T[K]): boolean;
    dispatchEvent(e: Event): boolean;
};

/**
 * Built-in (native) events exposed by the client-side {@link EventSource}.
 *
 * @public
 */
export type TypedEventSourceNativeEventMap = {
    /** Fired when the SSE connection is established. */
    open: undefined;

    /** Fired when the connection is closed (client- or server-initiated). */
    close: { initiator: "server" | "client" };

    /** Fired when a native EventSource error occurs or decoding fails. */
    error: Event;

    /** Fired for default SSE messages without an explicit `event:` field. */
    message: any;
};

/**
 * Full event map for a given SSE stream `S`.
 *
 * This combines:
 * - application-defined events from `App.Events[S]`
 * - built-in SSE lifecycle events
 *
 * @typeParam S - Stream name (key of `App.Events`)
 *
 * @public
 */
export type TypedEventSourceEventMap<S extends keyof App.Events> =
    { [E in keyof App.Events[S] as `${string & E}`]: App.Events[S][E] } &
    TypedEventSourceNativeEventMap;

/**
 * Deserializer function used to decode SSE `data:` payloads.
 *
 * @typeParam S - Stream name (key of `App.Events`)
 *
 * @public
 */
export type Deserializer<S extends keyof App.Events> = <
    E extends keyof App.Events[S]
>(
    event: E,
    data: string
) => App.Events[S][E];

/**
 * Client configuration for {@link EventSource}.
 *
 * Extends the native `EventSourceInit` with optional decoding and debugging hooks.
 *
 * @typeParam S - Stream name (key of `App.Events`)
 *
 * @public
 */
export type ClientInit<S extends keyof App.Events> = EventSourceInit & {
    /**
     * Custom deserializer for application events.
     *
     * If omitted, `JSON.parse` is used.
     *
     * IMPORTANT:
     * - Control (magic) messages bypass this deserializer entirely.
     */
    deserializer?: Deserializer<S>;

    /**
     * Optional debug logger.
     *
     * - `true` uses `console`
     * - a {@link DebugLogger} object uses its provided methods
     * - `undefined` disables debug output
     */
    debug?: DebugLogger | boolean;
};

/**
 * Default deserializer for application events.
 *
 * @internal
 */
const DEFAULT_DESERIALIZER = ((_: any, data: string) => JSON.parse(data)) as Deserializer<any>;

/**
 * Set of native lifecycle events that do NOT require a custom SSE listener.
 *
 * @internal
 */
const NATIVE_EVENTS = new Set(["open", "error", "message", "close"]);

/**
 * Client-side typed wrapper around the browser's native `EventSource`.
 *
 * This class:
 * - enforces typed application events based on `App.Events`
 * - centralizes all decoding into a single pipeline
 * - implements a protocol-level control channel (magic events)
 * - provides chainable helper methods (`on`, `once`, `off`)
 *
 * @typeParam S - Stream name (key of `App.Events`)
 *
 * @example
 * ```ts
 * const es = new EventSource<"status">("/sse");
 *
 * es.onOpen(() => console.log("connected"));
 * es.on("heartbeat", (n) => console.log(n));
 * es.onClose(() => console.log("closed"));
 * ```
 *
 * @public
 */
export class EventSource<S extends keyof App.Events>
    implements TypedEventTarget<TypedEventSourceEventMap<S>>
{
    /** Native browser EventSource instance. */
    private readonly source: globalThis.EventSource;

    /** Internal typed event target. */
    private readonly target = new EventTarget();

    /** Application event deserializer. */
    private readonly deserializer: Deserializer<S>;

    /** Listener reference count per event type. */
    private readonly listenerCount = new Map<string, number>();

    /** Native SSE handlers for custom event types. */
    private readonly nativeCustomHandlers = new Map<string, EventListener>();

    /** Wrapper map enabling correct `off()` behavior. */
    private readonly wrapperMap = new Map<string, Map<Function, EventListener>>();

    /** Whether the connection has been closed. */
    private closed = false;

    /** Optional debug logger. */
    private readonly log?: DebugLogger;

    /**
     * Create a new client-side SSE connection.
     *
     * @param url - SSE endpoint URL
     * @param init - Client configuration options
     */
    constructor(url: string | URL, init: ClientInit<S> = {}) {
        this.deserializer = init.deserializer ?? (DEFAULT_DESERIALIZER as any);

        this.log =
            init.debug === true
                ? console
                : init.debug && typeof init.debug === "object"
                    ? init.debug
                    : undefined;

        this.source = new globalThis.EventSource(url, init);
        this.setupNativeHandlers();
    }

    /** Native `readyState` of the underlying EventSource. */
    get readyState(): number {
        return this.source.readyState;
    }

    /** Resolved URL of the EventSource connection. */
    get url(): string {
        return this.source.url;
    }

    /** Whether credentials are sent with the EventSource request. */
    get withCredentials(): boolean {
        return this.source.withCredentials;
    }

    /**
     * Close the connection (client-initiated).
     *
     * Emits a `close` event with `{ initiator: "client" }`.
     */
    close(): void {
        this.dispatch("close", { initiator: "client" } as any);
        this.closeInternal();
    }

    /**
     * Internal close logic.
     *
     * @internal
     */
    private closeInternal(): void {
        if (this.closed) return;
        this.closed = true;

        this.source.close();
        for (const [eventType, handler] of this.nativeCustomHandlers) {
            this.source.removeEventListener(eventType, handler);
        }
        this.nativeCustomHandlers.clear();
    }

    /**
     * Register native EventSource listeners.
     *
     * @internal
     */
    private setupNativeHandlers(): void {
        this.source.addEventListener("open", () =>
            this.dispatch("open", undefined as any)
        );

        this.source.addEventListener("error", (event) =>
            this.dispatch("error", event as any)
        );

        this.source.addEventListener("message", (event) =>
            this.handleDecodedDispatch(event as MessageEvent, "message")
        );

        // --- MAGIC PROTOCOL HANDLER (bypasses user deserializer) ---
        this.source.addEventListener(MagicEventType, (event) => {
            const raw = String((event as MessageEvent).data);

            invariant(raw.length > 0, "Magic message payload is empty");

            const parsed = parseMagicMessage(raw);

            if (!parsed.ok) {
                this.log?.warn?.("[sse] magic parse failed:", parsed.error);
                this.target.dispatchEvent(
                    new CustomEvent("error", { detail: parsed.error })
                );
                return;
            }

            this.log?.debug?.("[sse] magic message:", parsed.msg);

            if (parsed.msg.op === "close") {
                this.dispatch("close", { initiator: "server" } as any);
                this.closeInternal();
            }
        });
    }

    /**
     * Decode and dispatch an application or default SSE message.
     *
     * @internal
     */
    private handleDecodedDispatch(event: MessageEvent, type: string): void {
        try {
            const decoded = this.deserializer(type as any, String(event.data));
            this.target.dispatchEvent(
                new CustomEvent(type, { detail: decoded })
            );
        } catch (err) {
            this.target.dispatchEvent(
                new CustomEvent("error", { detail: err })
            );
        }
    }

    /**
     * Ensure a native SSE listener exists for a custom event type.
     *
     * @internal
     */
    private ensureCustomNativeHandler(eventType: string): void {
        if (this.nativeCustomHandlers.has(eventType)) return;

        const handler: EventListener = (ev) => {
            const me = ev as MessageEvent;
            try {
                const decoded = this.deserializer(
                    eventType as any,
                    String(me.data)
                );
                this.target.dispatchEvent(
                    new CustomEvent(eventType, { detail: decoded })
                );
            } catch (err) {
                this.target.dispatchEvent(
                    new CustomEvent("error", { detail: err })
                );
            }
        };

        this.nativeCustomHandlers.set(eventType, handler);
        this.source.addEventListener(eventType, handler);
    }

    /**
     * Increment or decrement listener reference count.
     *
     * @internal
     */
    private bumpCount(eventType: string, delta: number): number {
        const next = (this.listenerCount.get(eventType) ?? 0) + delta;
        if (next <= 0) this.listenerCount.delete(eventType);
        else this.listenerCount.set(eventType, next);
        return next;
    }

    /**
     * Add a typed event listener.
     */
    addEventListener<K extends keyof TypedEventSourceEventMap<S>>(
        type: K,
        listener: (event: CustomEvent<TypedEventSourceEventMap<S>[K]>) => void,
        options?: boolean | AddEventListenerOptions
    ): void {
        const eventType = String(type);
        this.target.addEventListener(eventType, listener as any, options);

        if (!NATIVE_EVENTS.has(eventType) && eventType !== MagicEventType) {
            const count = this.bumpCount(eventType, +1);
            if (count === 1) this.ensureCustomNativeHandler(eventType);
        }
    }

    /**
     * Remove a typed event listener.
     */
    removeEventListener<K extends keyof TypedEventSourceEventMap<S>>(
        type: K,
        listener: (event: CustomEvent<TypedEventSourceEventMap<S>[K]>) => void,
        options?: boolean | EventListenerOptions
    ): void {
        const eventType = String(type);
        this.target.removeEventListener(eventType, listener as any, options);

        if (!NATIVE_EVENTS.has(eventType) && eventType !== MagicEventType) {
            const count = this.bumpCount(eventType, -1);
            if (count === 0) {
                const handler = this.nativeCustomHandlers.get(eventType);
                if (handler) this.source.removeEventListener(eventType, handler);
                this.nativeCustomHandlers.delete(eventType);
            }
        }
    }

    /** Dispatch a typed event. */
    dispatch<K extends keyof TypedEventSourceEventMap<S>>(
        type: K,
        detail: TypedEventSourceEventMap<S>[K]
    ): boolean {
        return this.target.dispatchEvent(
            new CustomEvent(String(type), { detail })
        );
    }

    /** Dispatch a raw event. */
    dispatchEvent(event: Event): boolean {
        return this.target.dispatchEvent(event);
    }

    /** Register an `open` listener. */
    onOpen(listener: () => void): this {
        this.addEventListener("open" as any, (() => listener()) as any);
        return this;
    }

    /** Register an `error` listener. */
    onError(listener: (error: Event) => void): this {
        this.addEventListener(
            "error" as any,
            ((e: CustomEvent<Event>) => listener(e.detail)) as any
        );
        return this;
    }

    /** Register a `close` listener. */
    onClose(listener: (e: CustomEvent<{ initiator: "server" | "client" }>) => void): this {
        this.addEventListener("close" as any, listener as any);
        return this;
    }

    /** Register a `message` listener. */
    onMessage(listener: (data: any) => void): this {
        this.addEventListener(
            "message" as any,
            ((e: CustomEvent<any>) => listener(e.detail)) as any
        );
        return this;
    }

    /**
     * Get or create a wrapper store for an event type.
     *
     * @internal
     */
    private getWrapperStore(eventType: string): Map<Function, EventListener> {
        let store = this.wrapperMap.get(eventType);
        if (!store) {
            store = new Map();
            this.wrapperMap.set(eventType, store);
        }
        return store;
    }

    /**
     * Listen to a typed application event.
     */
    on<K extends keyof App.Events[S]>(
        eventType: K,
        listener: (data: App.Events[S][K]) => void
    ): this {
        const type = String(eventType);
        const store = this.getWrapperStore(type);

        const wrapper: EventListener = (e) =>
            listener((e as CustomEvent).detail);

        store.set(listener, wrapper);
        this.addEventListener(eventType as any, wrapper as any);
        return this;
    }

    /**
     * Listen once to a typed application event.
     */
    once<K extends keyof App.Events[S]>(
        eventType: K,
        listener: (data: App.Events[S][K]) => void
    ): this {
        const type = String(eventType);
        const store = this.getWrapperStore(type);

        const wrapper: EventListener = (e) => {
            listener((e as CustomEvent).detail);
            this.removeEventListener(eventType as any, wrapper as any);
            store.delete(listener);
            if (store.size === 0) this.wrapperMap.delete(type);
        };

        store.set(listener, wrapper);
        this.addEventListener(eventType as any, wrapper as any);
        return this;
    }

    /**
     * Remove a listener previously registered with {@link on} or {@link once}.
     */
    off<K extends keyof App.Events[S]>(
        eventType: K,
        listener: (data: App.Events[S][K]) => void
    ): this {
        const type = String(eventType);
        const store = this.wrapperMap.get(type);
        const wrapper = store?.get(listener);

        if (wrapper) {
            this.removeEventListener(eventType as any, wrapper as any);
            store!.delete(listener);
            if (store!.size === 0) this.wrapperMap.delete(type);
        }
        return this;
    }
}
