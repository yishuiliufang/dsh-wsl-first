/**
 * The model-facing routing section: which command executor to reach for first.
 *
 * This module is pure. It renders text from a resolved configuration plus the
 * set of tool names an agent can actually call, and it never touches a service
 * or a registry.
 *
 * The one rule that matters here: a tool that is not visible is never
 * advertised. Telling a model to "prefer wsl" when no `wsl` tool is registered
 * would produce a confident call to a tool that does not exist, so the
 * preferred rung is dropped — and, by default, the whole section with it —
 * rather than promised.
 *
 * @module dsh-wsl-first/policy
 */

/** The heading the section renders when a preferred tool is visible. */
export const ROUTING_HEADING = '# Shell routing'

/**
 * Order tools into the three tiers the table renders, keeping only the ones
 * that are actually callable.
 *
 * A tool recurs across tiers in no layer: the resolved configuration already
 * rejects that, so the first tier to claim a tool wins here without ambiguity.
 *
 * @param {object} options - the routing inputs.
 * @param {{preferred: string, alternatives: string[], discouraged: string[]}} options.policy - the resolved routing policy.
 * @param {Iterable<string>} options.visible - tool names the agent can call.
 * @returns {{first: string|undefined, alternates: string[], lastResort: string[]}} the tiers, filtered.
 */
export function orderTiers({ policy, visible }) {
  const callable = new Set(visible)
  const claimed = new Set()
  const take = (names) => names.filter((name) => {
    if (claimed.has(name)) return false
    if (!callable.has(name)) return false
    claimed.add(name)
    return true
  })
  const first = take([policy.preferred])[0]
  const alternates = take(policy.alternatives)
  const lastResort = take(policy.discouraged)
  return { first, alternates, lastResort }
}

/**
 * Whether this configuration has anything to say to an agent.
 *
 * The section is worth rendering when the preferred tool is visible, or —
 * when `requirePreferred` is off — when any tier has a visible member at all.
 *
 * @param {object} options - the check inputs.
 * @param {import('./config.js').ResolvedConfig} options.config - the resolved configuration.
 * @param {Iterable<string>} options.visible - tool names the agent can call.
 * @returns {boolean} whether to publish the section.
 */
export function shouldRender({ config, visible }) {
  const tiers = orderTiers({ policy: config, visible })
  if (config.requirePreferred) return tiers.first !== undefined
  return tiers.first !== undefined
    || tiers.alternates.length > 0
    || tiers.lastResort.length > 0
}

/**
 * One table row, or nothing when the tool is absent.
 * @param {string|undefined} tool - the tool name.
 * @param {string} task - the task description.
 * @param {string} note - an optional trailing note.
 * @returns {string|undefined} the row, when the tool is present.
 */
function row(tool, task, note = '') {
  if (tool === undefined) return undefined
  return `| ${task} | \`${tool}\`${note} |`
}

/**
 * Render the model-facing routing section.
 *
 * @param {object} options - the render inputs.
 * @param {import('./config.js').ResolvedConfig} options.config - the resolved configuration.
 * @param {Iterable<string>} options.visible - tool names the agent can call.
 * @returns {string} the section text, or `''` when there is nothing to say.
 */
export function renderRouting({ config, visible }) {
  const tiers = orderTiers({ policy: config, visible })
  const { first, alternates, lastResort } = tiers
  if (first === undefined && alternates.length === 0 && lastResort.length === 0) return ''

  // The heading names the tool the reader should reach for first, which is the
  // preferred tool when it is callable and the best available fallback when it
  // is not. When only discouraged tools remain visible there is no "first" to
  // name, so the heading drops the suffix instead of printing `undefined`.
  const leader = first ?? alternates[0]
  const label = (tool) => (tool === undefined
    ? 'Command execution'
    : config.labels[tool] ?? 'Command execution')
  const lines = [
    leader === undefined ? ROUTING_HEADING : `${ROUTING_HEADING}: ${leader} first`,
    '',
  ]

  if (leader !== undefined) {
    lines.push(`**For every command execution, call \`${leader}\` as the first and default tool.**`
      + (leader === config.preferred ? '' : ` Where it is available, prefer \`${config.preferred}\`.`))
    lines.push('')
  }

  const rows = [
    row(first, label(first)),
    ...alternates.map((tool) => row(tool, label(tool), first === undefined ? '' : ' (fallback)')),
    ...lastResort.map((tool) => row(tool, label(tool), ' (last resort)')),
  ].filter((entry) => entry !== undefined)

  if (rows.length > 0) {
    lines.push('| Task | Tool |', '| --- | --- |', ...rows, '')
  }

  lines.push('## Rules', '')
  if (leader !== undefined) {
    lines.push(`- \`${leader}\` is the primary command executor. Reach for it first, every time.`)
  }
  for (const tool of lastResort) {
    lines.push(`- Use \`${tool}\` **only** when the task genuinely requires functionality no other `
      + `available tool provides — and say why in the same reply.`)
    const retryIn = leader === undefined ? 'the preferred executor' : `\`${leader}\``
    lines.push(`- Never use \`${tool}\` merely because it appears first in a tool list, and never as `
      + `a fallback when a ${retryIn} command fails: fix the command and retry there.`)
  }
  if (leader !== undefined) {
    lines.push(`- Do not mix shell syntaxes. A \`${leader}\` call contains the syntax of the shell `
      + `that tool runs; each executor has its own quoting and path rules.`)
  }
  if (leader === 'wsl' || (leader === undefined && first === undefined && config.preferred === 'wsl')) {
    lines.push('- `wsl` paths are Linux paths (`/mnt/c/...`). Windows paths in `command`/`workdir` are '
      + 'translated automatically; pass `translatePaths: false` to hand a native path to a Windows program.')
  }

  const guidance = config.extraGuidance.trim()
  if (guidance !== '') lines.push('', guidance)

  return lines.join('\n')
}
