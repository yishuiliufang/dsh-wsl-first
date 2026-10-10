/**
 * dsh-wsl-first configuration: one plain object read from the plugin's loader
 * row in `cordis.yml`, validated here.
 *
 * This module deliberately exports no Schemastery `Config`. The host half must
 * resolve with no `@deepseek-ai/*` value import of its own, so validation is
 * explicit and fails loud, naming the offending key — which is what the
 * loader's own schema would have done anyway.
 *
 * Precedence, most specific first: an explicit loader-row config, then the
 * plugin's environment variables, then the built-in defaults.
 *
 * @module dsh-wsl-first/config
 */

/** The tool this plugin prefers when nothing is configured. */
export const DEFAULT_PREFERRED = 'wsl'

/** Tools tried after the preferred one, in order. */
export const DEFAULT_ALTERNATIVES = Object.freeze(['bash'])

/** Tools pushed to last resort. */
export const DEFAULT_DISCOURAGED = Object.freeze(['pwsh'])

/**
 * Default section order. `dsh-ops` publishes its tooling policy at 3250-3252,
 * so routing guidance from this plugin lands just after it and has the final
 * say about which executor to reach for first.
 */
export const DEFAULT_SECTION_ORDER = 3260

/** Stable section name; a scoped section with this name shadows a global one. */
export const DEFAULT_SECTION_NAME = 'dsh-wsl-first:shell-routing'

/**
 * Human-facing task descriptions for known tools, used to build the routing
 * table. A tool with no label here still gets a row, with a generic label.
 */
export const DEFAULT_LABELS = Object.freeze({
  wsl: 'Any command, build, git, pipeline, script, file listing, search',
  'wsl-path': 'Windows <-> Linux path conversion',
  'wsl-env': 'Inspect the WSL distribution, mounts, toolchain',
  'wsl-doctor': 'Check a project toolchain against the distribution',
  bash: 'POSIX commands where WSL is unavailable',
  pwsh: 'Windows-native only: registry, services, COM, cmdlets with no Linux equivalent',
  'pwsh_persistent': 'Windows-native only, persistent session',
})

/** Error raised for a configuration value this plugin cannot honour. */
export class ConfigError extends Error {
  /**
   * @param {string} message - what is wrong and what is accepted.
   */
  constructor(message) {
    super(`dsh-wsl-first config: ${message}`)
    this.name = 'ConfigError'
  }
}

/**
 * Reject a key the plugin does not implement instead of silently ignoring it.
 * @param {Record<string, unknown>} raw - the whole row config.
 * @param {string[]} known - accepted keys.
 * @returns {void}
 */
function rejectUnknownKeys(raw, known) {
  const unknown = Object.keys(raw).filter((key) => !known.includes(key))
  if (unknown.length > 0) {
    throw new ConfigError(
      `unknown key(s) ${unknown.map((key) => JSON.stringify(key)).join(', ')}; `
      + `accepted keys are ${known.map((key) => JSON.stringify(key)).join(', ')}`,
    )
  }
}

/**
 * Read an optional non-empty string.
 * @param {Record<string, unknown>} raw - the whole row config.
 * @param {string} key - the key to read.
 * @returns {string|undefined} the value, or undefined when absent.
 */
function optionalString(raw, key) {
  const value = raw[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ConfigError(`${key} must be a non-empty string, got ${JSON.stringify(value)}`)
  }
  return value
}

/**
 * Read an optional boolean.
 * @param {Record<string, unknown>} raw - the whole row config.
 * @param {string} key - the key to read.
 * @param {boolean} fallback - the value when the key is absent.
 * @returns {boolean} the value.
 */
function optionalBoolean(raw, key, fallback) {
  const value = raw[key]
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'boolean') {
    throw new ConfigError(`${key} must be a boolean, got ${JSON.stringify(value)}`)
  }
  return value
}

/**
 * Read an optional finite number.
 * @param {Record<string, unknown>} raw - the whole row config.
 * @param {string} key - the key to read.
 * @param {number} fallback - the value when the key is absent.
 * @returns {number} the value.
 */
function optionalNumber(raw, key, fallback) {
  const value = raw[key]
  if (value === undefined || value === null) return fallback
  if (!Number.isFinite(value)) {
    throw new ConfigError(`${key} must be a finite number, got ${JSON.stringify(value)}`)
  }
  return Number(value)
}

/**
 * Read an optional list of non-empty strings.
 * @param {Record<string, unknown>} raw - the whole row config.
 * @param {string} key - the key to read.
 * @param {readonly string[]} fallback - the value when the key is absent.
 * @param {{allowEmpty?: boolean}} [options] - whether `[]` is accepted.
 * @returns {string[]} the value.
 */
function optionalStringList(raw, key, fallback, options = {}) {
  const value = raw[key]
  if (value === undefined || value === null) return [...fallback]
  if (!Array.isArray(value)
    || value.some((entry) => typeof entry !== 'string' || entry.trim() === '')) {
    throw new ConfigError(`${key} must be an array of non-empty strings, got ${JSON.stringify(value)}`)
  }
  if (value.length === 0 && options.allowEmpty !== true) {
    throw new ConfigError(`${key} must not be empty`)
  }
  return [...value]
}

