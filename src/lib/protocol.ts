import { MagicEventType, MagicProtocolVersion } from "./index.js";

/**
 * Debug logger interface.
 * @public
 */
export interface DebugLogger {
    debug?: (...args: any[]) => void;
    warn?: (...args: any[]) => void;
    error?: (...args: any[]) => void;
}

/**
 * Supported magic operations.
 * @public
 */
export type MagicOp = "close";

/**
 * Versioned magic/control message payload.
 * @public
 */
export interface MagicMessage {
    v: number;
    op: MagicOp;
}

/**
 * Assert helper (runtime). Throws if condition is falsy.
 * @public
 */
export function invariant(cond: any, message: string): asserts cond {
    if (!cond) throw new Error(message);
}

/**
 * Returns true if value looks like a MagicMessage (shape check).
 * @public
 */
export function isMagicMessage(value: unknown): value is MagicMessage {
    if (value === null || typeof value !== "object") {
        return false;
    }

    const v = (value as any).v;
    const op = (value as any).op;

    return typeof v === "number" && typeof op === "string";
}

/**
 * Encode a MagicMessage for SSE transport.
 * MUST be stable JSON.
 * @public
 */
export function encodeMagicMessage(op: MagicOp): string {
    const msg: MagicMessage = { v: MagicProtocolVersion, op };
    return JSON.stringify(msg);
}

/**
 * Parse and validate a MagicMessage received from SSE.
 * - Validates JSON
 * - Validates shape
 * - Validates version
 *
 * Returns:
 * - { ok: true, msg } on success
 * - { ok: false, error } on failure
 *
 * @public
 */
export function parseMagicMessage(
    rawData: string
): { ok: true; msg: MagicMessage } | { ok: false; error: Error } {
    try {
        const parsed = JSON.parse(rawData);

        if (!isMagicMessage(parsed)) {
            return { ok: false, error: new Error("Invalid magic message schema") };
        }

        if (parsed.v !== MagicProtocolVersion) {
            return {
                ok: false,
                error: new Error(
                    `Unsupported magic protocol version ${parsed.v} (expected ${MagicProtocolVersion})`
                ),
            };
        }

        // Narrow allowed ops for v=1 (future-proof)
        if (parsed.op !== "close") {
            return { ok: false, error: new Error(`Unknown magic op "${parsed.op}"`) };
        }

        return { ok: true, msg: parsed };
    } catch (e: any) {
        return { ok: false, error: new Error(`Invalid magic JSON: ${e?.message ?? e}`) };
    }
}

/**
 * Check if an SSE event name is the magic channel.
 * @public
 */
export function isMagicEventName(name: string): boolean {
    return name === MagicEventType;
}
