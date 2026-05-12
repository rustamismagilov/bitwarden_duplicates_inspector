# Bitwarden Duplicates Inspector

Find and merge duplicate entries in your Bitwarden vault. Runs entirely in your browser. The JSON you load never leaves the page.

> [!NOTE]
> **Browser-only**, no installation required. Tested on Chrome, Firefox, and Edge. You need a .json (plaintext) export of your Bitwarden vault.

Since [Bitwarden has no built-in deduplication](https://community.bitwarden.com/t/duplicate-removal-tool-report-including-merge/648), I build this tool which runs as a single HTML file in your browser and the JSON you load is read locally.

## Quick start

1. Download [the latest release](https://github.com/rustamismagilov/bitwarden_duplicates_inspector/releases/latest/download/index.html).
2. Open it in your browser. No install, no network needed.
3. [Export your Bitwarden vault](https://bitwarden.com/help/export-your-data/) as **.json (plaintext)**.
4. Click **Choose file** and select exported .json vault.
5. Review the duplicate groups, mark what to merge or delete, click **Download updated export**.
6. [Import the merged file back into Bitwarden](https://bitwarden.com/help/import-data/). Keep your original export around as a backup until you manually verified.

> [!WARNING]
> Always keep your original export until you manually reviewed everything. Bitwarden's import is additive. If you re-import without first purging, you will end up with the old entries AND the merged ones. Either [purge the vault](https://bitwarden.com/help/product-faqs/#q-what-happens-when-i-purge-my-vault) first or manually delete the original entries.

## How it works

### Detection

Two entries are grouped as duplicates when they share both:

- the **canonical website key** (host extracted from a URI, falling back to email domain, falling back to a domain mentioned in the entry name), and
- the **username** (case-insensitive)

A few things worth knowing:

- `https://example.com`, `example.com`, and `http://example.com/login` all resolve to `example.com` and group together.
- `www.example.com` does NOT match `example.com`. They often have different login flows, so this is deliberate. If you want to merge them, do it manually with the group buttons.

> [!WARNING]
> Only login entries (type 1) are inspected. Secure notes, cards, and identities are passed through to the export untouched.

### Merging

When you mark a group for merge:

- The entry with the oldest **creation date** is kept (`creationDate`, falling back to `revisionDate`).
- All unique URIs from every entry in the group are collected onto the kept entry.
- If passwords differ, the extras are appended to the kept entry's notes as `Additional passwords seen in merged entries: ...`. **You never silently lose a password.**
- Notes from every entry are preserved.
- Favorite status is preserved if any source was favorited.

### Group controls

Each group has three buttons. They are selection-aware:

- With no checkboxes ticked, the buttons act on the entire group.
- With one or more checkboxes ticked, the buttons act only on those entries.

| Button | Default action | When entries are selected |
|---|---|---|
| Select all in group | tick every entry | untick every entry, if all are selected |
| Mark to merge entire group | mark every entry for merge | mark only selected (needs 2+ selected) |
| Mark group for deletion | mark every entry for delete | mark only selected for delete |

The global buttons at the top (`Select all entries in all groups`, `Merge all entries in all groups`, `Mark selected for deletion`) work the same way across all groups at once.

### Result preview

Toggle **Enable result previews** to see what each group will look like after the queued merges and deletions are applied. Groups with no actions queued show no preview, since the preview would just duplicate the main table.

## Known issues

- `www.example.com` and `example.com` form separate duplicate groups. The tool deliberately does not strip `www.` because the two often serve different login flows. If your vault has both, merge them manually with the group buttons.
- Bitwarden's import is additive. If you re-import without first purging, the old entries stay alongside the merged ones. Always purge first, or accept that you will need a second cleanup pass after import.

## Building from source

```sh
git clone https://github.com/rustamismagilov/bitwarden_duplicates_inspector.git
cd bitwarden_duplicates_inspector
npm install
npm run build
```

Source lives under `src/` (pure logic in `src/core/`, state in `src/state.js`, UI in `src/ui/`). The build inlines all JavaScript and CSS into a single self-contained HTML file. Each tagged release runs the same build in CI and attaches the artifact to the GitHub release.

## License

This project is licensed under the [MIT License](LICENSE).
