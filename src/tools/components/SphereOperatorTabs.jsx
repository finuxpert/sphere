import React from 'react'

/**
 * Shared two-or-more-option operator view switch.
 * aria-pressed preserves the existing accessible button-group contract;
 * this is not a route, a tabpanel, or a source of new operational data.
 */
export default function SphereOperatorTabs({ label, value, options, onChange, className = '' }) {
  return <div className={['sphereOperatorTabs', className].filter(Boolean).join(' ')}
    role="group" aria-label={label}>
    {options.map(({ value: option, label: name, disabled = false }) =>
      <button key={option} type="button" aria-pressed={value === option}
        disabled={disabled} onClick={() => onChange(option)}>
        {name}
      </button>
    )}
  </div>
}
