import React from 'react'
import { getCurrentHashRoute } from '../app/routeUtils.js'
import { APP_BUILD_LABEL, APP_DISPLAY_VERSION, APP_NAME, APP_PREVIOUS_VERSION, APP_TAGLINE, APP_VERSION } from '../app/version.js'
import { tools, preloadTool } from '../tools'
import SphereLogo from './SphereLogo.jsx'

const MOBILE_TOOL_LABELS = {
  analyzer: 'ST03N',
  logs: 'LOG',
}

const MOBILE_TOOL_SUB = {
  analyzer: 'Workload',
  logs: 'Resources',
}

function canAnimateNavigation(event) {
  if (event.defaultPrevented || event.button !== 0) return false
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false
  return typeof document.startViewTransition === 'function'
}

function navigateWorkspace(event, href, slug) {
  preloadTool?.(slug)
  if (!canAnimateNavigation(event)) return
  event.preventDefault()
  document.startViewTransition(() => {
    window.location.hash = href
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
}

export default function Navbar() {
  const [route, setRoute] = React.useState(getCurrentHashRoute)
  const [themeMode, setThemeMode] = React.useState(() => {
    try { return window.localStorage.getItem('sphere.theme') || 'dark' } catch { return 'dark' }
  })
  const [resolvedTheme, setResolvedTheme] = React.useState('dark')

  React.useEffect(() => {
    const onHash = () => setRoute(getCurrentHashRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  React.useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: light)')
    const apply = () => {
      const resolved = themeMode === 'system' ? (media?.matches ? 'light' : 'dark') : themeMode
      setResolvedTheme(resolved)
      document.documentElement.dataset.theme = resolved
      document.documentElement.dataset.themeMode = themeMode
      document.documentElement.style.colorScheme = resolved
    }
    apply()
    media?.addEventListener?.('change', apply)
    try { window.localStorage.setItem('sphere.theme', themeMode) } catch {/* preference storage is best effort */}
    return () => media?.removeEventListener?.('change', apply)
  }, [themeMode])

  const isActive = React.useCallback(
    (href) => route === href || route.startsWith(`${href}/`),
    [route],
  )

  return (
    <>
      <header className="navbar sphereNav">
        <div className="navInner sphereNavInner">
          <a className="brand sphereBrand" href="#/tool/logs" aria-label={`${APP_NAME} ${APP_DISPLAY_VERSION} LOG analysis`}>
            <SphereLogo theme={resolvedTheme} />
            <span className="brandText">
              <span className="brandTitle">{APP_TAGLINE}</span>
              <span className="brandSub" title={`Previous release: v${APP_PREVIOUS_VERSION}`}>{APP_BUILD_LABEL}</span>
            </span>
          </a>

          <nav className="navQuick sphereToolTabs" aria-label={`${APP_NAME} SAP analysis workspaces`}>
            {tools.map((tool) => {
              const href = `/tool/${tool.slug}`
              const active = isActive(href)
              return (
                <a
                  key={tool.slug}
                  href={`#${href}`}
                  data-active={active ? 'true' : 'false'}
                  aria-current={active ? 'page' : undefined}
                  onClick={(event) => navigateWorkspace(event, href, tool.slug)}
                  onMouseEnter={() => preloadTool?.(tool.slug)}
                  onFocus={() => preloadTool?.(tool.slug)}
                >
                  {tool.title}
                </a>
              )
            })}
          </nav>

          <label className="sphereThemeControl" title="Display theme">
            <span>Theme</span>
            <select aria-label="Display theme" value={themeMode} onChange={(event) => {
              const next = event.target.value
              try { window.localStorage.setItem('sphere.theme', next) } catch {/* preference storage is best effort */}
              setThemeMode(next)
              window.setTimeout(() => window.location.reload(), 0)
            }}>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="system">System</option>
            </select>
          </label>
          <span className="mobileVersionBadge" aria-label={`Version ${APP_VERSION}`} title={APP_BUILD_LABEL}>v{APP_VERSION}</span>
        </div>
      </header>

      <nav className="mobileAnalysisNav" aria-label={`Mobile ${APP_NAME} SAP analysis navigation`}>
        {tools.map((tool) => {
          const href = `/tool/${tool.slug}`
          const active = isActive(href)
          return (
            <a
              key={tool.slug}
              href={`#${href}`}
              data-active={active ? 'true' : 'false'}
              aria-current={active ? 'page' : undefined}
              onClick={(event) => navigateWorkspace(event, href, tool.slug)}
              onTouchStart={() => preloadTool?.(tool.slug)}
              onFocus={() => preloadTool?.(tool.slug)}
            >
              <strong>{MOBILE_TOOL_LABELS[tool.slug] || tool.title}</strong>
              <small>{MOBILE_TOOL_SUB[tool.slug] || tool.short}</small>
            </a>
          )
        })}
      </nav>
    </>
  )
}
