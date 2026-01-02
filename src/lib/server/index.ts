import { EventEmitter } from "node:events";
import { MagicEventType } from "../index.js";
import { type DebugLogger, encodeMagicMessage, invariant } from "../protocol.js";

/**
 * A single SSE message block produced by the server.
 *
 * - Use `{ retry }` to instruct the browser reconnect delay.
 * - Use `{ event, data, id }` to emit application events.
 *
 * @public
 */
export type EventSourceMessage<T = any> =
    | { retry: number }
    | { id?: number; event?: string; data: T | T[] };

/**
 * Configuration options for the server-side {@link EventSource}.
 *
 * @typeParam S - Stream name (key of `App.Events`) that determines the typed event map.
 *
 * @public
 */
export type SSEConfiguration<S extends keyof App.Events = keyof App.Events> = {
    /**
     * Stream name (must be a key of `App.Events`).
     *
     * This value is only used for typing and debugging; the SSE endpoint URL defines routing.
     */
    name: S;

    /**
     * Serializer used for application events emitted via {@link EventSource.emit}.
     *
     * If omitted, `JSON.stringify` is used.
     *
     * IMPORTANT: Control/protocol ("magic") messages bypass this serializer and always use
     * the library-defined wire format.
     */
    serializer?: <E extends keyof App.Events[S] = keyof App.Events[S]>(
        event: E | undefined,
        val: App.Events[S][E]
    ) => string;

    /**
     * Suggested browser reconnect delay in milliseconds.
     * Written as an SSE `retry:` directive when the stream starts.
     *
     * @defaultValue 15000
     */
    retry_interval?: number;

    /**
     * Keep-alive interval in milliseconds.
     * A comment line `: ping` is emitted periodically to keep proxies/connections alive.
     *
     * @defaultValue 30000
     */
    ping_interval?: number;

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
 * Lifecycle events emitted by {@link EventSource.unsafe.events}.
 *
 * @public
 */
export type EventSourceEventMap = {
    /** Emitted when the SSE stream starts. */
    open: [];

    /** Emitted when the SSE stream is cancelled/closed by the client. */
    close: [];

    /** Emitted every time a keep-alive ping comment is written. */
    ping: [];
};

/**
 * Server-side SSE stream helper for SvelteKit endpoints.
 *
 * This class creates a `Response` streaming `text/event-stream` data and provides a typed
 * {@link emit} method for sending application events based on `App.Events`.
 *
 * It also implements a small control protocol (magic events) used for server-requested
 * termination via {@link stop}. Control messages MUST be decodable regardless of any
 * user-defined serializer/deserializer.
 *
 * @example
 * ```ts
 * // routes/sse/+server.ts
 * import type { RequestHandler } from "./$types";
 * import { EventSource } from "$lib/server/index.js";
 *
 * export const GET: RequestHandler = () => {
 *   const sse = new EventSource("status");
 *   sse.emit("heartbeat", Date.now());
 *   return sse.response();
 * };
 * ```
 *
 * @typeParam S - Stream name (key of `App.Events`)
 *
 * @public
 */
export class EventSource<S extends keyof App.Events = keyof App.Events> {
    private readonly config: {
        name: S;
        retry_interval: number;
        ping_interval: number;
        serializer: <E extends keyof App.Events[S] = keyof App.Events[S]>(
            event: E | undefined,
            val: App.Events[S][E]
        ) => string;
    };

    private open = false;
    private controller?: ReadableStreamDefaultController<Uint8Array>;
    private pingTimer?: NodeJS.Timeout;
    private readonly encoder = new TextEncoder();
    private stream?: ReadableStream<Uint8Array>;
    private readonly log?: DebugLogger;

    /**
     * Create a new server-side SSE stream helper.
     *
     * @param name - Stream name (key of `App.Events`) used for typing and debug output.
     * @param cfg - Optional configuration (serializer, ping/retry intervals, debug logger).
     */
    constructor(name: S, cfg: Omit<SSEConfiguration<S>, "name"> = {}) {
        const serializer = cfg.serializer ?? ((_: any, val: any) => JSON.stringify(val));

        // debug=true -> console logger
        this.log =
            cfg.debug === true
                ? console
                : cfg.debug && typeof cfg.debug === "object"
                    ? cfg.debug
                    : undefined;

        this.config = {
            name,
            retry_interval: cfg.retry_interval ?? 15_000,
            ping_interval: cfg.ping_interval ?? 30_000,
            serializer: serializer as any,
        };
    }

    /**
     * The configured stream name (key of `App.Events`).
     */
    get name(): S {
        return this.config.name;
    }

    /**
     * Whether the stream is currently open and writable.
     *
     * Note: This becomes `false` when the client disconnects (stream cancel).
     */
    get isOpen(): boolean {
        return this.open;
    }

    /**
     * Write a raw line (UTF-8 encoded) to the response stream controller.
     *
     * @remarks
     * Assumes {@link controller} is defined (i.e., the stream is open).
     */
    private write(line: string): void {
        this.controller!.enqueue(this.encoder.encode(line));
    }

    /**
     * Enqueue a structured SSE message block.
     *
     * @param message - The SSE message to enqueue.
     * @returns `true` if enqueued; `false` if stream is not open.
     */
    private enqueue(message: EventSourceMessage): boolean {
        if (!this.open || !this.controller) return false;

        if ("retry" in message) {
            this.write(`retry: ${message.retry}\n\n`);
            return true;
        }

        if (message.id !== undefined) this.write(`id: ${message.id}\n`);
        if (message.event) this.write(`event: ${message.event}\n`);

        const items = Array.isArray(message.data) ? message.data : [message.data];
        for (const item of items) {
            const dataStr = this.config.serializer(message.event as any, item as any);
            this.write(`data: ${dataStr}\n`);
        }
        this.write("\n");
        return true;
    }

    /**
     * Emit an application event to the client.
     *
     * The event name is taken from `App.Events[S]` and payload is typed accordingly.
     *
     * @param event - Application event name (key of `App.Events[S]`).
     * @param message - Payload, or an array of payloads (each element becomes a `data:` line).
     * @param id - Optional SSE event id.
     * @returns `true` if written; `false` if the stream is not open.
     */
    emit<E extends keyof App.Events[S]>(
        event: E,
        message: App.Events[S][E] | App.Events[S][E][],
        id?: number
    ): boolean {
        return this.enqueue({ event: String(event), data: message as any, id });
    }

    /**
     * Advanced/unsafe APIs.
     *
     * Use these only if you know SSE formatting rules and accept losing type safety.
     *
     * @public
     */
    public readonly unsafe = {
        /**
         * Send an arbitrary SSE message.
         *
         * @param data - Data payload (will be passed through the normal enqueue path)
         * @param options - Optional SSE `id` and `event` fields.
         */
        send: (data: any, options?: Partial<{ id: number; event: string }>): boolean =>
            this.enqueue({ id: options?.id, event: options?.event, data }),

        /**
         * Lifecycle events (`open`, `close`, `ping`) for the SSE stream.
         */
        events: new EventEmitter<EventSourceEventMap>(),
    };

    /**
     * Subscribe to lifecycle events from {@link unsafe.events}.
     * @public
     */
    public readonly on = this.unsafe.events.on.bind(this.unsafe.events);

    /**
     * Subscribe once to lifecycle events from {@link unsafe.events}.
     * @public
     */
    public readonly once = this.unsafe.events.once.bind(this.unsafe.events);

    /**
     * Unsubscribe from lifecycle events from {@link unsafe.events}.
     * @public
     */
    public readonly off = this.unsafe.events.off.bind(this.unsafe.events);

    /**
     * Request the client to close the connection.
     *
     * This method emits a protocol-level "magic" message over the SSE stream.
     *
     * IMPORTANT:
     * - This bypasses any user serializer.
     * - The payload is always protocol JSON created by {@link encodeMagicMessage}.
     *
     * @returns `true` if the magic close request was written; `false` if stream is not open.
     */
    stop(): boolean {
        if (!this.open || !this.controller) return false;

        // Protocol control message MUST bypass user serializer
        const data = encodeMagicMessage("close");

        // Basic runtime assertion: avoid newline injection in event name
        invariant(!MagicEventType.includes("\n"), "MagicEventType must not contain newlines");

        this.log?.debug?.("[sse] sending magic close");

        this.write(`event: ${MagicEventType}\n`);
        this.write(`data: ${data}\n\n`);
        return true;
    }

    /**
     * Create a SvelteKit `Response` that streams Server-Sent Events.
     *
     * @param init - Optional `ResponseInit` to merge headers/status.
     * @returns A `Response` with `Content-Type: text/event-stream`.
     *
     * @remarks
     * - When the client disconnects, the stream `cancel` callback fires and lifecycle `close` is emitted.
     * - This method is intended to be called once per request.
     */
    response(init?: ResponseInit): Response {
        this.stream = new ReadableStream<Uint8Array>({
            start: (controller) => {
                this.log?.debug?.("[sse] open", this.config.name);
                this.controller = controller;
                this.open = true;

                // Tell the browser how long to wait before attempting to reconnect
                this.enqueue({ retry: this.config.retry_interval });

                // Keep-alive ping (SSE comment)
                this.pingTimer = setInterval(() => {
                    if (!this.open || !this.controller) return;
                    this.write(": ping\n\n");
                    this.unsafe.events.emit("ping");
                }, this.config.ping_interval);

                this.unsafe.events.emit("open");
                this.write(": hello\n\n");
            },
            cancel: () => {
                if (!this.open) return;
                this.log?.debug?.("[sse] close", this.config.name);
                this.open = false;

                if (this.pingTimer) {
                    clearInterval(this.pingTimer);
                    this.pingTimer = undefined;
                }

                this.unsafe.events.emit("close");
            },
        });

        return new Response(this.stream, {
            ...init,
            headers: {
                ...init?.headers,
                "Cache-Control": "no-store",
                "Content-Type": "text/event-stream",
            },
        });
    }
}

export default EventSource;
