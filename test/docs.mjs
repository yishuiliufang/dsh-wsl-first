// dsh-wsl-first docs test: the READMEs must not drift from the real render.
//
// Both READMEs quote the section the plugin produces. Hand-copied prompt text
// rots the moment the wording changes, and a README that shows output the code
// no longer emits is worse than one that shows none — a reader checks the real
// section against the documented one and trusts the doc.
//
// So the quoted block is asserted against the actual render here.
//
// Run: node test/docs.mjs

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { resolveConfig } from '../lib/config.js'
import { renderRouting } from '../lib/policy.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

let passed = 0
let failed = 0
function check(label, body) {
  try { body(); passed += 1; console.log(`  ok   ${label}`) }
  catch (error) { failed += 1; console.log(`  FAIL ${label}\n       ${error.message.split('\n')[0]}`) }
}

/**
 * The block a README quotes, as the reader would see it.
 * @param {string} file - path to the README.
 * @returns {string} the fenced `markdown` block starting at the heading.
 */
function quotedBlock(file) {
  // Normalize line endings first: a Windows checkout with core.autocrlf=true
  // writes CRLF, and a comparison that only understands LF would report the
  // README as broken when the file is fine.
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
  const start = text.indexOf('```markdown\n# Shell routing: wsl first')
  assert.notEqual(start, -1, `${file}: no quoted routing block found`)
  const body = start + '```markdown\n'.length
  const end = text.indexOf('```', body)
  assert.notEqual(end, -1, `${file}: quoted routing block is unterminated`)
  return text.slice(body, end).replace(/\n+$/, '')
}

// The render a reader would reproduce by installing the plugin with a `wsl`
// and a `pwsh` tool registered — the same view both READMEs claim to show.
const expected = renderRouting({
  config: resolveConfig({}, {}),
  visible: ['wsl', 'pwsh'],
}).replace(/\n+$/, '')

console.log('docs: quoted prompt matches the real render')
for (const file of ['README.md', 'README.zh.md']) {
  check(`${file} quotes the exact render`, () => {
    assert.equal(quotedBlock(join(root, file)), expected)
  })
}

check('the quoted block omits bash, matching the live-session claim', () => {
  // Both READMEs say the quoted block has no bash row because the profile it
  // came from had no bash tool. Assert the shape they describe.
  assert.equal(expected.includes('`bash`'), false)
  assert.equal(expected.includes('(last resort)'), true)
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
