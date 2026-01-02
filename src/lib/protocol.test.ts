import { describe, it, expect } from "vitest";
import {
    encodeMagicMessage,
    parseMagicMessage,
    isMagicMessage,
} from "./protocol.js";
import {MagicProtocolVersion} from "./index.js";

describe("SMCP (SSE Magic Control Protocol)", () => {
    it("encodes a versioned close message", () => {
        const raw = encodeMagicMessage("close");
        const obj = JSON.parse(raw);

        expect(obj).toEqual({ v: MagicProtocolVersion, op: "close" });
    });

    it("parses a valid close message", () => {
        const raw = JSON.stringify({ v: MagicProtocolVersion, op: "close" });
        const res = parseMagicMessage(raw);

        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.msg.v).toBe(MagicProtocolVersion);
            expect(res.msg.op).toBe("close");
        }
    });

    it("rejects invalid JSON", () => {
        const res = parseMagicMessage("{not json");
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error.message).toMatch(/Invalid magic JSON/);
    });

    it("rejects schema mismatch", () => {
        const res = parseMagicMessage(JSON.stringify({ v: MagicProtocolVersion }));
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error.message).toMatch(/schema/i);
    });

    it("rejects unsupported version", () => {
        const res = parseMagicMessage(JSON.stringify({ v: 999, op: "close" }));
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error.message).toMatch(/Unsupported magic protocol version/);
    });

    it("rejects unknown op in v=1", () => {
        const res = parseMagicMessage(JSON.stringify({ v: MagicProtocolVersion, op: "pause" }));
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error.message).toMatch(/Unknown magic op/);
    });

    it("isMagicMessage does a shape check", () => {
        expect(isMagicMessage({ v: 1, op: "close" })).toBe(true);
        expect(isMagicMessage({ v: "1", op: "close" })).toBe(false);
        expect(isMagicMessage(null)).toBe(false);
    });
});