/**
 * Read an optional `{tool: label}` map.
 * @param {Record<string, unknown>} raw - the whole row config.
 * @param {string} key - the key to read.
 * @returns {Record<string, string>|undefined} the value, or undefined when absent.
 */
function optionalLabelMap(raw, key) {
  const value = raw[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ConfigError(`${key} must be an object of {tool: label}, got ${JSON.stringify(value)}`)
  }
  const entries = Object.entries(value)
  for (const [tool, label] of entries) {
    if (typeof label !== 'string' || label.trim() === '') {
      throw new ConfigError(`${key}.${tool} must be a non-empty string, got ${JSON.stringify(label)}`)
    }
  }
  return Object.fromEntries(entries)
}

/**
 * Read an environment override, treating an empty value as absent.
 * @param {NodeJS.ProcessEnv} env - the environment to read.
 * @param {string} name - the variable name.
 * @returns {string|undefined} the value, or undefined when unset or empty.
 */
function fromEnv(env, name) {
  const value = env[name]
  if (typeof value !== 'string' || value.trim() === '') return undefined
  return value
}

/**
 * Parse a comma-separated environment list into tool names.
 * @param {string|undefined} value - the raw variable value.
 * @returns {string[]|undefined} the parsed list, or undefined when unset.
 */
function parseEnvList(value) {
  if (value === undefined) return undefined
  const parts = value.split(',').map((part) => part.trim()).filter((part) => part !== '')
  return parts.length === 0 ? undefined : parts
}

/**
 * The resolved configuration, with every default applied.
 * @typedef {object} ResolvedConfig
 * @property {string} preferred - the tool to try first.
 * @property {string[]} alternatives - tools tried after the preferred one.
 * @property {string[]} discouraged - tools pushed to last resort.
 * @property {boolean} promptPolicy - inject the routing prompt section.
 * @property {number} sectionOrder - the section's sort order.
 * @property {string} sectionName - the section's stable name.
 * @property {string} extraGuidance - extra text appended to the section.
 * @property {Record<string, string>} labels - task descriptions per tool.
 * @property {boolean} requirePreferred - only publish the section while the
 *   preferred tool is actually visible to the agent.
 */

/**
 * Validate one plugin row's config and apply defaults.
 *
 * @param {unknown} rawConfig - the `config` value from the loader row.
 * @param {NodeJS.ProcessEnv} [env] - the environment read for overrides.
 * @returns {ResolvedConfig} the resolved configuration.
 * @throws {ConfigError} when a value cannot be honoured.
 */
export function resolveConfig(rawConfig, env = process.env) {
  if (rawConfig === undefined || rawConfig === null) rawConfig = {}
  if (typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
    throw new ConfigError(`config must be an object, got ${JSON.stringify(rawConfig)}`)
  }
  const raw = /** @type {Record<string, unknown>} */ (rawConfig)
  rejectUnknownKeys(raw, [
    'preferred',
    'alternatives',
    'discouraged',
    'promptPolicy',
    'sectionOrder',
    'sectionName',
    'extraGuidance',
    'labels',
    'requirePreferred',
  ])

  const preferred = optionalString(raw, 'preferred')
    ?? fromEnv(env, 'DSH_WSL_FIRST_PREFERRED')
    ?? DEFAULT_PREFERRED

  const alternatives = optionalStringList(
    raw,
    'alternatives',
    parseEnvList(fromEnv(env, 'DSH_WSL_FIRST_ALTERNATIVES')) ?? DEFAULT_ALTERNATIVES,
    { allowEmpty: true },
  )

  const discouraged = optionalStringList(
    raw,
    'discouraged',
    parseEnvList(fromEnv(env, 'DSH_WSL_FIRST_DISCOURAGED')) ?? DEFAULT_DISCOURAGED,
    { allowEmpty: true },
  )

  // `preferred` is the most specific tier, so naming it again among the
  // fallbacks is redundant rather than contradictory — and it happens by
  // default whenever an operator points `preferred` at the default fallback
  // (`bash`). Drop it there instead of failing a reasonable configuration.
  const fallbacks = alternatives.filter((tool) => tool !== preferred)

  // A tool that is both a preferred executor and a last resort IS a genuine
  // contradiction, so say so rather than letting a silent winner decide.
  for (const tool of [preferred, ...fallbacks]) {
    if (discouraged.includes(tool)) {
      throw new ConfigError(
        `${JSON.stringify(tool)} cannot be both preferred or an alternative and discouraged`,
      )
    }
  }

  const labels = { ...DEFAULT_LABELS, ...(optionalLabelMap(raw, 'labels') ?? {}) }

  return {
    preferred,
    alternatives: fallbacks,
    discouraged,
    promptPolicy: optionalBoolean(raw, 'promptPolicy', true),
    sectionOrder: optionalNumber(raw, 'sectionOrder', DEFAULT_SECTION_ORDER),
    sectionName: optionalString(raw, 'sectionName') ?? DEFAULT_SECTION_NAME,
    extraGuidance: optionalString(raw, 'extraGuidance') ?? '',
    labels,
    requirePreferred: optionalBoolean(raw, 'requirePreferred', false),
  }
}
