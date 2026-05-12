# Bitwarden Duplicates Inspector

**Bitwarden Duplicates Inspector** is a single-file HTML utility for cleaning, merging, and organizing your Bitwarden vault. It runs entirely in your web browser. **No data is ever sent to any server**, ensuring your passwords remain private and secure.

## Table of Contents

- [Features](https://www.google.com/search?q=%23features)
- [Prerequisites](https://www.google.com/search?q=%23prerequisites)
- [Getting Started](https://www.google.com/search?q=%23getting-started)
- [Usage](https://www.google.com/search?q=%23usage)
- [Privacy & Security](https://www.google.com/search?q=%23privacy--security)
- [Output](https://www.google.com/search?q=%23output)
- [Contributing](https://www.google.com/search?q=%23contributing)
- [License](https://www.google.com/search?q=%23license)

## Features

The **Bitwarden Duplicates Inspector** provides the following features to help you optimize your vault:

- **100% Local Execution:** The tool is a single HTML file containing all necessary logic. It works offline and never transmits data over the internet.

- **Smart Duplicate Detection:** Automatically groups entries that share the same website (host) and username.

- **Intelligent Merging:**
    - Consolidates unique URIs from multiple entries into one master entry.
    - Preserves the "oldest" entry (based on creation date) to maintain history.
    - Safely appends conflicting notes or passwords to the "Notes" field so no data is lost.

- **Visual Inspection:** Review every duplicate group in a clear, card-based layout before taking any action.

- **Search & Filter:** Quickly find specific accounts or sites using the built-in search bar.

- **Selective Actions:** choose to merge specific groups of entries, merge all groups at once, or delete/merge selected entries manually.

- **Dark Mode:** Automatically respects your system's theme preference, with a manual toggle button.

## Prerequisites

Before you begin, ensure you have:

- A modern web browser.
- A Bitwarden JSON export (Unencrypted).

## Getting Started

Since this is a client-side tool, there is no installation or Python requirement.

1. **Download** [`index.html` from the latest release](https://github.com/rustamismagilov/bitwarden_duplicates_inspector/releases/latest/download/index.html).
2. **Open** `index.html` in your web browser.
3. [**Export** you Bitwarden vault](https://bitwarden.com/help/export-your-data/).
4. Click on **Choose file** and select your unencrypted `.json` export.

That's it! The tool is ready to use.

## Quick Start

1. Click on the **Merge all entries in all groups** button.
2. Click on the **Download updated export** button.
3. [Import the new file into your Bitwarden vault](https://bitwarden.com/help/import-data/).

## Recommended Workflow
1.  Use **"Enable result previews"** to see how merges will look.
2.  Use **"Merge all entries in all groups"** as a starting point.
3.  Scroll through the list. If you see a group you don't want to merge, click **"Unmark merge"** or use the checkboxes to refine the selection.
4.  If you find junk entries, check them and click **"Mark selected for deletion"**.
5.  Click **"Download updated export"**.
6.  [Import the new file into your Bitwarden vault](https://bitwarden.com/help/import-data/).

> [!TIP] 
> It is recommended to ["Purge" your Bitwarden vault](https://bitwarden.com/help/product-faqs/#q-what-happens-when-i-purge-my-vault) before importing the cleaned file to avoid creating *new* duplicates alongside the old ones. **Always keep a backup of your original export!**

## Usage

The interface provides Global Controls (top bar) and Group Controls (inside each duplicate set).

### Global Controls
- **Select all entries in all groups:** Checks the selection box for every entry in the list.
- **Merge all entries in all groups:** Automatically marks **every** entry in **every** group to be merged.
    - ⤷ *If everything is already merged:* This button changes to **"Unmark all merges"** to undo the action.
- **Mark selected for deletion:** Marks all currently checked items for deletion (highlighted in red).
    - ⤷ *If selected items are already marked:* This button changes to **"Unmark selected for deletion"**.
- **Download updated export:** Generates and downloads the cleaned `.json` file.
- **Enable result previews:** A toggle that shows a preview row at the bottom of every group, visualizing exactly what the final merged entry will look like.

### Group Controls
Each duplicate group has its own set of buttons that change behavior based on your selection:

1.  **Selection Button** (Grey)
    * **Select all in group:** Checks all items in this specific group.
    * **Unselect all in group:** Appears if all items in the group are currently checked.

2.  **Merge Button** (Blue)
    * **Mark to merge entire group:** Default state (no selection). Merges all items in the group into one.
    * **Merge selected entries:** Appears when you select specific items. It allows you to merge a subset of duplicates (requires at least 2 items selected).
    * **Unmark merge:** Appears if the items are already marked for merging. Clicking this reverts them to their original state.

3.  **Delete Button** (Red)
    * **Mark group for deletion:** Default state (no selection). Marks every item in the group for deletion.
    > [!CAUTION]
    > Advises about risks or negative outcomes of certain actions.
    * **Mark selected for deletion:** Appears when you select specific items. Marks only those items for removal.
    * **Unmark selected for deletion:** Appears if the items you selected are already marked for deletion.

## Privacy & Security

* **Offline Capable:** You can disconnect your internet connection before loading your JSON file. The tool will function perfectly.
* **Zero-Knowledge:** No analytics, no tracking, and no external API calls.
* **Source Code:** The source is organized under [`src/`](src/) and bundled into a single self-contained `index.html` at build time. You can inspect the source files directly, or open the released `index.html` in any text editor to verify its safety.

## Output

The tool generates new JSON file **`bitwarden_merged.json`**. A complete vault export containing your merged/cleaned entries ready for import.

## Building from source

```sh
npm install
npm test       # run unit tests (Vitest)
npm run build  # produces dist/index.html
```

The build inlines all JavaScript and CSS into a single self-contained HTML file. Source modules live under `src/`; tests under `tests/`.

## Contributing

Contributions are welcome! If you have suggestions for better duplicate detection logic or UI improvements, please open an issue or submit a pull request.

## License

This project is licensed under the [MIT License](https://github.com/rustamismagilov/bitwarden_duplicates_inspector/blob/master/LICENSE).