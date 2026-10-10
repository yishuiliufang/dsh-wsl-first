// dsh-wsl-first mount test: does `apply` actually register a working section?
//
// This runs the real `apply` from index.js against a fake Cordis context that
// implements just the three things the plugin touches: `inject`, `effect` and
// `systemPrompt.section`. It proves the wiring — that a section is registered
// under the configured name and order, and that its `text` callback renders the
// routing text from the agent's visible tools.
//
// Run: node test/mount.mjs

import assert from 'node:assert/strict'
import { apply } from '../index.js'

let passed = 0
let failed = 0
function check(label, body) {
  try { body(); passed += 1; console.log(`  ok   ${label}`) }
  catch (error) { failed += 1; console.log(`  FAIL ${label}\n       ${error.message.split('\n')[0]}`) }
}

/**
 * A minimal Cordis context recording what the plugin registers.
 * @param {object} options - the fake's inputs.
 * @param {string[]} options.visible - the tool names `schemas()` will report.
 * @returns {object} the fake context, with `sections` and `effects` recorded.
 */
function fakeContext({ visible }) {
  const sections = []
  const effects = []
  const logs = []
  const ctx = {
    sections,
    effects,
    logs,
    logger: {
      info: (message) => logs.push(['info', message]),
      warn: (message) => logs.push(['warn', message]),
      error: (message) => logs.push(['error', message]),
    },
    get(service) {
      if (service === 'tools') return { schemas: () => visible.map((name) => ({ name })) }
      return undefined
    },
    effect(fn, label) {
      effects.push(label)
      const disposer = fn()
      return typeof disposer === 'function' ? disposer : () => {}
    },
    inject(services, body) {
      assert.deepEqual(services, ['systemPrompt'])
      body({
        get: ctx.get,
        effect: ctx.effect,
        systemPrompt: {
          section(section) { sections.push(section); return () => {} },
        },
      })
    },
  }
  return ctx
}

console.log('mount: registration')
check('a section is registered under the configured name and order', () => {
  const ctx = fakeContext({ visible: ['wsl', 'bash', 'pwsh'] })
  apply(ctx, {})
  assert.equal(ctx.sections.length, 1)
  assert.equal(ctx.sections[0].name, 'dsh-wsl-first:shell-routing')
  assert.equal(ctx.sections[0].order, 3260)
  assert.equal(ctx.sections[0].interpolate, false)
})

check('the section renders wsl-first text for a visible wsl', () => {
  const ctx = fakeContext({ visible: ['wsl', 'bash', 'pwsh'] })
  apply(ctx, {})
  const text = ctx.sections[0].text({ agent: {} })
  assert.equal(text.includes('# Shell routing: wsl first'), true)
  assert.equal(text.includes('call `wsl` as the first and default tool'), true)
})

check('the section renders empty when no configured tool is visible', () => {
  const ctx = fakeContext({ visible: ['read', 'edit', 'glob'] })
  apply(ctx, {})
  assert.equal(ctx.sections[0].text({ agent: {} }), '')
})

check('a configured order and name are honoured', () => {
  const ctx = fakeContext({ visible: ['wsl'] })
  apply(ctx, { sectionOrder: 4000, sectionName: 'custom:name' })
  assert.equal(ctx.sections[0].order, 4000)
  assert.equal(ctx.sections[0].name, 'custom:name')
})

console.log('mount: failure modes')
check('promptPolicy false registers nothing and says so', () => {
  const ctx = fakeContext({ visible: ['wsl'] })
  apply(ctx, { promptPolicy: false })
  assert.equal(ctx.sections.length, 0)
  assert.equal(ctx.logs.some(([, m]) => m.includes('promptPolicy is false')), true)
})

check('a bad config is reported without throwing', () => {
  const ctx = fakeContext({ visible: ['wsl'] })
  assert.doesNotThrow(() => apply(ctx, { preferred: 'wsl', discouraged: ['wsl'] }))
  assert.equal(ctx.sections.length, 0)
  assert.equal(ctx.logs.some(([level]) => level === 'error'), true)
})

check('an unreadable tool registry suppresses rather than advertises', () => {
  const ctx = fakeContext({ visible: [] })
  ctx.get = () => { throw new Error('registry unavailable') }
  apply(ctx, {})
  assert.equal(ctx.sections[0].text({ agent: {} }), '')
})

check('the effect is labelled for diagnostics', () => {
  const ctx = fakeContext({ visible: ['wsl'] })
  apply(ctx, {})
  assert.equal(ctx.effects.includes('dsh-wsl-first: shell routing section'), true)
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
