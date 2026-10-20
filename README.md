<div align="center">
  <img src="./skillsage-logo.png" alt="SkillSage logo" width="120" />
  <h1>SkillSage</h1>
  <p>A desktop skill manager for AI coding agents on Windows and macOS</p>

  <p>
    <b>English</b> ·
    <a href="./README.zh-CN.md">简体中文</a>
  </p>

  <p>
    <a href="https://github.com/aeroray/SkillSage/releases"><img src="https://img.shields.io/github/v/release/aeroray/SkillSage?sort=semver" alt="Latest release" /></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" /></a>
    <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-lightgrey.svg" alt="Platforms: Windows and macOS" />
  </p>

  <p>
    <a href="#features">Features</a> ·
    <a href="#install">Install</a> ·
    <a href="#quick-start">Quick start</a> ·
    <a href="#where-your-data-lives">Data</a> ·
    <a href="#development">Development</a> ·
    <a href="#license">License</a>
  </p>
</div>

SkillSage installs AI agent skills into the shared `~/.agents/skills/` directory that
modern coding agents already read, and keeps the source repository, commit, and content
hash of every installed skill. Tools that do not read that directory get a managed link
instead of a second copy. It is built for developers who install, update, and audit skills
across several agents without maintaining a separate copy for each one.

> [!NOTE]
> SkillSage is a desktop application. Its window opens at `1200×800` and will not shrink
> below that; it can be maximized. There is no mobile layout.

## Features

- **Installed skills** — list, update, uninstall, and run update checks on any selection.
- **Skill store** — search skills.sh, read a skill's details, and install it from the store
  or from a GitHub URL.
- **Local import** — import a `SKILL.md` file, a skill directory, or a parent directory that
  contains exactly one skill directory.
- **Online matching for local skills** — for a `local://` skill, search skills.sh for
  name-compatible candidates and verify them against the local directory hash. A candidate
  whose content matches exactly is recommended first. Confirming only records the remote
  source; local files are not replaced, and future updates become available.
- **One shared directory** — every skill is installed once, into `~/.agents/skills/`. Agents
  that already read that directory pick it up with no extra step.
- **Per-tool distribution** — agents that only read their own directory (Claude Code,
  CodeBuddy/WorkBuddy, Codex, Cline, and others) receive a link in their own skills
  directory. The built-in registry covers 27 agents, detects which are installed, and lets
  you override the "reads the shared directory" flag per agent in Settings.
- **Adopt existing skills** — scan the shared directory for real, untracked skill folders,
  adopt them in place once the folder name agrees with `SKILL.md`, and repair name
  mismatches or remove invalid entries explicitly.
- **Settings and sync** — configure a proxy, store a GitHub token in the OS keyring, and
  export or import remote skill records plus non-secret preferences.
- **Diagnosable by default** — consistent loading and error states, with plain and
  structured logs written to the platform's app log directory.

## Install

