export function isIPv4(host) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
}

const SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//;

// the browser extension saves hosts in punycode, typed ones can be in unicode
// so both spellings of one host become the same key, and a trailing dot goes too
// plain ascii hosts are left alone, so ip addresses never get rewritten
function normalizeHost(host) {
  let h = host.toLowerCase().replace(/\.$/, "");
  if (/[^\x00-\x7f]/.test(h)) {
    try {
      h = new URL("http://" + h).hostname;
    } catch {
      // not a valid host name, keep it as it is
    }
  }
  return h;
}

// the host as written in a uri, lowercased and without a trailing dot, plus the port
function splitHostPort(uri) {
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
  if (v6) return { raw: v6[1], port: v6[2] || null, ipv6: true };

  const parts = hostPort.split(":");
  const raw = parts[0].replace(/\.$/, "");
  if (!raw.includes(".")) return null;
  return { raw, port: parts[1] || null, ipv6: false };
}

export function parseHostPort(uri) {
  const split = splitHostPort(uri);
  if (!split) return null;
  return { host: split.ipv6 ? split.raw : normalizeHost(split.raw), port: split.port };
}

// app links like androidapp:// only count when an entry has no web address
function isWebUri(uri) {
  const scheme = String(uri || "").trim().match(SCHEME);
  return !scheme || /^https?$/i.test(scheme[1]);
}

// a domain written in an entry name, letters in any script, marks included, or a punycode tld
const NAME_DOMAIN = /([\p{L}\p{M}\p{N}.-]+\.(?:xn--[a-z0-9-]+|[\p{L}\p{M}]{2,}))/iu;

// the site key for an entry, where it came from ("uri", "email" or "name"),
// and a label: the host as the entry writes it, which reads better than punycode
export function siteKeyInfo(item) {
  if (item.type !== 1) return null;
  const login = item.login || {};
  const usernameRaw = String(login.username || "").trim();
  let raw = null;
  let port = null;
  let source = null;

  const uris = (Array.isArray(login.uris) ? login.uris : []).map(u => u && u.uri);
  for (const uri of [...uris.filter(isWebUri), ...uris.filter(u => !isWebUri(u))]) {
    const split = splitHostPort(uri);
    if (split) {
      ({ raw, port } = split);
      source = "uri";
      break;
    }
  }

  // a handle like @john.doe has nothing before the @, so it is no email address
  if (!raw && usernameRaw.indexOf("@") > 0) {
    const emailDomain = usernameRaw.split("@")[1].toLowerCase().replace(/\.$/, "");
    if (emailDomain && emailDomain.includes(".")) {
      raw = emailDomain;
      source = "email";
    }
  }

  if (!raw) {
    const name = String(item.name || "").trim().normalize("NFC");
    const m = name.match(NAME_DOMAIN);
    if (m) {
      raw = m[1].toLowerCase();
      source = "name";
    }
  }

  if (!raw) return null;

  const host = raw.startsWith("[") ? raw : normalizeHost(raw);
  // ports only tell apart services on ip addresses, a domain keeps one key
  const isIp = isIPv4(host) || host.startsWith("[");
  const withPort = h => (isIp && port ? h + ":" + port : h);
  return { key: withPort(host), source, label: withPort(raw) };
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
        siteLabel: info.label,
        usernameLower,
        usernameRaw,
        indices: [],
        sources: new Set()
      });
    }
    const group = map.get(key);
    group.indices.push(idx);
    group.sources.add(info.source);
    // show the unicode spelling when any entry has one, punycode is hard to read
    if (group.siteLabel === group.site && info.label !== info.key) group.siteLabel = info.label;
  });

  const groups = Array.from(map.values())
    .filter(g => g.indices.length > 1)
    .map(({ sources, ...g }) => ({
      ...g,
      // a group is a strong match only when every entry has a uri for the site
      matchedBy: sources.has("name") ? "name" : sources.has("email") ? "email" : "uri"
    }));

  // site and username together are unique per group, so they fully decide the order
  groups.sort((a, b) => {
    if (a.siteLabel !== b.siteLabel) return a.siteLabel < b.siteLabel ? -1 : 1;
    if (a.site !== b.site) return a.site < b.site ? -1 : 1;
    return a.usernameLower < b.usernameLower ? -1 : a.usernameLower > b.usernameLower ? 1 : 0;
  });

  return groups;
}
