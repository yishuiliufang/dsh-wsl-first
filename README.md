# dsh-wsl-first

**English** | [中文](README.zh.md)

Make DSH reach for WSL first on Windows.

🎯 Have WSL installed? Then use it — don't let the agent default to writing PowerShell.

## Why

On Windows, DSH hands the model `pwsh` as its default command tool. There's nothing wrong with that in itself, but if the machine already has WSL, that default costs you.

Models write bash more naturally than PowerShell. Their command instincts are POSIX-shaped. Forcing a switch to PowerShell means translating pipes, quoting, and paths back and forth — and every mistranslation is a retry. **Every retry is tokens burned for nothing.**

Output is the same story. Linux commands tend to print tight, plain text. PowerShell hands you tables and object properties by default, and the same information takes visibly more room.

Paths too. The WSL tool converts `C:\...` to `/mnt/c/...` on its own, so the model never has to think about it.

So this plugin does one small thing: it adds a section to the system prompt saying to try `wsl` first. **It grants no capability and disables no tool — it just changes the default order.**

That prompt text only lists tools that are actually registered. If a tool isn't installed, it won't appear there, which means the model never gets told to call something that doesn't exist. A static instruction file can't do this; it just repeats what you wrote.

## Features

| | |
| --- | --- |
| 🚀 Saves tokens | One less syntax translation means one less retry |
| 🐧 Built for WSL | The model writes bash, and it runs Linux-side |
| 🪟 Keeps the escape hatch | When you really need Windows-native, `pwsh` is still there |
| 🔧 Configurable | Prefer bash instead, or name only `wsl` — it's a config change |
| 🩺 Never lies | Only advertises tools that are actually registered |
| 🖥 Sidebar panel | A rail entry showing the current first choice, the fallbacks, and whether the section is publishing |

## Sidebar panel

The plugin contributes one rail entry (a glyph plus the `WSL first` label). It opens a read-only panel showing the routing in force:

| Panel row | Meaning |
| --- | --- |
| Reach for first | The preferred executor (`preferred`) |
| Fall back to | The alternatives (`alternatives`, minus any duplicate of the preferred) |
| Last resort | What is explicitly discouraged (`discouraged`) |
| Prompt section | Whether the section publishes, and its `order` |

The panel is read-only by design: the routing belongs to the bundle row in `cordis.patch.yml`, and a form here would give one setting two owners that can disagree. Change the file and restart the profile.

It reads the row's own override first and the inherited bundle default second — the same precedence the Host applies to that row.

> **The first enable needs a DSH restart.** The Host caches its client-package verdict per Loader specifier. If a profile ever resolved a build of this package *without* a client half before resolving one with it, that negative verdict is cached too, and nothing short of a restart re-evaluates it — not a reinstall, a page refresh, or HMR. After that restart, later client-artifact edits are picked up by HMR normally.

## Requirements

