import { describe, it, expect } from "vitest";
import {
  isIPv4,
  parseHostPort,
  canonicalWebsiteKey,
  siteKeyInfo,
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
  it("returns null for a host without a dot", () => {
    expect(parseHostPort("https://localhost")).toBeNull();
    expect(parseHostPort("https://localhost:3000")).toBeNull();
  });
  it("parses IPv4 hosts", () => {
    expect(parseHostPort("https://192.168.1.1")).toEqual({ host: "192.168.1.1", port: null });
  });
  it("stops the host at a query string or fragment", () => {
    expect(parseHostPort("https://example.com?ref=1")).toEqual({ host: "example.com", port: null });
    expect(parseHostPort("example.com#login")).toEqual({ host: "example.com", port: null });
    expect(parseHostPort("https://10.0.0.1:8080?x=1")).toEqual({ host: "10.0.0.1", port: "8080" });
  });
  it("parses IPv6 hosts with and without a port", () => {
    expect(parseHostPort("https://[fe80::1]:5001/login")).toEqual({ host: "[fe80::1]", port: "5001" });
    expect(parseHostPort("https://[2001:DB8::2]")).toEqual({ host: "[2001:db8::2]", port: null });
  });
});

describe("canonicalWebsiteKey", () => {
  it("returns null for non-login types", () => {
    expect(canonicalWebsiteKey({ type: 2, name: "note" })).toBeNull();
    expect(canonicalWebsiteKey({ type: 3, name: "card" })).toBeNull();
  });

  it("prefers a web address over an app link", () => {
    const item = { type: 1, name: "x", login: { uris: [
      { uri: "androidapp://com.github.android" },
      { uri: "https://github.com/login" }
    ] } };
    expect(siteKeyInfo(item)).toEqual({ key: "github.com", source: "uri" });
  });

  it("uses an app link when the entry has no web address", () => {
    const item = { type: 1, name: "x", login: { uris: [{ uri: "androidapp://com.github.android" }] } };
    expect(canonicalWebsiteKey(item)).toBe("com.github.android");
  });

  it("keeps the port for IPv6 hosts like it does for IPv4", () => {
    const item = { type: 1, name: "x", login: { uris: [{ uri: "https://[fe80::1]:5001" }] } };
    expect(canonicalWebsiteKey(item)).toBe("[fe80::1]:5001");
  });

  it("ignores the port for domain names", () => {
    const item = { type: 1, name: "x", login: { uris: [{ uri: "https://example.com:8443" }] } };
    expect(canonicalWebsiteKey(item)).toBe("example.com");
  });

  it("reports where the key came from", () => {
    expect(siteKeyInfo({ type: 1, name: "x", login: { username: "me@example.com", uris: [] } }))
      .toEqual({ key: "example.com", source: "email" });
    expect(siteKeyInfo({ type: 1, name: "Login at acme.io", login: { username: "bob", uris: [] } }))
      .toEqual({ key: "acme.io", source: "name" });
    // the email domain comes before a domain in the name
    expect(siteKeyInfo({ type: 1, name: "Netflix.com", login: { username: "me@gmail.com", uris: [] } }))
      .toEqual({ key: "gmail.com", source: "email" });
  });

  it("extracts host from first valid URI", () => {
    const item = { type: 1, name: "x", login: { uris: [{ uri: "https://google.com" }] } };
    expect(canonicalWebsiteKey(item)).toBe("google.com");
  });

  it("keeps the www. prefix as part of the host", () => {
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

  it("groups the three foo.com spellings and leaves www.foo.com out", () => {
    const groups = computeDuplicateGroups(uriVariations.items);
    const fooGroup = groups.find(g => g.site === "foo.com");
    expect(fooGroup).toBeDefined();
    expect(fooGroup.indices).toEqual([0, 1, 3]);
    expect(fooGroup.matchedBy).toBe("uri");
  });

  it("falls back to the email domain and then the entry name for entries without URIs", () => {
    const groups = computeDuplicateGroups(noUriFallback.items);
    expect(groups.map(g => [g.site, g.matchedBy])).toEqual([
      ["acme.io", "name"],
      ["mail.example", "email"]
    ]);
  });

  it("marks a group as matched by email when any entry only had its email domain", () => {
    const groups = computeDuplicateGroups([
      { id: "a", type: 1, name: "Forum", login: { username: "me@gmail.com", uris: [] } },
      { id: "b", type: 1, name: "Gmail", login: { username: "me@gmail.com", uris: [{ uri: "https://gmail.com" }] } }
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].matchedBy).toBe("email");
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
