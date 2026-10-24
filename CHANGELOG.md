# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — 2026-10-24

Adds a sidebar panel. The plugin could already steer command routing, but what
it had decided was invisible in the UI — you had to open `cordis.patch.yml` or
read the system prompt to know which executor it was naming. Now there is a
rail entry beside the shipped ones.

### Added

- **A sidebar panel (`WSL first`).** One entry in the left rail; it opens a
  read-only panel showing the routing in force: the preferred executor, the
  fallbacks (`alternatives` minus any duplicate of the preferred), what is
  discouraged, and whether the section is publishing together with its `order`.
- **`test/panel.mjs`** — 15 checks that mount the real `endpoint.js` factory
  against a fake module loader, React and slots service. The three existing
  suites only cover the Host half; a correct manifest can still ship a
  component that throws on first render, so this covers registration, the
  shared rail/panel id, the glyph and its requested size, every config state,
  layer precedence, re-render on scope change, and detach. Wired into
  `npm test`.
- **A packaging assertion in CI.** The `package` job now checks that the
  tarball carries `endpoint.js` as well, so a release cannot ship without the
  panel's bundle.

### Changed

- `dsh-plugin.json` version was left at 0.1.0 when `package.json` moved to
  0.1.1; both are now 0.2.0 and move together.

### Notes

- **The panel needs a profile restart, not just a reinstall.** The Host caches
  its client-package verdict per Loader specifier, and the cached value includes
  the *negative* verdict. A profile that resolved a client-less build of this
  package before resolving one with a client half keeps "not a client package"
  until the Host restarts — a reinstall, a page refresh and HMR are each
  insufficient. Both READMEs record this.
- The panel is read-only by design: the routing belongs to the bundle row in
  `cordis.patch.yml`, and a form here would give one setting two owners that
  can disagree.

## [0.1.1] — 2026-10-12

### Added

- A `Known issues` / `已知问题` section in both READMEs recording the
  plugin-manager toggle error (`profile reload requires the root Include
  entry`), that it does not affect the plugin, and that a restart resolves it.

## [0.1.0] — 2026-10-11

First release.

### Added

- One ordered system-prompt section (order 3260) naming the command executor to
  reach for first. Registers no tools and hides none — it changes what the agent
  reaches for by default, not what it can do.
- The section is rendered per assembly against the agent's real tool list, so an
  executor that is not registered is never named.
- Configurable `preferred` / `alternatives` / `discouraged` / `promptPolicy` /
  `sectionOrder`, resolvable from the row config or `DSH_WSL_FIRST_*` env vars.

[0.2.0]: https://github.com/yishuiliufang/dsh-wsl-first/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/yishuiliufang/dsh-wsl-first/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/yishuiliufang/dsh-wsl-first/releases/tag/v0.1.0
