import { filesystemResourceState } from './rundeckStatusSemantics.js'

const numeric = value => {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

export function infrastructureMetric(value, suffix = '') {
  const number = numeric(value)
  return number === null ? '—' : number.toLocaleString('en-US', { maximumFractionDigits: 1 }) + suffix
}

export const filesystemDisplayState = filesystemResourceState

export function storageUtilizationState(value) {
  const number = numeric(value)
  if (number === null) return 'UNKNOWN'
  if (number >= 95) return 'CRITICAL'
  if (number >= 80) return 'ATTENTION'
  return 'NORMAL'
}

/** Missing observations cannot be summarized as healthy capacity. */
export function worstInfrastructureState(states = []) {
  if (!states.length) return 'UNKNOWN'
  if (states.includes('CRITICAL')) return 'CRITICAL'
  if (states.includes('ATTENTION')) return 'ATTENTION'
  if (states.includes('UNKNOWN')) return 'UNKNOWN'
  return states.every(state => state === 'NORMAL') ? 'NORMAL' : 'UNKNOWN'
}
