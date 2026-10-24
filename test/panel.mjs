// dsh-wsl-first client mount test: does `endpoint.js` register a working panel?
//
// The three existing suites cover the Host half. This one covers the browser
// half, which they never load: `endpoint.js` is a `__ModuleLoader__.load()`
// registration, so mounting it needs a fake loader, a fake React and a fake
// `slots` service. It proves the wiring — that the factory registers under the
// package name, that both seats use one id, that the rail entry draws a glyph,
// and that the panel renders each config state without throwing.
//
// This is the strongest check available without an authenticated browser page:
// a correct manifest can still ship a component that throws on first render.
//
// Run: node test/panel.mjs

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import vm from 'node:vm'

let passed = 0
let failed = 0
function check(label, body) {
  try { body(); passed += 1; console.log(`  ok   ${label}`) }
  catch (error) {
    failed += 1
    console.log(`  FAIL ${label}`)
    // Print the whole assertion message, not just its first line: for
    // deepEqual the useful part (actual vs expected) is further down.
    for (const line of String(error.message).split('\n')) console.log(`       ${line}`)
  }
}

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'endpoint.js'), 'utf8')

/**
 * A React stand-in implementing only what `endpoint.js` uses.
 *
 * `useSyncExternalStore` reads the current value through `getSnapshot`, which is
 * exactly enough for one render pass per call. The element shape follows React's
 * own (`{ type, props }`), so the tree can be walked without React present.
 *
 * @returns {object} the fake React module.
 */
function fakeReact() {
  return {
    createElement(type, props, ...children) {
      const merged = { ...(props || {}) }
      if (children.length > 0) merged.children = children.length === 1 ? children[0] : children
      return { type, props: merged }
    },
    useSyncExternalStore(_subscribe, getSnapshot) {
      return getSnapshot()
    },
    useCallback(fn) {
      return fn
    },
  }
}

/**
 * Render one element tree, invoking function components. Text nodes and
 * fragments flatten to a string so the panel's output can be asserted directly.
 *
 * @param {unknown} node - an element, array, or primitive.
 * @returns {string} the concatenated visible text.
 */
function render(node) {
  if (node === null || node === undefined || node === false || node === true) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(render).join('')
  const { type, props } = node
  if (typeof type === 'function') return render(type(props || {}))
  const children = props?.children === undefined
    ? []
    : (Array.isArray(props.children) ? props.children : [props.children])
  return children.map(render).join('')
}

/**
 * Load `endpoint.js` against the fakes and mount its plugin.
 *
 * The file is evaluated in a fresh VM context so each case gets its own module
 * registry, and `window.__ModuleLoader__.load` captures the registration the way
 * the real loader receives it.
 *
 * @param {object} options - the fakes' inputs.
 * @param {Map<string, object>} [options.scopes] - row id to configForms scope.
 * @returns {object} the mounted plugin, its registrations and recorded errors.
 */
function mount({ scopes = new Map() } = {}) {
  const registrations = []
  const registrationsBySeat = { main: [], 'sidebar.panellist': [] }
  const errors = []
  const effects = []

  const window = {
    __ModuleLoader__: {
      load(registration) {
        registrations.push(registration)
      },
    },
  }

  const slots = {
    /** Run the callback synchronously, as the real inject does once the seat exists. */
    inject(seat, body) {
      const stop = body()
      return typeof stop === 'function' ? stop : () => {}
    },
    register(options, component) {
      registrationsBySeat[options.name]?.push({ options, component })
      return () => {}
    },
  }

  /** Minimal configForms face: `whileServed` fires `get` immediately. */
  const configForms = {
    get(id) {
      return scopes.get(id)
    },
    whileServed(ids, body) {
      const stop = body()
      return typeof stop === 'function' ? stop : () => {}
    },
  }

  const context = {
    slots,
    inject(services, body) {
      // Compare by value, not with `deepEqual`: `services` arrives from inside
      // the VM realm, whose Array has a different prototype, so deepEqual fails
      // with "same structure but are not reference-equal".
      const names = Array.from(services)
      if (names.length !== 1 || names[0] !== 'configForms') {
        throw new Error(`unexpected inject: ${names.join(',')}`)
      }
      const inner = {
        configForms,
        effect(fn, label) {
          effects.push(label)
          const stop = fn()
          return typeof stop === 'function' ? stop : () => {}
        },
      }
      return body(inner)
    },
  }

  const consoleStub = {
    log() {},
    info() {},
    warn() {},
    error: (...args) => errors.push(args.join(' ')),
  }

  const sandbox = { window, console: consoleStub }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: 'endpoint.js' })

  assert.equal(registrations.length, 1, 'the module must register exactly one factory')
  const factory = registrations[0].factory
  const plugin = factory((id) => (id === 'react' ? fakeReact() : undefined))
  plugin.apply(context)

  return { plugin, registration: registrations[0], registrationsBySeat, errors, effects }
}