Stable builds are published on [GitHub Releases](https://github.com/aeroray/SkillSage/releases):

- **Windows** — NSIS installer with Simplified Chinese and English UI.
- **macOS (Apple Silicon)** — DMG installer.

SkillSage checks for updates once asynchronously at startup, and again only when you ask.
When a new version is found you can install it from the sidebar or from Settings.

The macOS build is not signed or notarized with an Apple Developer certificate — this is a
certificate-free open-source release. On first launch, macOS may require right-clicking the
app and choosing **Open**, or running:

```bash
xattr -rd com.apple.quarantine /Applications/SkillSage.app
```

That only removes the quarantine flag on your machine; it does not attest the app's origin
and is not a substitute for Apple signing. In-app update packages are still protected by
Tauri's own signing key.

### Update sources and mirrors

GitHub release downloads are frequently unreachable or very slow from mainland China, so an
update check **races every mirror plus direct GitHub concurrently** and takes the first one
that returns a valid manifest:

| Source | Notes |
| --- | --- |
| `gh.catmak.name` | Fastest in practice |
| `cdn.akaere.online` | |
| `fastgit.cc` | |
| `githubdog.com` | |
| `github.geekery.cn` | |
| GitHub (direct) | Raced alongside the mirrors, so users elsewhere are not penalised |

The list lives in `MIRRORS` in `src-tauri/src/core/mirrors.rs` and can be edited freely.
Racing rather than pinning one node matters because these are volunteer-run and disappear
without notice — pinning one would eventually break for everyone at once.

The installer is fetched through the winning node too. Because the nodes proxy the manifest
but leave the asset URL pointing at `api.github.com` (which most of them then reject), the
download URL is rewritten to the node's `releases/download/<tag>/<file>` form; if that
rewrite fails, the original URL is kept rather than failing the update.

**Security.** Mirrors only carry the bytes. The installer is still verified against the
minisign public key in the Tauri config, so a tampered mirror produces a signature failure,
not an install. The downloaded package's length is additionally cross-checked against the
GitHub release metadata for the announced version, so a mirror cannot replay an older
signed build under a newer version label.

Maintainers can exercise the real nodes with
`cargo test --test mirrors_live -- --ignored --nocapture` (needs network; not run by default).

## Quick start

### Run from source

You need Node.js 22+, pnpm, a stable Rust toolchain, and the
[Tauri 2 prerequisites](https://tauri.app/start/prerequisites/) for your platform.

```bash
pnpm install
pnpm exec tauri dev
```

`pnpm dev` starts only the Vite browser preview (a UI shell with fixture data); use
`pnpm exec tauri dev` for the real desktop app.

### Build the desktop app

```bash
pnpm exec tauri build
```

To verify the build without producing installers:

```bash
pnpm exec tauri build --debug --no-bundle
```

### Application version

`version` in [`package.json`](./package.json) is the single source of truth. Tauri reads it
directly, and the Cargo version is synchronized from it:

```bash
pnpm sync:version
```

`pnpm build` runs that synchronization automatically. A release tag must match
`package.json` — for version `1.0.0`, push `v1.0.0`.

### Logo

[`skillsage-logo.png`](./skillsage-logo.png) in the repository root is the only logo source.
After replacing it, run:

```bash
pnpm sync:branding
```

That regenerates the frontend asset, the favicon, and the Windows/macOS icon sets, and
removes the mobile derivatives this desktop-only product does not use.

## Where your data lives

Skill content and SkillSage's own bookkeeping are kept separate:

| Data | Location |
| --- | --- |
| Shared skills directory | `~/.agents/skills/` |
| Per-agent links | Each agent's own skills directory |
| Skill lock file | `~/.skillsage/lock/skill-lock.json` |
| Update temp files | `~/.skillsage/tmp/` |
| Sync packages | Wherever you export them |
| Proxy setting | `~/.skillsage/settings.json` |

Skill content is written directly into the shared directory. Agents that read it need
nothing else; every other agent gets a directory link in its own skills directory — content
is never copied.

| Agent | Skills directory | Reads shared directory |
| --- | --- | --- |
| Claude Code | `~/.claude/skills` | No |
| CodeBuddy / WorkBuddy | `~/.codebuddy/skills` | No |
| OpenAI Codex CLI | `~/.codex/skills` | No |
| Cline | `~/.cline/skills` | No |
| Cursor | `~/.cursor/skills` | Yes |
| GitHub Copilot | `~/.copilot/skills` | Yes |
| OpenCode | `~/.config/opencode/skills` | Yes |
| Gemini CLI | `~/.gemini/skills` | Yes |
| Amp | `~/.config/amp/skills` | Yes |

The full registry of 27 agents is in `src-tauri/src/core/tools.rs`. Every entry carries its
skills directory, whether it reads the shared directory, the documentation URL the entry
came from, and whether that source is vendor documentation. **The "reads shared directory"
flag is editable per agent in Settings**: when an agent gains shared-directory support,
enabling the flag stops SkillSage from distributing into it and removes any links it created.

- Distribution uses a directory junction on Windows and a symlink on macOS. Undistributing or
  uninstalling removes only links SkillSage can prove it created.
- Only agents **detected on this machine** appear in a skill's distribution menu. Settings
  lists the full registry, so an undetected agent can still be pointed at a directory by hand.
- Sync packages contain remote skill records and non-secret preferences. The GitHub token is
  held in Windows Credential Manager or the macOS Keychain and never enters the sync file,
  the settings file, or the logs.
- Remote skills record the current Git commit and a content hash, used for update checks and
  for restoring the same content on another device. Version history and local snapshots are
  deliberately not maintained.
- Removing the application does not touch the shared directory. To delete a skill, uninstall
  it from **Installed skills**.

## Development

### Stack

- **Desktop shell** — Tauri 2
- **Frontend** — React 19, TypeScript, Vite 8, Tailwind CSS 4
- **UI** — source-owned shadcn-style Radix primitives, Lucide icons, Zustand
- **Backend** — Rust 2021, Tokio, Reqwest, Scraper, Serde, Keyring
- **Network and parsing** — skills.sh public pages, GitHub contents/tree APIs, HTML detail parsing

### Layout

```text
src/
├── app/             # app shell, navigation, routing
├── components/      # shared components and shadcn/Radix primitives
├── features/        # domain adapters: skills, store, import, sync, adopt, settings
└── pages/           # installed skills, store, adopt, settings, import dialogs

src-tauri/src/
├── commands/        # Tauri IPC commands
├── core/            # Tauri-independent skill lifecycle and domain logic
├── state/           # app state and the async write lock
├── lib.rs           # Tauri app and command registration
└── main.rs          # thin entry point

docs/
├── DESIGN.md        # design system (tokens, layout, components)
├── guides/          # cross-platform QA and pre-release checks
├── releases/        # release notes, one file per tag
└── memory/          # long-lived project constraints and decisions
```

Filesystem writes — install, update, uninstall, adopt, sync — are owned by Rust. The
frontend reaches them through Tauri commands. Do not implement skill install, adopt, or
uninstall in the frontend or in scripts, and do not shell out to `npx skills`.

### Checks

```bash
pnpm build
pnpm lint
pnpm test
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --all-targets
```

Dependency auditing needs `cargo-audit`:

```bash
cargo install cargo-audit
cargo audit --manifest-path src-tauri/Cargo.toml
```

Formatting is not currently enforced with `cargo fmt --check`; the tree is not
rustfmt-clean at this revision, so adding it would mean a repository-wide reformat.

### Frontend conventions

- Use Tailwind CSS v4 and the existing CSS-first theme tokens.
- Prefer the shadcn/Radix primitives in `src/components/ui/` for controls and overlays.
- Scrollable content uses the shared `ScrollArea`; do not reintroduce page-level native
  scroll containers.
- Keep the desktop information density. Do not add mobile layout requirements.

### Releasing

The workflow is [`release.yml`](./.github/workflows/release.yml). Pushing a SemVer tag
starting with `v` (for example `v1.0.0`) makes GitHub Actions:

- build the Windows NSIS installer, with Simplified Chinese and English UI;
- build the Apple Silicon macOS DMG together with the signed artifacts in-app updates need;
- create the GitHub Release and upload `latest.json`, so Windows and macOS clients can check
  for and install updates.

Release notes are authored at `docs/releases/<tag>.md`. The workflow reads that file and
fails if it is missing or empty, so notes are never silently carried over from a previous
release.

Configure `TAURI_SIGNING_PRIVATE_KEY` in the repository's Actions secrets. Generate a key
pair with the Tauri signer and copy only the private key into the secret — never commit it.
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is needed only if the key has a password. The matching
public key is already in the Tauri config.

## Documentation

- [Cross-platform QA guide](./docs/guides/cross-platform-qa.md)
- [Design system](./docs/DESIGN.md)
- [Release notes](./docs/releases)

The desktop app covers the store, GitHub and local import, skill updates, settings, sync,
skill adoption, and conflict handling on top of a single shared-directory model. Historical
specifications and design drafts were removed so the code and the docs cannot drift into two
standards.

## License

[MIT](./LICENSE) © SkillSage contributors