| | |
| --- | --- |
| **DSH** | `>=0.1.7-rc.2` |
| **Required service** | `systemPrompt` — ships with every standard profile |
| **Required plugin** | [dsh-wsl-tool](https://github.com/XINY11451/dsh-wsl) — provides `wsl` / `wsl-path` / `wsl-env` / `wsl-doctor` |
| **WSL** | WSL2, at least one registered distribution, `wsl.exe` on `PATH` |
| **Platform** | Any. Windows is the motivating case; the router itself is platform-independent |

This plugin registers no tools of its own — it only routes between tools other plugins provide. Without `dsh-wsl-tool` there is no `wsl` to prefer, and the section renders empty.

## Install

```bash
npm install dsh-wsl-first
```

Then add it to your profile's `package.json`:

```json
{
  "dsh": {
    "profile": {
      "bundles": ["...", "dsh-wsl-first"]
    }
  }
}
```

The bundle ships its own `cordis.patch.yml`, which inserts the routing row process-wide — every agent preset gets the section without declaring anything. **A profile restart is required**; the loader reads its composition at startup.

If the `wsl` tool itself isn't installed yet, get that first:

```bash
npm install dsh-wsl-tool
```

## DSH version compatibility

`package.json` declares `engines.dsh: ">=0.1.7-rc.2"`.

The plugin declares **no `@deepseek-ai/*` peer dependency** and imports none of their values. That's deliberate: at startup DSH runs `evaluatePluginCompatibility` over every profile bundle, and if even one peer range fails to cover the running version, **the whole bundle is skipped** — `cordis.patch.yml` never takes effect, and it looks like "installed but nothing happens". With no peer range to check, that particular failure can't happen here.

If the plugin goes quiet after a DSH major upgrade, check stderr for `skipping profile bundle` and confirm `engines.dsh` still covers your version.

## Known issues

### Toggling the plugin can report an error

Switching this plugin off, or back on, from the plugin manager can fail with one of these:

```
停用失败: dsh: profile reload requires the root Include entry
启用失败: dsh: warning: 1 entry did not activate
```

**This does not affect how the plugin works.** The routing section stays in the system prompt and the plugin keeps running — only the toggle itself does not apply, and no configuration is lost.

**Restart DSH** — close the app and open it again. The change takes effect at startup, and everything works normally afterwards.

The same messages can appear when toggling other plugins in the same profile.

One more thing worth knowing: editing the profile's `cordis.patch.yml` while DSH is running can strip tools from live sessions. Restart after editing that file rather than relying on live reload.

## Configuration

Every field is optional and settable in a profile patch (`- id: wsl-first-routing` / `config:`) or by environment variable. **Precedence: row config > environment > built-in default.**

| Field | Default | Environment | Meaning |
| --- | --- | --- | --- |
| `preferred` | `wsl` | `DSH_WSL_FIRST_PREFERRED` | The tool to try first |
| `alternatives` | `['bash']` | `DSH_WSL_FIRST_ALTERNATIVES` | Tried after the preferred one (comma-separated) |
| `discouraged` | `['pwsh']` | `DSH_WSL_FIRST_DISCOURAGED` | Pushed to last resort (comma-separated) |
| `promptPolicy` | `true` | — | Publish the section at all |
| `sectionOrder` | `3260` | — | The section's sort order |
| `sectionName` | `dsh-wsl-first:shell-routing` | — | The section's stable name |
| `extraGuidance` | `''` | — | Extra text appended to the section |
| `labels` | built-in | — | `{tool: task description}` rows for the table |
| `requirePreferred` | `false` | — | Only publish while `preferred` is visible |

### WSL only, nothing else

```yaml
- id: wsl-first-routing
  config:
    preferred: wsl
    alternatives: []
    discouraged: []
```

The section then names `wsl` alone, and doesn't appear at all where `wsl` isn't installed.

### Prefer bash instead

```yaml
- id: wsl-first-routing
  config:
    preferred: bash
    alternatives: []
    discouraged: []
```

`wsl` is only the default — the plugin is a general executor router.

### Two configuration rules

A tool that is both an executor and a last resort is a contradiction, and it throws rather than letting a silent winner decide. Repeating `preferred` among `alternatives` is not a contradiction — it's just redundant (it happens naturally when you point `preferred` at `bash`), so it gets de-duplicated.

## The rendered prompt

```markdown
# Shell routing: wsl first

**For every command execution, call `wsl` as the first and default tool.**

| Task | Tool |
| --- | --- |
| Any command, build, git, pipeline, script, file listing, search | `wsl` |
| Windows-native only: registry, services, COM, cmdlets with no Linux equivalent | `pwsh` (last resort) |

## Rules

- `wsl` is the primary command executor. Reach for it first, every time.
- Use `pwsh` **only** when the task genuinely requires functionality no other available tool provides — and say why in the same reply.
- Never use `pwsh` merely because it appears first in a tool list, and never as a fallback when a `wsl` command fails: fix the command and retry there.
- Do not mix shell syntaxes. A `wsl` call contains the syntax of the shell that tool runs; each executor has its own quoting and path rules.
- `wsl` paths are Linux paths (`/mnt/c/...`). Windows paths in `command`/`workdir` are translated automatically; pass `translatePaths: false` to hand a native path to a Windows program.
```

That block is the real output, read back from a live session's system prompt. Note there's **no `bash` row** in it: the profile it came from had no `bash` tool registered, so the router dropped it.

## What it deliberately doesn't do

**It hides nothing and disables nothing.** The point is that `wsl` gets chosen first, not that `pwsh` disappears. Hiding a tool changes what the model can do; a routing section only changes what it reaches for by default.

The hard version — removing `pwsh` from the tool list entirely — is your own profile patch:

```yaml
- id: pwsh-sandbox
  disabled: true
```

Check that row's real id in your live loader tree before relying on it; a wrong id fails silently.

## Project layout

```
dsh-wsl-first
├── index.js          # Host half: registers the systemPrompt section
├── lib/
│   ├── config.js     # Config resolution, precedence, validation
│   └── policy.js     # Tier ordering and prompt rendering
├── test/
│   ├── smoke.mjs     # Config and rendering (27 checks)
│   ├── mount.mjs     # Real apply() mount (8 checks)
│   └── docs.mjs      # Both READMEs quote the real render (3 checks)
├── cordis.patch.yml  # Bundle layer: inserts the routing row process-wide
├── dsh-plugin.json   # Plugin manifest
└── package.json
```

## Tests

```bash
npm test
```

Both modules under `lib/` are pure, so the tests need no DSH host. `mount.mjs` runs the real `apply` from `index.js` against a fake cordis context and asserts the registered section's name, order and rendered text. `docs.mjs` re-renders the section and compares it byte for byte against the block quoted in each README, so the documented output cannot drift from what the code emits.

## License

MIT
