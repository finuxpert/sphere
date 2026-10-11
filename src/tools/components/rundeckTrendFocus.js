// Pure operator focus rules: highlighting cannot alter retained trace samples.
export function resolveTrendFocus(manualHost, selectedHost = '', hosts = []) {
  const requested = manualHost === null ? selectedHost : manualHost
  return hosts.includes(requested) ? requested : ''
}

export function trendFocusStyle(host, focused = '', availability = false) {
  const isFocused = Boolean(focused) && host === focused
  const isDimmed = Boolean(focused) && !isFocused
  return {
    width: isFocused ? 2.8 : availability ? 1.5 : 1.8,
    opacity: isDimmed ? 0.26 : availability ? 0.72 : 1,
    itemOpacity: isDimmed ? 0.36 : 1,
  }
}
