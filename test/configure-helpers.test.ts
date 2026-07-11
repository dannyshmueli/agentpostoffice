import { describe, expect, it } from "vitest";
import { findD1DatabaseId, resourceListContains } from "../tools/configure-helpers.js";

describe("Cloudflare configuration helpers", () => {
  it("finds only an exact D1 database name with a valid UUID", () => {
    const databases = [
      { name: "agentpostoffice-old", uuid: "00000000-0000-4000-8000-000000000001" },
      { name: "agentpostoffice", uuid: "11111111-1111-4111-8111-111111111111" },
    ];
    expect(findD1DatabaseId(databases, "agentpostoffice")).toBe("11111111-1111-4111-8111-111111111111");
    expect(findD1DatabaseId(databases, "missing")).toBeNull();
  });

  it("ignores malformed list entries", () => {
    expect(findD1DatabaseId([{ name: "agentpostoffice", uuid: "not-a-uuid" }], "agentpostoffice")).toBeNull();
  });

  it("detects exact R2 names from current Wrangler text output", () => {
    const output = "Listing buckets...\nname:           agentpostoffice-mail-old\ncreation_date: x\n\nname:           agentpostoffice-mail\ncreation_date: y\n";
    expect(resourceListContains(output, "agentpostoffice-mail")).toBe(true);
    expect(resourceListContains(output, "agentpostoffice")).toBe(false);
  });

  it("detects exact Queue names from current Wrangler tables", () => {
    const output = "│ id │ name │ created_on │\n│ 1 │ agentpostoffice-mail-old │ x │\n│ 2 │ agentpostoffice-mail │ y │";
    expect(resourceListContains(output, "agentpostoffice-mail")).toBe(true);
    expect(resourceListContains(output, "inbox-mail")).toBe(false);
  });
});
