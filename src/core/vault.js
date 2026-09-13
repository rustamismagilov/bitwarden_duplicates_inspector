// turns the text of an export file into vault data, or throws a message meant for the user
export function parseVaultExport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    // the parser message can quote the start of the file, so keep it out of the ui
    throw new Error("That file is not valid JSON.");
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("That file does not look like a Bitwarden export.");
  }
  if (data.passwordProtected === true) {
    throw new Error("This export is password protected. Export your vault again as .json (plaintext).");
  }
  // bitwarden treats a missing encrypted flag as plaintext, so also look for the encrypted-only keys
  if (data.encrypted === true || "encKeyValidation_DO_NOT_EDIT" in data || "data" in data) {
    throw new Error("This export is encrypted. Export your vault again as .json (plaintext).");
  }
  if (!Array.isArray(data.items)) {
    throw new Error("That file does not look like a Bitwarden export.");
  }
  const bad = data.items.findIndex(it => !it || typeof it !== "object" || Array.isArray(it));
  if (bad !== -1) {
    throw new Error(`Entry ${bad + 1} in this export is not a valid item.`);
  }

  return data;
}
