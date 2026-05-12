import { describe, it, expect } from "vitest";
import {
  isIPv4,
  parseHostPort,
  canonicalWebsiteKey,
  computeDuplicateGroups,
} from "../src/core/dedup.js";

import simpleDupe from "./fixtures/simple-dupe.json" with { type: "json" };
import mixedTypes from "./fixtures/mixed-types.json" with { type: "json" };
import uriVariations from "./fixtures/uri-variations.json" with { type: "json" };
import noUriFallback from "./fixtures/no-uri-fallback.json" with { type: "json" };
import bitwardenSample from "./fixtures/bitwarden-sample.json" with { type: "json" };

describe("isIPv4", () => {
  it("recognizes IPv4 addresses", () => {
    expect(isIPv4("192.168.1.1")).toBe(true);
    expect(isIPv4("10.0.0.1")).toBe(true);
  });
  it("rejects non-IPv4 strings", () => {
    expect(isIPv4("google.com")).toBe(false);
    expect(isIPv4("")).toBe(false);
    expect(isIPv4("192.168.1")).toBe(false);
  });
});

describe("parseHostPort", () => {
  it("parses https URLs", () => {
    expect(parseHostPort("https://example.com/path")).toEqual({ host: "example.com", port: null });
  });
  it("parses http URLs", () => {
    expect(parseHostPort("http://example.com")).toEqual({ host: "example.com", port: null });
  });
  it("parses URLs with explicit ports", () => {
    expect(parseHostPort("https://example.com:8080/x")).toEqual({ host: "example.com", port: "8080" });
  });
  it("handles URLs without scheme", () => {
    expect(parseHostPort("example.com/x")).toEqual({ host: "example.com", port: null });
  });
  it("strips userinfo", () => {
    expect(parseHostPort("https://user:pass@example.com")).toEqual({ host: "example.com", port: null });
  });
  it("lowercases the host", () => {
    expect(parseHostPort("HTTPS://Example.COM")).toEqual({ host: "example.com", port: null });
  });
  it("returns null for empty/null inputs", () => {
    expect(parseHostPort("")).toBeNull();
    expect(parseHostPort(null)).toBeNull();
    expect(parseHostPort(undefined)).toBeNull();
  });
  it("returns null for host without dot (and not IPv4)", () => {
    expect(parseHostPort("https://localhost")).toBeNull();
  });
  it("accepts IPv4 hosts without dots-rule rejection", () => {
    expect(parseHostPort("https://192.168.1.1")).toEqual({ host: "192.168.1.1", port: null });
  });
});

describe("canonicalWebsiteKey", () => {
  it("returns null for non-login types", () => {
    expect(canonicalWebsiteKey({ type: 2, name: "note" })).toBeNull();
    expect(canonicalWebsiteKey({ type: 3, name: "card" })).toBeNull();
  });

  it("extracts host from first valid URI", () => {
    const item = { type: 1, name: "x", login: { uris: [{ uri: "https://google.com" }] } };
    expect(canonicalWebsiteKey(item)).toBe("google.com");
  });

  it("strips www subdomain treats it as part of host (NOT stripped - current behavior)", () => {
    const item = { type: 1, name: "x", login: { uris: [{ uri: "https://www.google.com" }] } };
    expect(canonicalWebsiteKey(item)).toBe("www.google.com");
  });

  it("falls back to email domain when no URI", () => {
    const item = { type: 1, name: "x", login: { username: "me@example.com", uris: [] } };
    expect(canonicalWebsiteKey(item)).toBe("example.com");
  });

  it("falls back to name-embedded domain when no URI and no email", () => {
    const item = { type: 1, name: "Login at acme.io", login: { username: "bob", uris: [] } };
    expect(canonicalWebsiteKey(item)).toBe("acme.io");
  });

  it("preserves IPv4 host with port", () => {
    const item = { type: 1, name: "x", login: { uris: [{ uri: "https://10.0.0.5:8080" }] } };
    expect(canonicalWebsiteKey(item)).toBe("10.0.0.5:8080");
  });

  it("returns null when no host is derivable", () => {
    const item = { type: 1, name: "Random", login: { username: "user", uris: [] } };
    expect(canonicalWebsiteKey(item)).toBeNull();
  });
});

describe("computeDuplicateGroups", () => {
  it("groups two same-site same-user entries (case-insensitive username)", () => {
    const groups = computeDuplicateGroups(simpleDupe.items);
    expect(groups).toHaveLength(1);
    expect(groups[0].site).toBe("google.com");
    expect(groups[0].usernameLower).toBe("alice@example.com");
    expect(groups[0].indices).toEqual([0, 1]);
  });

  it("skips non-login types entirely", () => {
    const groups = computeDuplicateGroups(mixedTypes.items);
    expect(groups).toHaveLength(1);
    expect(groups[0].indices).toEqual([0, 1]);
  });

  it("treats all 4 uri-variations of foo.com as one group (www. is NOT stripped)", () => {
    const groups = computeDuplicateGroups(uriVariations.items);
    const fooGroup = groups.find(g => g.site === "foo.com");
    expect(fooGroup).toBeDefined();
    expect(fooGroup.indices.sort()).toEqual([0, 1, 3]);
  });

  it("falls back to email-domain matching across entries without URIs", () => {
    const groups = computeDuplicateGroups(noUriFallback.items);
    expect(groups).toHaveLength(2);
  });

  it("excludes groups of size 1", () => {
    const items = [
      { id: "a", type: 1, name: "x", creationDate: "2020-01-01", revisionDate: "2020-01-01",
        login: { username: "lonely@x.com", uris: [{ uri: "https://lonely.com" }] } }
    ];
    expect(computeDuplicateGroups(items)).toEqual([]);
  });

  it("returns empty array for a real Bitwarden sample export with no duplicates", () => {
    expect(computeDuplicateGroups(bitwardenSample.items)).toEqual([]);
  });

  it("sorts groups: site asc, then username asc, then size desc", () => {
    const items = [
      { id: "1", type: 1, name: "B", creationDate: "1", revisionDate: "1",
        login: { username: "u@b.com", uris: [{ uri: "https://b.com" }] } },
      { id: "2", type: 1, name: "B", creationDate: "2", revisionDate: "2",
        login: { username: "u@b.com", uris: [{ uri: "https://b.com" }] } },
      { id: "3", type: 1, name: "A", creationDate: "1", revisionDate: "1",
        login: { username: "u@a.com", uris: [{ uri: "https://a.com" }] } },
      { id: "4", type: 1, name: "A", creationDate: "2", revisionDate: "2",
        login: { username: "u@a.com", uris: [{ uri: "https://a.com" }] } }
    ];
    const groups = computeDuplicateGroups(items);
    expect(groups.map(g => g.site)).toEqual(["a.com", "b.com"]);
  });
});
