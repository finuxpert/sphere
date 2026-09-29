import React from 'react'
import '../app/sphere-logo.css'

const BASE_URL = import.meta.env.BASE_URL

export default function SphereLogo({ compact = false, theme = 'dark' }) {
  const variant = theme === 'light' ? 'light' : 'dark'
  return (
    <span className={`sphereLogo ${compact ? 'compact' : ''}`} aria-hidden="true">
      <picture>
        <source srcSet={`${BASE_URL}branding/logo/sphere-logo-navbar-${variant}.webp`} type="image/webp" />
        <img
          className="sphereLogoImage"
          src={`${BASE_URL}branding/logo/sphere-logo-navbar-${variant}.png`}
          alt=""
          decoding="async"
          fetchPriority="high"
        />
      </picture>
    </span>
  )
}