/**
 * A configForms scope over a fixed config, reporting the layers separately so
 * the panel's precedence can be exercised.
 *
 * @param {object} layers - `{ user, value, base }` config layers.
 * @param {Array<() => void>} listeners - the subscribed listeners.
 * @returns {object} the scope.
 */
function fakeScope(layers, listeners = []) {
  return {
    getSnapshot: () => ({ status: 'ready', ...layers, revision: 1 }),
    subscribe(fn) {
      listeners.push(fn)
      return () => {
        const at = listeners.indexOf(fn)
        if (at >= 0) listeners.splice(at, 1)
      }
    },
  }
}

const FULL = {
  preferred: 'wsl',
  alternatives: ['bash'],
  discouraged: ['pwsh'],
  promptPolicy: true,
  sectionOrder: 3260,
}

console.log('panel: registration')
check('the factory registers under the package name', () => {
  const { registration } = mount()
  assert.equal(registration.id, 'dsh-wsl-first')
})

check('the rail entry and the panel share one id', () => {
  const { registrationsBySeat } = mount({ scopes: new Map([['wsl-first-routing', fakeScope({ value: FULL })]]) })
  const rail = registrationsBySeat['sidebar.panellist']
  const main = registrationsBySeat.main
  assert.equal(rail.length, 1)
  assert.equal(main.length, 1)
  // The layout pairs one rail entry with the main panel under the same id; a
  // mismatch puts the icon in one cell and the panel in another.
  assert.equal(rail[0].options.id, main[0].options.key)
  assert.equal(rail[0].options.id, 'wsl-first')
})

check('the rail label is a thunk so it follows the active locale', () => {
  const { registrationsBySeat } = mount({ scopes: new Map([['wsl-first-routing', fakeScope({ value: FULL })]]) })
  const label = registrationsBySeat['sidebar.panellist'][0].options.label
  assert.equal(typeof label, 'function')
  assert.equal(label(), 'WSL first')
})

check('the rail entry orders after the shipped entries it sits beside', () => {
  const { registrationsBySeat } = mount({ scopes: new Map([['wsl-first-routing', fakeScope({ value: FULL })]]) })
  assert.equal(registrationsBySeat['sidebar.panellist'][0].options.order, 60)
})

check('no panel error is recorded on a normal mount', () => {
  const { errors } = mount({ scopes: new Map([['wsl-first-routing', fakeScope({ value: FULL })]]) })
  assert.deepEqual(errors, [])
})

check('the configForms scope carries a labelled effect', () => {
  const { effects } = mount({ scopes: new Map([['wsl-first-routing', fakeScope({ value: FULL })]]) })
  assert.equal(effects.includes('dsh-wsl-first: panel scope'), true)
})

console.log('panel: rendering')
check('the panel names the preferred executor', () => {
  const { registrationsBySeat } = mount({ scopes: new Map([['wsl-first-routing', fakeScope({ value: FULL })]]) })
  const text = render(registrationsBySeat.main[0].component({ model: registrationsBySeat.main[0].options.inject().model }))
  assert.equal(text.includes('WSL first'), true)
  assert.equal(text.includes('wsl'), true)
})

