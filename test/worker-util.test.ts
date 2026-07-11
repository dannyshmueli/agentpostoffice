import { describe, expect, it } from "vitest";
import {
  constantTimeEqual,
  decodeCursor,
  encodeCursor,
  excerptUtf8,
  normalizeAddress,
  normalizeDomain,
  normalizeLocalPart,
} from "../packages/worker/src/util.js";

describe("Worker boundary utilities", () => {
  it("normalizes domains, SMTP addresses, and mailbox local parts", () => {
    expect(normalizeDomain(" Mail.Example.COM. ")).toBe("mail.example.com");
    expect(normalizeAddress(" Agent+Jobs@Mail.Example.com ")).toBe("agent+jobs@mail.example.com");
    expect(normalizeLocalPart(" Research ")).toBe("research");
    expect(() => normalizeLocalPart("bad address")).toThrow("invalid mailbox local part");
  });

  it("bounds excerpts by UTF-8 bytes without cutting a code point", () => {
    expect(excerptUtf8("hello", 5)).toEqual({ text: "hello", truncated: false });
    expect(excerptUtf8("a🙂b", 5)).toEqual({ text: "a🙂", truncated: true });
  });

  it("round-trips opaque keyset cursors and rejects tampering", () => {
    const cursor = encodeCursor("2026-07-10T10:00:00.000Z", "msg_002");
    expect(cursor).not.toContain("2026");
    expect(decodeCursor(cursor)).toEqual({ receivedAt: "2026-07-10T10:00:00.000Z", messageId: "msg_002" });
    expect(() => decodeCursor("not-a-cursor")).toThrow("invalid cursor");
  });

  it("compares digests without early length acceptance", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abc0")).toBe(false);
  });
});
