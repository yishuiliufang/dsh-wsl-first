/**
 * dsh-wsl-first client half.
 *
 * Adds one rail entry and the panel behind it, so an operator can see what this
 * plugin actually decided — which executor the routing section names first,
 * whether the section is publishing at all, and what the fallback order is.
 *
 * The panel is read-only on purpose: the routing is configured by the bundle row
 * in `cordis.patch.yml`, and a second write path through a form would give the
 * same setting two owners that can disagree.
 *
 * Layout facts this file depends on (verified against the shipped client):
 *   - `sidebar.panellist` entries carry `id`, `order` and `label`, and draw
 *     their own glyph (there is no icon field).
 *   - `main` is keyed by that same id, and its `inject` callback supplies extra
 *     props to the panel component.
 *   - `ctx.configForms.get(rowId)` returns a scope with `getSnapshot()` and
 *     `subscribe(listener)`; a snapshot is
 *     `{ status, value, base, user, writable, revision }`.
 */

window.__ModuleLoader__.load({
  id: 'dsh-wsl-first',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    /** Panel identity. The rail entry and the main panel must agree. */
    const PANEL_ID = 'wsl-first'
    /** The Loader row whose config this panel reads. */
    const CONFIG_ROW_ID = 'wsl-first-routing'

    /**
     * The fields the panel shows, with the row's own override taking precedence
     * over the bundle default — the same resolution the Host applies.
     * @param {object|undefined} scope - a configForms scope.
     * @returns {object|undefined} the effective config, or undefined.
     */
    function readConfig(scope) {
      let snap
      try {
        snap = scope?.getSnapshot?.()
      } catch {
        return undefined
      }
      if (snap === undefined || snap === null) return undefined
      /** First object that actually carries the key wins. */
      const pick = (key) => {
        for (const layer of [snap.user, snap.value, snap.base]) {
          if (layer && typeof layer === 'object' && key in layer) return layer[key]
        }
        return undefined
      }
      return {
        preferred: pick('preferred'),
        alternatives: pick('alternatives'),
        discouraged: pick('discouraged'),
        promptPolicy: pick('promptPolicy'),
        sectionOrder: pick('sectionOrder'),
      }
    }

    /**
     * One observable the panel renders from.
     *
     * The panel cannot read `configForms` synchronously: the service may mount
     * after this plugin, so the scope arrives later. A plain object would leave
     * the panel stuck on "waiting" forever, because nothing would tell React the
     * scope had appeared. This model notifies on attach AND forwards every scope
     * change into the same listener set, so one subscription covers both.
     * @returns {object} the model: `subscribe`, `getSnapshot`, `attach`, `detach`.
     */
    function createModel() {
      const listeners = new Set()
      let scope
      let stopScope
      let snapshot = { phase: 'waiting', config: undefined, revision: 0 }

      const emit = () => {
        snapshot = { phase: 'ready', config: readConfig(scope), revision: snapshot.revision + 1 }
        for (const fn of Array.from(listeners)) {
          try {
            fn()
          } catch (error) {
            console.error('dsh-wsl-first: a panel listener failed', error)
          }
        }
      }

      return {
        /** @param {() => void} fn - the listener. @returns {() => void} unsubscribe. */
        subscribe(fn) {
          listeners.add(fn)
          return () => listeners.delete(fn)
        },
        /** @returns {object} a cached snapshot, stable between notifications. */
        getSnapshot: () => snapshot,
        /** @param {object} next - the scope to read from. */
        attach(next) {
          if (next === undefined || next === null) return
          scope = next
          try {
            const stop = scope.subscribe?.(emit)
            stopScope = typeof stop === 'function' ? stop : undefined
          } catch (error) {
            console.error('dsh-wsl-first: subscribing to the routing scope failed', error)
          }
          emit()
        },
        /** Drop the scope and the subscription; the panel returns to waiting. */
        detach() {
          try {
            stopScope?.()
          } catch {
            /* a failing disposer must not block the next attach */
          }
          stopScope = undefined
          scope = undefined
          snapshot = { phase: 'waiting', config: undefined, revision: snapshot.revision + 1 }
          for (const fn of Array.from(listeners)) {
            try {
              fn()
            } catch {
              /* one bad listener does not stop the rest */
            }
          }
        },
      }
    }

    /** Shared inline styles; containers and controls inherit the host theme. */
    const S = {
      page: {
        padding: '24px 28px',
        maxWidth: '720px',
        color: 'inherit',
        fontSize: '13px',
        lineHeight: 1.7,
      },
      title: { fontSize: '15px', fontWeight: 600, margin: '0 0 4px' },
      lead: { margin: '0 0 20px', opacity: 0.72 },
      card: {
        border: '1px solid var(--dsh-border-subtle, rgba(127,127,127,.24))',
        borderRadius: '10px',
        padding: '14px 16px',
        marginBottom: '12px',
      },
      label: { fontSize: '12px', opacity: 0.62, marginBottom: '6px' },
      value: { fontFamily: 'var(--dsh-font-mono, ui-monospace, monospace)' },
      chips: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
      chip: {
        border: '1px solid var(--dsh-border-subtle, rgba(127,127,127,.3))',
        borderRadius: '999px',
        padding: '1px 9px',
        fontSize: '12px',
      },
      chipLead: {
        border: '1px solid var(--dsh-accent, #3b82f6)',
        borderRadius: '999px',
        padding: '1px 9px',
        fontSize: '12px',
        fontWeight: 600,
      },
      note: { marginTop: '18px', fontSize: '12px', opacity: 0.62 },
      waiting: {
        border: '1px solid var(--dsh-border-subtle, rgba(127,127,127,.24))',
        borderRadius: '10px',
        padding: '14px 16px',
        opacity: 0.8,
      },
    }

    /** @param {unknown} value - a config field. @returns {string[]} its string items. */
    const asList = (value) =>
      Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []

    /**
     * The panel behind the rail entry.
     * @param {object} props - injected props carrying the model.
     * @returns {object} the rendered panel.
     */
    function WslFirstPanel(props) {
      const model = props?.model
      const snap = React.useSyncExternalStore(
        model.subscribe,
        model.getSnapshot,
        model.getSnapshot,
      )

      if (snap.phase !== 'ready') {
        return h('div', { style: S.page },
          h('h2', { style: S.title }, 'WSL first'),
          h('div', { style: S.waiting },
            'Waiting for this Host to expose the routing row…'),
        )
      }

      const config = snap.config
      if (config === undefined) {
        return h('div', { style: S.page },
          h('h2', { style: S.title }, 'WSL first'),
          h('div', { style: S.waiting },
            'This profile does not serve the routing row, so its settings cannot be shown.'),
        )
      }

      const leader = typeof config.preferred === 'string' && config.preferred !== ''
        ? config.preferred
        : undefined
      const fallbacks = asList(config.alternatives).filter((tool) => tool !== leader)
      const last = asList(config.discouraged)
      const publishing = config.promptPolicy !== false

      return h('div', { style: S.page },
        h('h2', { style: S.title }, 'WSL first'),
        h('p', { style: S.lead },
          'Which command executor the agent reaches for first. This section is published '
          + 'into the system prompt before each model step; it grants no tool and hides none.'),

        h('div', { style: S.card },
          h('div', { style: S.label }, 'Reach for first'),
          leader
            ? h('div', { style: S.chips }, h('span', { style: S.chipLead }, leader))
            : h('div', { style: S.value }, '(none — no executor is named first)'),
        ),

        h('div', { style: S.card },
          h('div', { style: S.label }, 'Fall back to'),
          fallbacks.length
            ? h('div', { style: S.chips },
                fallbacks.map((tool, index) =>
                  h('span', { key: tool + index, style: S.chip }, tool)))
            : h('div', { style: S.value }, '(no fallback configured)'),
        ),

        h('div', { style: S.card },
          h('div', { style: S.label }, 'Last resort'),
          last.length
            ? h('div', { style: S.chips },
                last.map((tool, index) =>
                  h('span', { key: tool + index, style: S.chip }, tool)))
            : h('div', { style: S.value }, '(nothing is discouraged)'),
        ),

        h('div', { style: S.card },
          h('div', { style: S.label }, 'Prompt section'),
          h('div', { style: S.value },
            publishing
              ? 'published' + (typeof config.sectionOrder === 'number'
                  ? ' · order ' + config.sectionOrder
                  : '')
              : 'disabled (promptPolicy is false)'),
        ),

        h('p', { style: S.note },
          'Only executors this profile actually registers are named. Change the routing in this '
          + 'bundle\'s cordis.patch.yml and restart the profile.'),
      )
    }

    /**
     * The rail glyph: a terminal chevron over a shell wave, sized to the row's
     * request and drawn in the row's own colour.
     * @param {object} props - owner props (`size`, `active`).
     * @returns {object} the glyph.
     */
    function WslFirstIcon(props) {
      const size = Number(props?.size) || 18
      return h('svg', {
        viewBox: '0 0 24 24',
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
        style: { display: 'block' },
      },
        // The prompt chevron: what "run a command" looks like.
        h('path', { d: 'M5 6.5 9.5 11 5 15.5' }),
        h('path', { d: 'M11.5 16.5 H18' }),
        // The wave under it: this executor is the Linux side of the machine.
        h('path', {
          d: 'M3 20.2c1.6 0 1.6-1.4 3.2-1.4s1.6 1.4 3.2 1.4 1.6-1.4 3.2-1.4 1.6 1.4 3.2 1.4 1.6-1.4 3.2-1.4',
        }),
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const model = createModel()

        // The two seats are registered from the innermost callback, exactly as
        // the shipped panels do: the rail entry and the panel it opens appear
        // together or not at all.
        try {
          if (ctx.slots === undefined || ctx.slots === null) {
            console.error('dsh-wsl-first: this DSH has no slots service; the panel stays unmounted')
            return
          }
          ctx.slots.inject('main', () =>
            ctx.slots.inject('sidebar.panellist', () => {
              const stopMain = ctx.slots.register(
                { name: 'main', key: PANEL_ID, inject: () => ({ model }) },
                WslFirstPanel,
              )
              const stopIcon = ctx.slots.register(
                { name: 'sidebar.panellist', id: PANEL_ID, order: 60, label: () => 'WSL first' },
                WslFirstIcon,
              )
              return () => {
                if (typeof stopIcon === 'function') stopIcon()
                if (typeof stopMain === 'function') stopMain()
              }
            }),
          )
        } catch (error) {
          console.error('dsh-wsl-first: registering the WSL panel failed', error)
        }

        // `configForms` is reached through `ctx.inject`, never through this
        // module's `inject` array: the panel is a convenience, not a reason to
        // refuse to mount on a composition that ships no settings service.
        try {
          if (typeof ctx.inject === 'function') {
            ctx.inject(['configForms'], (inner) => {
              const configForms = inner.configForms
              if (configForms === undefined || configForms === null) return
              if (typeof inner.effect === 'function') {
                inner.effect(() => () => model.detach(), 'dsh-wsl-first: panel scope')
              }
              if (typeof configForms.whileServed !== 'function') {
                // Older Host face: no gate to wait on, so take whatever it gives
                // and let the panel report the truth.
                model.attach(configForms.get?.(CONFIG_ROW_ID))
                return
              }
              return configForms.whileServed([CONFIG_ROW_ID], () => {
                model.attach(configForms.get(CONFIG_ROW_ID))
                return () => model.detach()
              })
            })
          }
        } catch (error) {
          console.error('dsh-wsl-first: reading the routing configuration failed', error)
        }
      },
    }
  },
})