check('the rail glyph is an svg sized from the owner props', () => {
  const { registrationsBySeat } = mount({ scopes: new Map([['wsl-first-routing', fakeScope({ value: FULL })]]) })
  const glyph = registrationsBySeat['sidebar.panellist'][0].component({ size: 18, active: false })
  assert.equal(glyph.type, 'svg')
  assert.equal(glyph.props.width, 18)
  assert.equal(glyph.props['aria-hidden'], true)
})

check('a larger requested size is honoured', () => {
  const { registrationsBySeat } = mount({ scopes: new Map([['wsl-first-routing', fakeScope({ value: FULL })]]) })
  const glyph = registrationsBySeat['sidebar.panellist'][0].component({ size: 24, active: true })
  assert.equal(glyph.props.width, 24)
})

check('an absent scope renders the waiting state without throwing', () => {
  const { registrationsBySeat } = mount()
  const model = registrationsBySeat.main[0].options.inject().model
  const text = render(registrationsBySeat.main[0].component({ model }))
  assert.equal(text.includes('Waiting'), true)
})

check('promptPolicy false renders the disabled state', () => {
  const scopes = new Map([['wsl-first-routing', fakeScope({ value: { ...FULL, promptPolicy: false } })]])
  const { registrationsBySeat } = mount({ scopes })
  const model = registrationsBySeat.main[0].options.inject().model
  const text = render(registrationsBySeat.main[0].component({ model }))
  assert.equal(text.includes('disabled'), true)
})

check('a scope whose snapshot is not ready renders the unserved state', () => {
  // A scope can exist while its snapshot is still unavailable (the service
  // attached but has not produced a value). That is distinct from "no scope at
  // all": the panel must say the row is unserved rather than keep waiting.
  const pending = {
    getSnapshot: () => undefined,
    subscribe: () => () => {},
  }
  const { registrationsBySeat } = mount({ scopes: new Map([['wsl-first-routing', pending]]) })
  const model = registrationsBySeat.main[0].options.inject().model
  const text = render(registrationsBySeat.main[0].component({ model }))
  assert.equal(text.includes('does not serve the routing row'), true)
})

check('the row override wins over the bundle default', () => {
  // `preferred` differs per layer: the user override must be the one shown.
  const scopes = new Map([['wsl-first-routing', fakeScope({
    base: { ...FULL, preferred: 'wsl' },
    user: { preferred: 'bash' },
  })]])
  const { registrationsBySeat } = mount({ scopes })
  const model = registrationsBySeat.main[0].options.inject().model
  const text = render(registrationsBySeat.main[0].component({ model }))
  assert.equal(text.includes('bash'), true)
  assert.equal(/Reach for first/.test(text), true)
})

check('a scope change re-renders the panel with the new value', () => {
  const listeners = []
  const scope = fakeScope({ value: FULL }, listeners)
  const { registrationsBySeat } = mount({ scopes: new Map([['wsl-first-routing', scope]]) })
  const model = registrationsBySeat.main[0].options.inject().model

  const before = render(registrationsBySeat.main[0].component({ model }))
  assert.equal(before.includes('wsl'), true)

  // Emit through the scope the way the service does, then read it back: the
  // panel must follow without a remount.
  scope.getSnapshot = () => ({
    status: 'ready',
    value: { ...FULL, preferred: 'bash' },
    revision: 2,
  })
  assert.equal(listeners.length > 0, true, 'the model must subscribe to the scope')
  for (const fn of listeners) fn()

  const after = render(registrationsBySeat.main[0].component({ model }))
  assert.equal(after.includes('bash'), true)
})

check('detaching the scope returns the panel to the waiting state', () => {
  const listeners = []
  const scope = fakeScope({ value: FULL }, listeners)
  const { registrationsBySeat } = mount({ scopes: new Map([['wsl-first-routing', scope]]) })
  const model = registrationsBySeat.main[0].options.inject().model
  assert.equal(render(registrationsBySeat.main[0].component({ model })).includes('WSL first'), true)

  // A recomposition drops the scope; the panel must not keep showing stale data.
  for (const fn of listeners) fn()
  const detached = {
    ...model,
    getSnapshot: () => ({ phase: 'waiting', config: undefined, revision: 9 }),
  }
  const text = render(registrationsBySeat.main[0].component({ model: detached }))
  assert.equal(text.includes('Waiting'), true)
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
