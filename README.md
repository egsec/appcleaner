# AppCleaner for Linux

> Find and remove the leftover files that uninstalled applications leave behind.

[🇹🇷 Türkçe README](README.tr.md)

When you uninstall an application on Linux, its package files are removed — but its
configuration, caches, and data usually stay behind in your home directory.
AppCleaner scans the well-known locations, matches them against your installed
(or recently removed) applications with fuzzy name matching, and lets you review
and delete the leftovers safely.

Built with **Tauri v2** (Rust backend) + **React** + **TypeScript** + **Tailwind CSS v4**.

<!-- TODO: add a screenshot: docs/screenshot.png -->

## Features

- **Application discovery** from `.desktop` entries in system, user, and Flatpak
  export directories — extracts name, executable, and icon
- **Leftover scanning** across the places apps actually leave residue:

  | Category | Location |
  | --- | --- |
  | Configuration | `~/.config` |
  | Cache | `~/.cache` |
  | Data | `~/.local/share` |
  | State | `~/.local/state` |
  | Flatpak app data | `~/.var/app` |
  | systemd user units | `~/.config/systemd/user`, `~/.local/share/systemd/user` |
  | Autostart entries | `~/.config/autostart` |

- **Fuzzy matching with a confidence score.** Package names rarely match
  directory names exactly (`org.gnome.Builder` vs `gnome-builder` vs
  `~/.cache/gnome-builder`). AppCleaner normalizes names and combines exact,
  containment, and Jaro-Winkler similarity into a per-item confidence score
  shown as a percentage — you always see *why* something matched.
- **Full detail per finding:** path, size (recursive for directories), and last
  modified date.
- **Explicit, reviewable deletion:** select items with checkboxes, review a
  summary dialog, and confirm past an "this cannot be undone" warning.
- **Dry-run mode, enabled by default.** The first run only reports what *would*
  be deleted. You must deliberately switch dry-run off to delete anything.

## Safety design

Deleting the wrong dotfile can ruin your day, so the deleter is deliberately
paranoid:

- Deletion is only permitted for paths **strictly inside** the scanned root
  directories — never the roots themselves, never anything outside them.
- Paths containing `..` or `.` components are rejected outright.
- Symbolic links are never followed when sizing or deleting.
- Dry-run is the default; real deletion requires an explicit toggle **and** a
  confirmation dialog.
- Every match displays its confidence score and what it matched on, so you can
  judge low-confidence matches before touching them.

## Building from source

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 20 and npm
- [Rust](https://rustup.rs/) (stable)
- Linux: the usual [Tauri v2 system dependencies](https://v2.tauri.app/start/prerequisites/#linux):

  ```sh
  # Debian / Ubuntu
  sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
    libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
  ```

### Build & run

```sh
npm install
node scripts/make-icons.mjs   # generate app icons (once)
npm run tauri dev             # run in development mode
npm run tauri build           # produce a release bundle
```

### Tests

```sh
npm run build                 # type-check + frontend build
cd src-tauri
cargo test                    # unit tests + end-to-end flow test
```

The integration test in [`src-tauri/tests/flow.rs`](src-tauri/tests/flow.rs)
exercises the whole pipeline headlessly: scan → match → dry-run (asserts
nothing was deleted) → real delete → rejection of out-of-root paths.

## Trying it without touching your real home directory

AppCleaner supports sandboxed manual testing on **any** platform (including
Windows/macOS for development) via two environment variables:

| Variable | Purpose |
| --- | --- |
| `APPCLEANER_HOME` | Overrides the home directory used for scanning/deleting |
| `APPCLEANER_APP_DIRS` | Overrides the `.desktop` directories (PATH-separator list) |

```sh
node scripts/make-fixture.mjs   # creates ./fixture with a fake home + .desktop files
# export the two variables printed by the script, then:
npm run tauri dev
```

The fixture includes realistic leftovers for VLC, GNOME Builder, Spotify
(Flatpak), and Firefox — including deliberately inexact names like
`spotifyd.service` so you can see fuzzy scoring in action.

## Project structure

```
src/                    React frontend (UI currently in Turkish)
src-tauri/src/
  desktop.rs            .desktop discovery & Exec parsing (env/flatpak aware)
  leftovers.rs          leftover scanning, fuzzy matching, confidence scoring
  deleter.rs            dry-run aware deletion with path-safety guards
src-tauri/tests/flow.rs end-to-end flow test
scripts/                icon & test-fixture generators (no external deps)
```

## Limitations

- Scanning is one level deep inside each root; vendor-nested paths such as
  `~/.config/Vendor/App` may be missed.
- Matching is heuristic. High confidence is not certainty — review before
  deleting, and keep dry-run on until you trust the results.
- The UI language is currently Turkish; contributions adding i18n are welcome.

## License

Released under the [MIT License](LICENSE).
