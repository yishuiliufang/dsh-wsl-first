// dsh-wsl-first smoke tests: config resolution and section rendering.
//
// These run on plain Node with no DSH host: both modules under test are pure,
// which is the point of keeping the policy logic out of `index.js`.
//
// Run: node test/smoke.mjs

import assert from 'node:assert/strict'
import { resolveConfig, ConfigError, DEFAULT_PREFERRED } from '../lib/config.js'
import { renderRouting, shouldRender, orderTiers } from '../lib/policy.js'

let passed = 0
let failed = 0

/**
 * Run one named check, reporting rather than throwing so a failure does not
 * hide the checks after it.
 * @param {string} label - the check name.
 * @param {() => void} body - the check.
 */
function check(label, body) {
  try {
    body()
    passed += 1
    console.log(`  ok   ${label}`)
  } catch (error) {
    failed += 1
    console.log(`  FAIL ${label}`)
    console.log(`       ${error.message.split('\n')[0]}`)
  }
}

console.log('config: defaults')
check('preferred defaults to wsl', () => {
  assert.equal(resolveConfig({}, {}).preferred, 'wsl')
  assert.equal(DEFAULT_PREFERRED, 'wsl')
})
check('discouraged defaults to pwsh', () => {
  assert.deepEqual(resolveConfig({}, {}).discouraged, ['pwsh'])
})
check('promptPolicy defaults on', () => {
  assert.equal(resolveConfig({}, {}).promptPolicy, true)
})
check('missing config is accepted', () => {
  assert.equal(resolveConfig(undefined, {}).preferred, 'wsl')
})

console.log('config: overrides')
check('row config beats the environment', () => {
  const config = resolveConfig({ preferred: 'bash' }, { DSH_WSL_FIRST_PREFERRED: 'wsl' })
  assert.equal(config.preferred, 'bash')
})
check('environment beats the default', () => {
  assert.equal(resolveConfig({}, { DSH_WSL_FIRST_PREFERRED: 'bash' }).preferred, 'bash')
})
check('empty environment value is ignored', () => {
  assert.equal(resolveConfig({}, { DSH_WSL_FIRST_PREFERRED: '   ' }).preferred, 'wsl')
})
check('environment list parsing splits on commas', () => {
  const config = resolveConfig({}, { DSH_WSL_FIRST_ALTERNATIVES: 'bash, sh' })
  assert.deepEqual(config.alternatives, ['bash', 'sh'])
})
check('an env alternative that is discouraged is still a hard error', () => {
  // pwsh is discouraged by default, so listing it as a fallback by environment
  // contradicts the default and must be reported rather than silently resolved.
  assert.throws(
    () => resolveConfig({}, { DSH_WSL_FIRST_ALTERNATIVES: 'bash, pwsh' }),
    ConfigError,
  )
})

console.log('config: the two overlap rules')
check('preferred repeated in alternatives is dropped, not fatal', () => {
  const config = resolveConfig({ preferred: 'bash', alternatives: ['bash', 'wsl'] }, {})
  assert.deepEqual(config.alternatives, ['wsl'])
})
check('preferred also discouraged is a hard error', () => {
  assert.throws(
    () => resolveConfig({ preferred: 'wsl', discouraged: ['wsl'] }, {}),
    ConfigError,
  )
})
check('alternative also discouraged is a hard error', () => {
  assert.throws(
    () => resolveConfig({ alternatives: ['bash'], discouraged: ['bash'] }, {}),
    ConfigError,
  )
})

console.log('config: validation')
check('an unknown key is rejected by name', () => {
  assert.throws(() => resolveConfig({ prefered: 'wsl' }, {}), /unknown key/)
})
check('a non-boolean promptPolicy is rejected', () => {
  assert.throws(() => resolveConfig({ promptPolicy: 'yes' }, {}), ConfigError)
})
check('a non-string list entry is rejected', () => {
  assert.throws(() => resolveConfig({ alternatives: [42] }, {}), ConfigError)
})
check('an empty alternatives list is allowed', () => {
  assert.deepEqual(resolveConfig({ alternatives: [] }, {}).alternatives, [])
})
check('labels merge over the defaults', () => {
  const config = resolveConfig({ labels: { wsl: 'Run things' } }, {})
  assert.equal(config.labels.wsl, 'Run things')
  assert.equal(config.labels.pwsh.length > 0, true)
})

console.log('policy: tier ordering')
check('preferred is first when visible', () => {
  const config = resolveConfig({}, {})
  const tiers = orderTiers({ policy: config, visible: ['wsl', 'bash', 'pwsh'] })
  assert.equal(tiers.first, 'wsl')
  assert.deepEqual(tiers.alternates, ['bash'])
  assert.deepEqual(tiers.lastResort, ['pwsh'])
})
check('an invisible preferred tool falls through to a fallback', () => {
  const config = resolveConfig({}, {})
  const tiers = orderTiers({ policy: config, visible: ['bash', 'pwsh'] })
  assert.equal(tiers.first, undefined)
  assert.deepEqual(tiers.alternates, ['bash'])
})
check('an invisible tool is never advertised', () => {
  const config = resolveConfig({}, {})
  const tiers = orderTiers({ policy: config, visible: ['pwsh'] })
  assert.deepEqual(tiers.alternates, [])
  assert.deepEqual(tiers.lastResort, ['pwsh'])
})

console.log('policy: rendering')
check('the exact bug: no "undefined first" heading', () => {
  const config = resolveConfig({}, {})
  const text = renderRouting({ config, visible: ['pwsh'] })
  assert.equal(text.includes('undefined'), false)
  assert.equal(text.startsWith('# Shell routing\n'), true)
})
check('nothing visible renders nothing', () => {
  const config = resolveConfig({}, {})
  assert.equal(renderRouting({ config, visible: [] }), '')
  assert.equal(shouldRender({ config, visible: [] }), false)
})
check('wsl visible produces the wsl-first instruction', () => {
  const config = resolveConfig({}, {})
  const text = renderRouting({ config, visible: ['wsl', 'bash', 'pwsh'] })
  assert.equal(text.includes('# Shell routing: wsl first'), true)
  assert.equal(text.includes('call `wsl` as the first and default tool'), true)
})
check('requirePreferred suppresses the section without wsl', () => {
  const config = resolveConfig({ requirePreferred: true }, {})
  assert.equal(shouldRender({ config, visible: ['bash'] }), false)
  assert.equal(shouldRender({ config, visible: ['wsl'] }), true)
})
check('extraGuidance is appended', () => {
  const config = resolveConfig({ extraGuidance: 'Prefer /home for builds.' }, {})
  const text = renderRouting({ config, visible: ['wsl'] })
  assert.equal(text.includes('Prefer /home for builds.'), true)
})
check('a bash-first configuration renders bash first', () => {
  const config = resolveConfig({ preferred: 'bash', discouraged: [] }, {})
  const text = renderRouting({ config, visible: ['bash', 'wsl'] })
  assert.equal(text.includes('# Shell routing: bash first'), true)
  assert.equal(text.includes('call `bash` as the first and default tool'), true)
})
check('the wsl path note appears only in a wsl-first section', () => {
  const wslFirst = renderRouting({ config: resolveConfig({}, {}), visible: ['wsl'] })
  const bashFirst = renderRouting({
    config: resolveConfig({ preferred: 'bash', discouraged: [] }, {}),
    visible: ['bash'],
  })
  assert.equal(wslFirst.includes('/mnt/c/'), true)
  assert.equal(bashFirst.includes('/mnt/c/'), false)
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
