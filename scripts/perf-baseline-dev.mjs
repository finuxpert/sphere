/** Read-only, bounded SPHERE DEV API performance baseline. Never triggers collectors or writes data. */
import { performance } from 'node:perf_hooks'
import { setTimeout as sleep } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'

export const SCENARIOS = Object.freeze([
  ['cpu_1d', '/history/trend?range=24h&bucket=auto&metric=cpu'],
  ['cpu_7d', '/history/trend?range=7d&bucket=auto&metric=cpu'],
  ['cpu_30d', '/history/trend?range=30d&bucket=auto&metric=cpu'],
  ['cpu_3m', '/history/trend?range=90d&bucket=auto&metric=cpu'],
  ['cpu_6m', '/history/trend?range=180d&bucket=auto&metric=cpu'],
  ['ram_1d', '/history/trend?range=24h&bucket=auto&metric=ram'],
  ['network_rx_1d', '/history/trend?range=24h&bucket=auto&metric=network_rx'],
  ['critical_wp_1d', '/history/trend?range=24h&bucket=auto&metric=wp'],
  ['workload_review_1d', '/evaluation/workloads?period=1d&limit=30'],
])

export function parseOptions(argv) {
  const options = { baseUrl: 'http://127.0.0.1:8091', samples: 5, warmup: 1, delayMs: 300, allowRemote: false }
  for (const arg of argv) {
    if (arg === '--allow-remote') options.allowRemote = true
    else if (arg.startsWith('--base-url=')) options.baseUrl = arg.slice(11)
    else if (arg.startsWith('--samples=')) options.samples = Number(arg.slice(10))
    else if (arg.startsWith('--delay-ms=')) options.delayMs = Number(arg.slice(11))
    else throw new Error('Unknown argument: ' + arg)
  }
  if (!Number.isInteger(options.samples) || options.samples < 1 || options.samples > 30)
    throw new Error('--samples must be between 1 and 30')
  if (!Number.isInteger(options.delayMs) || options.delayMs < 0 || options.delayMs > 10000)
    throw new Error('--delay-ms must be between 0 and 10000')
  const url = new URL(options.baseUrl)
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new Error('HTTP(S) URL without credentials, query or fragment required')
  if (!loopback && !options.allowRemote)
    throw new Error('Remote DEV API requires --allow-remote')
  const path = url.pathname.replace(/\/$/, '')
  if (path && path !== '/dev/api') throw new Error('Only root (direct DEV) or /dev/api is permitted')
  if (!path && (!loopback || url.port !== '8091'))
    throw new Error('Direct DEV access requires loopback port 8091; PROD port 8092 forbidden')
  if (!loopback && path !== '/dev/api') throw new Error('Remote endpoint must use /dev/api')
  options.baseUrl = url.origin + path
  return options
}

export function percentile(values, probability) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return Number(sorted[Math.max(0, Math.ceil(sorted.length * probability) - 1)].toFixed(2))
}

export function summarize(samples) {
  const ok = samples.filter(x => x.ok)
  const latency = ok.map(x => x.ms)
  const sizes = ok.map(x => x.bytes)
  return {
    attempted: samples.length, succeeded: ok.length, failed: samples.length - ok.length,
    statuses: samples.reduce((o, x) => { const k = String(x.status ?? 'NETWORK_ERROR'); o[k] = (o[k] || 0) + 1; return o }, {}),
    latency_ms: { p50: percentile(latency, .5), p95: percentile(latency, .95), p99: percentile(latency, .99) },
    median_response_kib: sizes.length ? Number((percentile(sizes, .5) / 1024).toFixed(2)) : null,
  }
}

export async function measure(baseUrl, scenario, options, fetchImpl = fetch, clock = () => performance.now()) {
  const results = []
  for (let i = 0; i < options.samples + options.warmup; i++) {
    const before = clock()
    let sample
    try {
      const response = await fetchImpl(baseUrl + scenario[1], {
        method: 'GET', cache: 'no-store', signal: AbortSignal.timeout(15000),
      })
      const bytes = (await response.arrayBuffer()).byteLength
      sample = { ok: response.ok, status: response.status, ms: clock() - before, bytes }
    } catch (error) {
      sample = { ok: false, status: null, ms: clock() - before, bytes: 0, error: error?.name || 'RequestError' }
    }
    if (i >= options.warmup) results.push(sample)
    if (options.delayMs && i + 1 < options.samples + options.warmup) await sleep(options.delayMs)
  }
  return { name: scenario[0], path: scenario[1], ...summarize(results) }
}

export async function run(options, fetchImpl = fetch) {
  const measurements = []
  for (const scenario of SCENARIOS) {
    measurements.push(await measure(options.baseUrl, scenario, options, fetchImpl))
    if (options.delayMs) await sleep(options.delayMs)
  }
  return {
    environment: 'DEV', collected_at: new Date().toISOString(),
    base_url: options.baseUrl, samples_per_endpoint: options.samples,
    method: 'sequential GET incl. response body, one warmup excluded',
    limitations: [
      'Small-sample p99 is indicative, not SLO-grade evidence.',
      'Latency includes network; it is not PostgreSQL-only execution time.',
      'HTTP 200 is not a data quality verdict. Missing SAP observations remain missing.',
      'Does not measure browser LCP, INP, ECharts rendering or collector ingestion.',
    ],
    measurements,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await run(parseOptions(process.argv.slice(2)))
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    if (result.measurements.some(x => x.failed)) process.exitCode = 1
  } catch (error) {
    process.stderr.write('SPHERE DEV performance baseline: ' + error.message + '\n')
    process.exitCode = 2
  }
}
