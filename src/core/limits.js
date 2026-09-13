// bitwarden refuses the whole import when a single field is too long once encrypted
// the limits count characters of the encrypted string, not of the text
const LIMITS = {
  name: 1000,
  notes: 10000,
  username: 1000,
  password: 5000,
  totp: 1000,
  uri: 10000,
  fieldValue: 5000,
};

function base64Length(bytes) {
  return 4 * Math.ceil(bytes / 3);
}

// an encrypted string looks like "2.<iv>|<data>|<mac>", all base64
// aes-cbc pads the data to the next full 16 byte block
export function encryptedLength(text) {
  const bytes = new TextEncoder().encode(String(text)).length;
  const dataBytes = 16 * (Math.floor(bytes / 16) + 1);
  return "2.".length + base64Length(16) + 1 + base64Length(dataBytes) + 1 + base64Length(32);
}

function tooLong(value, limit) {
  return typeof value === "string" && value !== "" && encryptedLength(value) > limit;
}

// entries with a field bitwarden would reject, as { name, field } pairs
export function findOversizedFields(items) {
  const problems = [];
  for (const it of items) {
    const name = it.name || "(no name)";
    const add = field => problems.push({ name, field });
    if (tooLong(it.name, LIMITS.name)) add("Name");
    if (tooLong(it.notes, LIMITS.notes)) add("Notes");
    const login = it.login || {};
    if (tooLong(login.username, LIMITS.username)) add("Username");
    if (tooLong(login.password, LIMITS.password)) add("Password");
    if (tooLong(login.totp, LIMITS.totp)) add("TOTP");
    if ((Array.isArray(login.uris) ? login.uris : []).some(u => tooLong(u?.uri, LIMITS.uri))) add("URI");
    if ((Array.isArray(it.fields) ? it.fields : []).some(f => tooLong(f?.value, LIMITS.fieldValue))) add("Custom field");
  }
  return problems;
}
