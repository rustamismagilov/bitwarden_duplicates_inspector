import { describe, it, expect } from "vitest";
import { parseVaultExport } from "../src/core/vault.js";

import bitwardenSample from "./fixtures/bitwarden-sample.json" with { type: "json" };

describe("parseVaultExport", () => {
  it("accepts a plaintext Bitwarden export", () => {
    expect(parseVaultExport(JSON.stringify(bitwardenSample))).toEqual(bitwardenSample);
  });

  it("rejects text that is not JSON without echoing the file", () => {
    expect(() => parseVaultExport("masterpassword: hunter2")).toThrow("That file is not valid JSON.");
  });

  it("rejects JSON that is not an export", () => {
    expect(() => parseVaultExport("[]")).toThrow(/does not look like a Bitwarden export/);
    expect(() => parseVaultExport("null")).toThrow(/does not look like a Bitwarden export/);
    expect(() => parseVaultExport('{"folders": []}')).toThrow(/does not look like a Bitwarden export/);
  });

  it("rejects an account encrypted export", () => {
    const text = JSON.stringify({
      encrypted: true,
      encKeyValidation_DO_NOT_EDIT: "2.abc|def|ghi",
      folders: [],
      items: [{ id: "a", type: 1, name: "2.xyz|uvw|rst", login: { username: "2.aaa|bbb|ccc" } }]
    });
    expect(() => parseVaultExport(text)).toThrow(/export is encrypted/);
  });

  it("rejects an encrypted export even when the encrypted flag was removed", () => {
    const text = JSON.stringify({
      encKeyValidation_DO_NOT_EDIT: "2.abc|def|ghi",
      folders: [],
      items: [{ id: "a", type: 1, name: "2.xyz|uvw|rst" }]
    });
    expect(() => parseVaultExport(text)).toThrow(/export is encrypted/);
  });

  it("rejects a password protected export", () => {
    const text = JSON.stringify({
      encrypted: true, passwordProtected: true, salt: "s", kdfType: 0, kdfIterations: 600000,
      encKeyValidation_DO_NOT_EDIT: "2.abc|def|ghi", data: "2.abc|def|ghi"
    });
    expect(() => parseVaultExport(text)).toThrow(/password protected/);
  });

  it("rejects an export with a broken entry instead of crashing later", () => {
    expect(() => parseVaultExport('{"encrypted": false, "items": [{"id": "a", "type": 1}, null]}'))
      .toThrow("Entry 2 in this export is not a valid item.");
  });
});
