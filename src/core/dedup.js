export function isIPv4(host) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
}

const SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//;

export function parseHostPort(uri) {
  uri = String(uri || "").trim();
  if (!uri) return null;
  const rest = uri.replace(SCHEME, "");
  if (!rest) return null;

  // the host ends at the first slash, question mark or hash
  let hostPort = rest.split(/[/?#]/)[0];
  hostPort = hostPort.split("@").slice(-1)[0].toLowerCase();
  if (!hostPort) return null;

  // ipv6 addresses keep their colons inside brackets
  const v6 = hostPort.match(/^(\[[0-9a-f:.]+\])(?::(\d*))?$/);
  if (v6) return { host: v6[1], port: v6[2] || null };

  const parts = hostPort.split(":");
  const host = parts[0];
  const port = parts[1] || null;
  if (!host.includes(".")) return null;
  return { host, port };
}

// app links like androidapp:// only count when an entry has no web address
function isWebUri(uri) {
  const scheme = String(uri || "").trim().match(SCHEME);
  return !scheme || /^https?$/i.test(scheme[1]);
}

// the site key for an entry and where it came from: "uri", "email" or "name"
export function siteKeyInfo(item) {
  if (item.type !== 1) return null;
  const login = item.login || {};
  const usernameRaw = String(login.username || "").trim();
  let host = null;
  let port = null;
  let source = null;

  const uris = (Array.isArray(login.uris) ? login.uris : []).map(u => u && u.uri);
  for (const uri of [...uris.filter(isWebUri), ...uris.filter(u => !isWebUri(u))]) {
    const parsed = parseHostPort(uri);
    if (parsed) {
      ({ host, port } = parsed);
      source = "uri";
      break;
    }
  }

  if (!host && usernameRaw.includes("@")) {
    const emailDomain = usernameRaw.split("@", 2)[1].toLowerCase();
    if (emailDomain && emailDomain.includes(".")) {
      host = emailDomain;
      source = "email";
    }
  }

  if (!host) {
    const name = String(item.name || "").trim();
    const m = name.match(/([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (m) {
      host = m[1].toLowerCase();
      source = "name";
    }
  }

  if (!host) return null;

  // ports only tell apart services on ip addresses, a domain keeps one key
  const isIp = isIPv4(host) || host.startsWith("[");
  return { key: isIp && port ? host + ":" + port : host, source };
}

export function canonicalWebsiteKey(item) {
  const info = siteKeyInfo(item);
  return info ? info.key : null;
}

export function computeDuplicateGroups(items) {
  const map = new Map();
  items.forEach((item, idx) => {
    const info = siteKeyInfo(item);
    if (!info) return;
    const login = item.login || {};
    const usernameRaw = String(login.username || "").trim();
    if (!usernameRaw) return;
    const usernameLower = usernameRaw.toLowerCase();
    const key = info.key + "|||" + usernameLower;
    if (!map.has(key)) {
      map.set(key, {
        site: info.key,
        usernameLower,
        usernameRaw,
        indices: [],
        sources: new Set()
      });
    }
    const group = map.get(key);
    group.indices.push(idx);
    group.sources.add(info.source);
  });

  const groups = Array.from(map.values())
    .filter(g => g.indices.length > 1)
    .map(({ sources, ...g }) => ({
      ...g,
      // a group is a strong match only when every entry has a uri for the site
      matchedBy: sources.has("name") ? "name" : sources.has("email") ? "email" : "uri"
    }));

  groups.sort((a, b) => {
    if (a.site !== b.site) return a.site < b.site ? -1 : 1;
    if (a.usernameLower !== b.usernameLower) return a.usernameLower < b.usernameLower ? -1 : 1;
    return b.indices.length - a.indices.length;
  });

  return groups;
}
