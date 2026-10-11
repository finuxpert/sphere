// Pure operator focus rules: highlighting cannot alter retained trace samples.
import { shortHost } from './sapUiFormat.js'
export function resolveTrendFocus(manualHost, selectedHost = '', hosts = []) {
  const requested = manualHost === null ? selectedHost : manualHost
  return hosts.includes(requested) ? requested : ''
}

export function trendFocusStyle(host, focused = '', availability = false) {
  const isFocused = Boolean(focused) && host === focused
  const isDimmed = Boolean(focused) && !isFocused
  return {
    width: isFocused ? 2.8 : availability ? 1.5 : 1.8,
    opacity: isFocused ? 1 : isDimmed ? 0.26 : availability ? 0.72 : 1,
    itemOpacity: isDimmed ? 0.36 : 1,
  }
}

export function trendHostColorIndex(host, fallbackIndex = 0, paletteSize = 5) {
  const index = /^APP([1-9]\d*)$/i.exec(String(host || ''))
  const ordinal = index ? Number(index[1]) - 1 : fallbackIndex
  const count = Math.max(1, Number(paletteSize) || 5)
  return ((ordinal % count) + count) % count
}


// Focus options are grounded in observed SAP hosts or saved trend samples.
// Hosts remain selectable while individual trend series are still loading.
export function trendFocusHosts(sourceHosts = [], trendRows = []) {
  const labels = [...sourceHosts, ...trendRows]
    .map(row => shortHost(row?.host || ''))
    .filter(label => /^APP[1-9][0-9]*$/i.test(label))
  return [...new Set(labels)].sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)))
}
