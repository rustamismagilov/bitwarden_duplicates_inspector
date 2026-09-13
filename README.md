# Bitwarden Duplicates Inspector

Find and merge duplicate entries in your Bitwarden vault. Runs entirely in your browser. The JSON you load never leaves the page.

> [!NOTE]
> **Browser-only**, no installation required. Tested on Chrome, Firefox, and Edge. You need a .json (plaintext) export of your Bitwarden vault.

Since [Bitwarden has no built-in deduplication](https://community.bitwarden.com/t/duplicate-removal-tool-report-including-merge/648), I built this tool. It is a single HTML file that you open in your browser, and the export you load is only read locally.

## Quick start

1. Download [the latest release](https://github.com/rustamismagilov/bitwarden_duplicates_inspector/releases/latest/download/index.html).
2. Open it in your browser. No install, no network needed.
3. [Export your Bitwarden vault](https://bitwarden.com/help/export-your-data/) as **.json (plaintext)**. Encrypted and password-protected exports are rejected.
4. Click **Choose file** and select your exported .json file.
5. Review the duplicate groups, mark what to merge or delete, and click **Download updated export**.
6. [Import the merged file back into Bitwarden](https://bitwarden.com/help/import-data/).
7. When everything checks out, delete both plaintext files: your original export and `bitwarden_merged.json`.

> [!WARNING]
> The downloaded file contains your **whole vault**, not only the entries you merged, and Bitwarden's import only adds. If you import it on top of the existing vault, every entry ends up there twice. Before importing, either [purge the vault](https://bitwarden.com/help/product-faqs/#q-what-happens-when-i-purge-my-vault) or delete all of its entries.
>
> Either way, the removed entries take their **file attachments** with them, and a .json export does not contain attachments, so the import cannot bring them back. Purging also empties the trash for good. If some entries have attachments, save those files first and upload them again after the import.
>
> Keep your original export until you have checked the imported vault.

## How it works

### Detection

Two login entries are grouped as duplicates when they share both:

- the **site**, and
- the **username** (case-insensitive). Entries without a username are never grouped.

The site comes from the first entry URL that has a host. Web addresses are preferred over app links like `androidapp://`. If an entry has no usable URL, the site falls back to the domain of an email username, and then to a domain written in the entry name.

A few things worth knowing:

- `https://example.com`, `example.com`, `http://example.com/login` and `https://example.com/?ref=1` all count as `example.com`.
- Ports only matter for IP addresses. `https://192.168.1.10:8080` and `https://192.168.1.10:9090` are different sites, `https://example.com:8443` is still `example.com`.
- `www.example.com` does NOT match `example.com`, since the two sometimes have separate accounts. See [known issues](#known-issues).
- Groups found through the email domain or the entry name are tagged **matched by email domain** or **matched by entry name**. These are guesses. Two unrelated accounts that both use `me@gmail.com` and have no URL end up in one `gmail.com` group, so check them before merging.

> [!NOTE]
> Only login entries are compared. Secure notes, cards and identities are copied to the export unchanged.

### Merging

When two or more entries of a group are marked for merge, they become one entry:

- The entry with the oldest **creation date** is kept (`creationDate`, falling back to `revisionDate`). The table tags it **kept in merge**.
- Its password stays active. If it has no password, the password of the oldest entry that has one is used.
- Every other password is written to the kept entry's notes under `Additional passwords seen in merged entries:`, one per line.
- TOTP secrets and custom fields from the other entries are added to the kept entry. A login holds a single TOTP secret, so when entries have different secrets the others go to notes under `Additional TOTP secrets seen in merged entries:`.
- Bitwarden only uses one passkey per login. The kept entry keeps its passkeys, or takes those of the oldest entry that has any. Any other passkey is dropped and listed in notes by site, user name and date, without its key, so you know to register it again.
- Password history from all entries is combined, newest first. Bitwarden keeps only the 5 newest entries on import, so anything older goes to notes.
- All URLs are collected onto the kept entry with their match settings.
- Notes from every entry are kept, without repeating identical ones.
- The entry is a favorite if any of the merged entries was, and asks for the master password again if any of them did.
- It stays in the kept entry's folder. If the kept entry has no folder, it goes into the folder of the oldest entry that has one.
- It is only archived if every merged entry was archived.
- In an organization export, it belongs to every collection that any of the merged entries was in.

Nothing else in the export changes. Entries you did not touch are written exactly as they were, in their original order, and the folder list stays as it is.

Before the download, the tool checks whether a merged entry has grown past what Bitwarden accepts, for example notes over its length limit. Bitwarden rejects the whole import in that case, so you get a warning listing those entries first.

### Group tags

Some groups carry a tag that asks you to look before merging. **Merge all untagged groups** leaves these groups out, so you merge them one by one:

- **matched by email domain** or **matched by entry name**: see [Detection](#detection).
- **different passkeys**: the entries hold different passkeys, and a merge keeps only one entry's.
- **different collections**: the entries sit in different collections of an organization, and everyone in any of those collections will see everything merged in.

### Group controls

Each group has three buttons.

**Select all in group** ticks every entry of the group. When every entry is already ticked, it unticks them all.

The merge and delete buttons act on the whole group when nothing is ticked, and only on the ticked entries otherwise. Their label tells you which:

| Nothing ticked | Entries ticked | What it does |
|---|---|---|
| Mark to merge entire group | Merge selected entries | marks the entries for merge. A merge needs at least two entries, counting the ones already marked in that group |
| Mark group for deletion | Mark selected for deletion | marks the entries for deletion |

Once entries are marked, the labels change to **Unmark group merge**, **Unmark selected from merge**, **Unmark group for deletion** or **Unmark selected for deletion**. Marking an entry for merge clears its deletion mark, and the other way round.

### Top controls

- **Filter** narrows the list by site, username, entry name or URL.
- **Select all entries in all groups** ticks every entry in the groups you can see.
- **Merge all untagged groups** marks every visible group for merge, except the ones with a [tag](#group-tags).
- **Mark selected for deletion** marks the ticked entries in the visible groups.
- **Enable result previews** shows what each group turns into once the queued merges and deletions are applied. The preview uses the same code as the download.
- The sun and moon button switches between light and dark. Until you use it, the page follows your system theme.

If you try to load another file or close the tab while there are merges or deletions you have not downloaded yet, the page asks first.

## Known issues

- `www.example.com` and `example.com` count as different sites, so a pair with one entry on each does not show up as a group. Change one of the URLs in Bitwarden before exporting, or merge those by hand in Bitwarden.
- Re-importing loses file attachments of the entries you remove, see the warning in [Quick start](#quick-start).

## Building from source

You need Node.js 22.12 or newer.

```sh
git clone https://github.com/rustamismagilov/bitwarden_duplicates_inspector.git
cd bitwarden_duplicates_inspector
npm install
npm test
npm run build
```

The build writes a single self-contained `dist/index.html` with all JavaScript and CSS inlined. `npm run dev` rebuilds it whenever something under `src/` changes.

Source lives under `src/`: pure logic in `src/core/`, state in `src/state.js`, and the UI in `src/ui/`. The page template is `src/template.html`.

To release, bump the version with `npm version patch` (or `minor`), then push the commit and the tag. The release workflow checks that the tag matches `package.json`, runs the tests, builds the page and attaches it to a GitHub release.

## License

This project is licensed under the [MIT License](LICENSE).
