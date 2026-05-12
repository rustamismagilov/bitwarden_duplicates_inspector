export function isIPv4(host) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
}

export function parseHostPort(uri) {
  uri = String(uri || "").trim();
  if (!uri) return null;
  let rest = uri.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "");
  if (!rest) return null;
  let hostPort = rest.split("/")[0];
  hostPort = hostPort.split("@").slice(-1)[0].toLowerCase();
  if (!hostPort) return null;
  const parts = hostPort.split(":");
  const host = parts[0];
  const port = parts[1] || null;
  if (!host.includes(".") && !isIPv4(host)) return null;
  return { host, port };
}

export function canonicalWebsiteKey(item) {
  if (item.type !== 1) return null;
  const login = item.login || {};
  const usernameRaw = String(login.username || "").trim();
  let host = null;
  let port = null;

  const uris = Array.isArray(login.uris) ? login.uris : [];
  for (const u of uris) {
    const parsed = parseHostPort(u && u.uri);
    if (parsed && parsed.host) {
      host = parsed.host;
      port = parsed.port;
      break;
    }
  }

  if (!host && usernameRaw.includes("@")) {
    const emailDomain = usernameRaw.split("@", 2)[1].toLowerCase();
    if (emailDomain && emailDomain.includes(".")) {
      host = emailDomain;
      port = null;
    }
  }

  if (!host) {
    const name = String(item.name || "").trim();
    const m = name.match(/([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (m) host = m[1].toLowerCase();
  }

  if (!host) return null;

  if (isIPv4(host)) {
    return port ? host + ":" + port : host;
  } else {
    return host;
  }
}

export function computeDuplicateGroups(items) {
  const map = new Map();
  items.forEach((item, idx) => {
    const siteKey = canonicalWebsiteKey(item);
    if (!siteKey) return;
    const login = item.login || {};
    const usernameRaw = String(login.username || "").trim();
    if (!usernameRaw) return;
    const usernameLower = usernameRaw.toLowerCase();
    const key = siteKey + "|||" + usernameLower;
    if (!map.has(key)) {
      map.set(key, {
        site: siteKey,
        usernameLower,
        usernameRaw,
        indices: []
      });
    }
    map.get(key).indices.push(idx);
  });

  const groups = Array.from(map.values()).filter(g => g.indices.length > 1);

  groups.sort((a, b) => {
    if (a.site !== b.site) return a.site < b.site ? -1 : 1;
    if (a.usernameLower !== b.usernameLower) return a.usernameLower < b.usernameLower ? -1 : 1;
    return b.indices.length - a.indices.length;
  });

  return groups;
}
