import React from 'react'
import { appSignalState } from './rundeckUnifiedHost.js'
import { formatWib } from './sapUiFormat.js'

/** Current fleet numbers are valid only for an aligned, verified SAP snapshot.
 * Unknown or incomplete WP fields must not be silently counted as zero.
 */
function summarizeOperationsFleet(hosts = [], quality = null) {
  const verified = quality?.performanceValid === true && !quality?.collectorBad
  if (!verified || !Array.isArray(hosts) || hosts.length === 0) return null
  const states = hosts.map(host => appSignalState(host, true))
  const wpValues = hosts.map(host => host?.wp_critical)
  const wpComplete = wpValues.every(value => value !== null && value !== undefined && value !== '' &&
    Number.isSafeInteger(Number(value)) && Number(value) >= 0)
  return {
    total: hosts.length,
    affected: states.filter(state => ['ATTENTION', 'WARNING', 'CRITICAL'].includes(state)).length,
    unknown: states.filter(state => state === 'UNKNOWN').length,
    wpTotal: wpComplete ? wpValues.reduce((sum, value) => sum + Number(value), 0) : null,
    wpHosts: wpComplete ? wpValues.filter(value => Number(value) > 0).length : null,
  }
}

export default function RundeckOperationsSummary({
  hosts = [], sourceQuality = null, evaluationSummary = null, onOpenReview = null,
}) {
  const fleet = summarizeOperationsFleet(hosts, sourceQuality)
  const reviewKnown = evaluationSummary && Number.isSafeInteger(evaluationSummary.review)
  const latestHost = fleet ? hosts.map(item => item?.collected_at).filter(Boolean).sort().at(-1) : null
  const hostEvidence = latestHost ? formatWib(latestHost, true) + ' WIB' : 'time unverified'
  const reviewEvidence = evaluationSummary?.end ? formatWib(evaluationSummary.end, true) + ' WIB' : 'time unverified'
  return <section className="rundeckOperationsSummary" aria-label="SAP operations summary">
    <div className="rundeckOpsPulseItem">
      <small>APP Servers</small>
      <strong>{fleet ? fleet.total : '—'}</strong>
      <span title={'Current verified SAP APP sample · ' + hostEvidence}>{fleet ? 'Verified snapshot' : 'Unverified'}</span>
    </div>
    <div className={'rundeckOpsPulseItem' + (fleet?.affected ? ' is-attention' : '')}>
      <small>APP Attention</small>
      <strong>{fleet ? fleet.affected : '—'}</strong>
      <span>{fleet ? (fleet.unknown ? fleet.unknown + ' additional unknown' : 'Hosts requiring checks') : 'Status unavailable'}</span>
    </div>
    <div className={'rundeckOpsPulseItem' + (fleet?.wpTotal > 0 ? ' is-critical' : '')}>
      <small>Critical WP</small>
      <strong>{fleet?.wpTotal ?? '—'}</strong>
      <span>{fleet?.wpHosts != null ? fleet.wpHosts + ' APP affected' : 'WP data unverified'}</span>
    </div>
    <button type="button" className="rundeckOpsPulseItem is-action" disabled={!reviewKnown || !onOpenReview}
      onClick={() => onOpenReview?.()} title={'Saved 24h workload review · ' + reviewEvidence + ' · not confirmed SM37 failed jobs'}>
      <small>Workloads Review</small>
      <strong>{reviewKnown ? evaluationSummary.review : '—'}</strong>
      <span>{reviewKnown ? 'Saved 24h · Open Review' : 'Evaluation unverified'}</span>
    </button>
  </section>
}
