# dsh-wsl-first

**English** | [中文](README.zh.md)

Route DSH command execution to **WSL first**.

A [DeepSeek Harness](https://github.com/deepseek-ai) plugin that publishes one ordered system-prompt section naming the command executor the agent should reach for first. Installing it changes no capability — it changes what the agent *chooses*.

## Who this is for

**If you don't like using Git for Windows and would rather run everything through WSL, this plugin is for you.**

On Windows, DSH ships a PowerShell executor and treats it as the default. If your real toolchain — compiler, package manager, shell scripts, CI parity — lives in WSL, that default fights you: every command pays a syntax translation tax, and paths have to be converted by hand.

This plugin makes WSL the first choice. PowerShell stays available for the genuine Windows-native task, but the agent stops reaching for it on its own.

If that describes you, this is the whole point of the project.

## The problem

When several command tools are registered at once, which one the model calls first is not obvious. The bundled `pwsh` tool is always present; `wsl` arrives with a separate plugin. Nothing states a preference, so the model picks one — often `pwsh`, the tool it learned first.

That is a routing problem, not a capability problem. The fix is a preference, not a restriction.

## What this plugin does

It registers a scoped `systemPrompt` section, ordered at **3260** — after the other tooling sections, so this plugin has the final say on routing while leaving every other section intact.

The rendered section:

```markdown
# Shell routing: wsl first

**For every command execution, call `wsl` as the first and default tool.**

| Task | Tool |
| --- | --- |
| Any command, build, git, pipeline, script, file listing, search | `wsl` |
| POSIX commands where WSL is unavailable | `bash` (fallback) |
| Windows-native only: registry, services, COM, cmdlets with no Linux equivalent | `pwsh` (last resort) |

## Rules

- `wsl` is the primary command executor. Reach for it first, every time.
- Use `pwsh` **only** when the task genuinely requires functionality no other available tool provides — and say why in the same reply.
- Never use `pwsh` merely because it appears first in a tool list, and never as a fallback when a `wsl` command fails: fix the command and retry there.
- Do not mix shell syntaxes. A `wsl` call contains the syntax of the shell that tool runs; each executor has its own quoting and path rules.
- `wsl` paths are Linux paths (`/mnt/c/...`). Windows paths in `command`/`workdir` are translated automatically; pass `translatePaths: false` to hand a native path to a Windows program.
```

## It advertises only what exists

**A tool that is not registered is never mentioned.** The section is rendered per assembly, against the agent's real tool list, so a profile without `wsl` does not get told to use it — the preferred tool is dropped and the fallback takes the lead. If nothing configured is visible, the section renders empty and disappears from the prompt.

This matters: claiming a tool the agent cannot call produces a confident call to a nonexistent tool, which is worse than saying nothing.

## Verified in a live profile

The rendered section below was read back from a real DSH session's system prompt after a restart — not from a test fixture:

```markdown
# Shell routing: wsl first

**For every command execution, call `wsl` as the first and default tool.**

| Task | Tool |
| --- | --- |
| Any command, build, git, pipeline, script, file listing, search | `wsl` |
| Windows-native only: registry, services, COM, cmdlets with no Linux equivalent | `pwsh` (last resort) |
```

Note what is **absent**: the configured `bash` fallback. It has no row because no `bash` tool was registered in that profile, so the router dropped it. A static instruction file cannot do this; it would have named a tool the agent cannot call.

## Requirements

| | |
| --- | --- |
| **DSH** | `>=0.1.7-rc.2` |
| **Required service** | `systemPrompt` — present in every standard DSH profile |
| **Required plugin** | [dsh-wsl-tool](https://github.com/XINY11451/dsh-wsl) — provides the `wsl`, `wsl-path`, `wsl-env` and `wsl-doctor` tools |
| **WSL** | WSL2, with at least one distribution registered and `wsl.exe` on `PATH` |
| **Platform** | Any. Windows is the motivating case, but the router itself is platform-independent. |

This plugin registers no tools of its own — it only routes between tools other plugins provide. Without `dsh-wsl-tool` there is no `wsl` tool to prefer, and the section renders empty.

## Install

```bash
npm install dsh-wsl-first
```

Then add it to the `dsh.profile.bundles` array in your DSH profile's `package.json`:

```json
{
  "dsh": {
    "profile": {
      "bundles": ["...", "dsh-wsl-first"]
    }
  }
}
```

The bundle ships its own `cordis.patch.yml`, which inserts the routing row process-wide — every agent preset gets the section without declaring anything. A profile restart is required, because the loader reads its composition at startup.

## Configuration

Every field is optional and settable in a profile patch (`- id: wsl-first-routing` / `config:`) or by environment variable. **Precedence: row config > environment > built-in default.**

| Field | Default | Environment | Meaning |
| --- | --- | --- | --- |
| `preferred` | `wsl` | `DSH_WSL_FIRST_PREFERRED` | The tool to try first. |
| `alternatives` | `['bash']` | `DSH_WSL_FIRST_ALTERNATIVES` (comma-separated) | Tools tried after the preferred one. |
| `discouraged` | `['pwsh']` | `DSH_WSL_FIRST_DISCOURAGED` (comma-separated) | Tools pushed to last resort. |
| `promptPolicy` | `true` | — | Publish the section at all. |
| `sectionOrder` | `3260` | — | The section's sort order. |
| `sectionName` | `dsh-wsl-first:shell-routing` | — | The section's stable name. |
| `extraGuidance` | `''` | — | Extra text appended to the section. |
| `labels` | built-in | — | `{tool: task description}` rows for the table. |
| `requirePreferred` | `false` | — | Only publish the section while `preferred` is visible. |

### WSL only, nothing else

If you never want another executor named, drop the other tiers:

```yaml
- id: wsl-first-routing
  config:
    preferred: wsl
    alternatives: []
    discouraged: []
```

The section then mentions `wsl` alone, and renders empty in any profile where `wsl` is not registered.

### Two rules it enforces

- **Naming a tool in two tiers is a contradiction.** A tool listed as both an executor and a last resort is a configuration error and throws, rather than letting a silent winner decide.
- **Repeating `preferred` among `alternatives` is not.** It is redundant, and it happens by default when you point `preferred` at `bash`, so it is dropped instead of failing a reasonable configuration.

## What this plugin deliberately does not do

**It does not hide or disable any tool.** The goal is that `wsl` is *chosen* first, not that `pwsh` becomes *unavailable*. Hiding a tool changes what the agent can do; a routing section changes what it reaches for by default while leaving every capability intact.

If you want the hard form — `pwsh` removed from the tool list entirely — that is your own profile patch:

```yaml
- id: pwsh-sandbox
  disabled: true
```

Confirm that entry's real id in your live loader tree before you rely on it; a wrong id fails silently.

## Tests

```bash
npm test
```

`test/smoke.mjs` covers config resolution (precedence, validation, the overlap rules) and rendering (tier ordering, visibility filtering, the no-`undefined`-heading case). `test/mount.mjs` runs the real `apply` from `index.js` against a fake Cordis context and asserts the registered section's name, order and rendered text.

Both modules under test are pure by design — that is why the policy logic lives in `lib/` and not in `index.js`.

## License

MIT
