/**
 * dsh-wsl-first host half.
 *
 * The plugin publishes one thing: an ordered system-prompt section telling the
 * model which command executor to reach for first. It registers no tools, owns
 * no process, and reads no file — it only shapes routing between tools that
 * other plugins already registered.
 *
 * Why a prompt section rather than a tool restriction: the goal is that `wsl`
 * is *chosen* first, not that `pwsh` becomes *unavailable*. Hiding a tool
 * changes what the agent can do; a routing section changes what it reaches for
 * by default while leaving every capability intact. An operator who wants the
 * hard form hides the tool in their own profile patch.
 *
 * This module deliberately imports no `@deepseek-ai/*` value: the profile
 * loader supplies those names, and every extra one is another way for the
 * plugin to fail to load.
 *
 * @module dsh-wsl-first
 */

import { resolveConfig } from './lib/config.js'
import { renderRouting, shouldRender } from './lib/policy.js'

export const name = 'dsh-wsl-first'

/**
 * Report one problem without letting a hostile logger swallow it.
 * @param {object} ctx - a Cordis context.
 * @param {string} message - the report.
 * @param {'info'|'warn'|'error'} [level] - the severity.
 * @returns {void}
 */
function report(ctx, message, level = 'warn') {
  const logger = ctx?.logger
  if (typeof logger?.[level] === 'function') {
    logger[level](message)
    return
  }
  if (level === 'warn') console.warn(message)
  else if (level === 'info') console.info(message)
  else console.error(message)
}

/**
 * The tool names one agent can actually call.
 *
 * A failure here must not take the section down: an unreadable registry means
 * "nothing is visible", which suppresses the section rather than advertising a
 * tool that may not exist.
 * @param {object} ctx - the injected context.
 * @param {object|undefined} agent - the agent whose tool list is wanted.
 * @returns {string[]} the visible tool names.
 */
function visibleTools(ctx, agent) {
  try {
    const schemas = ctx.get('tools')?.schemas(agent) ?? []
    return schemas
      .map((schema) => schema?.name)
      .filter((tool) => typeof tool === 'string')
  } catch {
    return []
  }
}

/**
 * Mount the routing section.
 *
 * `systemPrompt` is injected rather than reached for with `ctx.get`, so the
 * plugin waits for the service instead of racing it — a profile that mounts the
 * prompt registry later still gets the section.
 *
 * @param {object} ctx - the Cordis root context of this plugin row.
 * @param {unknown} [rawConfig] - the row's `config` value.
 * @returns {void}
 */
export function apply(ctx, rawConfig) {
  let config
  try {
    config = resolveConfig(rawConfig)
  } catch (error) {
    // A bad config is an operator error: report it and mount nothing, rather
    // than taking the profile down with it.
    report(ctx, `dsh-wsl-first: ${error.message}`, 'error')
    return
  }
  if (!config.promptPolicy) {
    report(ctx, 'dsh-wsl-first: promptPolicy is false; no routing section is published.', 'info')
    return
  }

  ctx.inject(['systemPrompt'], (promptCtx) => {
    promptCtx.effect(() => promptCtx.systemPrompt.section({
      name: config.sectionName,
      order: config.sectionOrder,
      // The section carries literal text only; nothing in it is a `{variable}`
      // reference, so interpolation stays off.
      interpolate: false,
      // The assembly context carries the agent whose prompt is being built, so
      // the section is filtered against THAT agent's visible tools. The
      // published `AssembleContext` type declares only `scope`/`signal`, but the
      // runtime object carries the agent and the `tools.schemas(scope)` lookup is
      // designed for it — the same contract every tooling plugin relies on when
      // it needs to name only the tools an agent can really call.
      //
      // Should the field ever be absent, `schemas(undefined)` falls back to the
      // GLOBAL view rather than throwing: process-wide tools such as `wsl` are
      // still seen, so the section degrades in precision (a tool hidden from one
      // agent may be mentioned) instead of disappearing.
      text: (context) => {
        const visible = visibleTools(promptCtx, context?.agent)
        if (!shouldRender({ config, visible })) return ''
        return renderRouting({ config, visible })
      },
    }), 'dsh-wsl-first: shell routing section')

    report(ctx, `dsh-wsl-first: routing section "${config.sectionName}" mounted at order `
      + `${config.sectionOrder}; preferred executor is "${config.preferred}".`, 'info')
  })
}
