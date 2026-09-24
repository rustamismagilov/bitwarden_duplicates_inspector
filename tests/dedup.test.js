import { describe, it, expect } from "vitest";
import {
  isIPv4,
  parseHostPort,
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
  it("turns unicode hosts into punycode and drops a trailing dot", () => {
    expect(parseHostPort("https://münchen.de/login")).toEqual({ host: "xn--mnchen-3ya.de", port: null });
    expect(parseHostPort("https://xn--mnchen-3ya.de")).toEqual({ host: "xn--mnchen-3ya.de", port: null });
    expect(parseHostPort("https://example.com./x")).toEqual({ host: "example.com", port: null });
  });
  it("leaves ip addresses exactly as written", () => {
    expect(parseHostPort("https://192.168.1.010")).toEqual({ host: "192.168.1.010", port: null });
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

describe("siteKeyInfo", () => {
  const siteKey = item => siteKeyInfo(item)?.key ?? null;

  it("returns null for non-login types, even when they carry login data", () => {
    const loginData = { username: "u@github.com", uris: [{ uri: "https://github.com" }] };
    expect(siteKey({ type: 2, name: "notes for github.com", login: loginData })).toBeNull();
    expect(siteKey({ type: 3, name: "card for github.com", login: loginData })).toBeNull();
  });

  it("prefers a web address over an app link", () => {
    const item = { type: 1, name: "x", login: { uris: [
      { uri: "androidapp://com.github.android" },
      { uri: "https://github.com/login" }
    ] } };
    expect(siteKeyInfo(item)).toMatchObject({ key: "github.com", source: "uri" });
  });

  it("uses an app link when the entry has no web address", () => {
    const item = { type: 1, name: "x", login: { uris: [{ uri: "androidapp://com.github.android" }] } };
    expect(siteKey(item)).toBe("com.github.android");
  });

  it("keeps the port for IPv6 hosts like it does for IPv4", () => {
    const item = { type: 1, name: "x", login: { uris: [{ uri: "https://[fe80::1]:5001" }] } };
    expect(siteKey(item)).toBe("[fe80::1]:5001");
  });

  it("ignores the port for domain names", () => {
    const item = { type: 1, name: "x", login: { uris: [{ uri: "https://example.com:8443" }] } };
    expect(siteKey(item)).toBe("example.com");
  });

  it("reports where the key came from", () => {
    expect(siteKeyInfo({ type: 1, name: "x", login: { username: "me@example.com", uris: [] } }))
      .toMatchObject({ key: "example.com", source: "email" });
    expect(siteKeyInfo({ type: 1, name: "Login at acme.io", login: { username: "bob", uris: [] } }))
      .toMatchObject({ key: "acme.io", source: "name" });
    // a handle is no email address, so the name decides
    expect(siteKeyInfo({ type: 1, name: "Instagram.com", login: { username: "@john.doe", uris: [] } }))
      .toMatchObject({ key: "instagram.com", source: "name" });
    // unicode in the name or the email domain becomes punycode like the urls
    expect(siteKeyInfo({ type: 1, name: "Bücher.de login", login: { username: "bob", uris: [] } }))
      .toMatchObject({ key: "xn--bcher-kva.de", source: "name" });
    expect(siteKeyInfo({ type: 1, name: "x", login: { username: "me@Bücher.de", uris: [] } }))
      .toMatchObject({ key: "xn--bcher-kva.de", source: "email" });
    // the email domain comes before a domain in the name
    expect(siteKeyInfo({ type: 1, name: "Netflix.com", login: { username: "me@gmail.com", uris: [] } }))
      .toMatchObject({ key: "gmail.com", source: "email" });
  });

  it("extracts host from first valid URI", () => {
    const item = { type: 1, name: "x", login: { uris: [{ uri: "https://google.com" }] } };
    expect(siteKey(item)).toBe("google.com");
  });

  it("keeps the www. prefix as part of the host", () => {
    const item = { type: 1, name: "x", login: { uris: [{ uri: "https://www.google.com" }] } };
    expect(siteKey(item)).toBe("www.google.com");
  });

  it("falls back to email domain when no URI", () => {
    const item = { type: 1, name: "x", login: { username: "me@example.com", uris: [] } };
    expect(siteKey(item)).toBe("example.com");
  });

  it("falls back to name-embedded domain when no URI and no email", () => {
    const item = { type: 1, name: "Login at acme.io", login: { username: "bob", uris: [] } };
    expect(siteKey(item)).toBe("acme.io");
  });

  it("preserves IPv4 host with port", () => {
    const item = { type: 1, name: "x", login: { uris: [{ uri: "https://10.0.0.5:8080" }] } };
    expect(siteKey(item)).toBe("10.0.0.5:8080");
  });

  it("returns null when no host is derivable", () => {
    const item = { type: 1, name: "Random", login: { username: "user", uris: [] } };
    expect(siteKey(item)).toBeNull();
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
    const lookalike = { type: 2, name: "github.com", login: { username: "u", uris: [{ uri: "https://github.com" }] } };
    expect(computeDuplicateGroups([lookalike, { ...lookalike }])).toEqual([]);
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

  it("groups the unicode and punycode spellings of one host and labels the group in unicode", () => {
    const at = (id, uri) => ({ id, type: 1, name: id, login: { username: "u", uris: [{ uri }] } });
    const groups = computeDuplicateGroups([at("a", "https://xn--mnchen-3ya.de/login"), at("b", "https://münchen.de")]);
    expect(groups.map(g => [g.site, g.siteLabel, g.indices])).toEqual([["xn--mnchen-3ya.de", "münchen.de", [0, 1]]]);
  });

  it("finds a unicode domain with combining marks or a punycode tld in an entry name", () => {
    const thai = "ตัวอย่าง.ไทย";
    const fromUri = siteKeyInfo({ type: 1, name: "x", login: { username: "u", uris: [{ uri: `https://${thai}` }] } });
    const fromName = siteKeyInfo({ type: 1, name: `login ${thai}`, login: { username: "u", uris: [] } });
    expect(fromName.key).toBe(fromUri.key);
    expect(fromName.label).toBe(thai);
    const nfd = "münchen.de";
    expect(siteKeyInfo({ type: 1, name: nfd, login: { username: "u", uris: [] } }).key).toBe("xn--mnchen-3ya.de");
    expect(siteKeyInfo({ type: 1, name: "shop.xn--p1ai", login: { username: "u", uris: [] } }).key).toBe("shop.xn--p1ai");
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

  it("sorts groups by site, then by username", () => {
    const pair = (site, user) => [1, 2].map(n => ({
      id: `${site}-${user}-${n}`, type: 1, name: site, creationDate: String(n), revisionDate: String(n),
      login: { username: user, uris: [{ uri: `https://${site}` }] }
    }));
    const items = [...pair("b.com", "zed"), ...pair("a.com", "zed"), ...pair("b.com", "Amy"), ...pair("a.com", "bob")];
    const groups = computeDuplicateGroups(items);
    expect(groups.map(g => `${g.site} ${g.usernameLower}`)).toEqual(["a.com bob", "a.com zed", "b.com amy", "b.com zed"]);
  });
});
