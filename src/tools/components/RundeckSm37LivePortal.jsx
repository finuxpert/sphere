import React from 'react'
import { createPortal } from 'react-dom'
import RundeckSm37Verification from './RundeckSm37Verification.jsx'

const API = `${import.meta.env.BASE_URL}api`

export default function RundeckSm37LivePortal({ selectedJob, refreshToken = '' }) {
  const [target, setTarget] = React.useState(null)
  const [context, setContext] = React.useState(null)

  React.useEffect(() => {
    let frame = 0
    let observer = null
    const locate = () => {
      const node = document.querySelector('.rundeckJobHistory .rundeckSm37Verification')
      if (node) {
        node.classList.add('has-dynamic-verification')
        setTarget(node)
        return true
      }
      return false
    }
    if (!locate()) {
      observer = new MutationObserver(() => locate())
      observer.observe(document.body, { childList: true, subtree: true })
      frame = window.requestAnimationFrame(locate)
    }
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      observer?.disconnect()
      document.querySelectorAll('.rundeckSm37Verification.has-dynamic-verification').forEach((node) => node.classList.remove('has-dynamic-verification'))
    }
  }, [selectedJob?.key])

  React.useEffect(() => {
    if (!selectedJob?.key) {
      setContext(null)
      return undefined
    }
    const controller = new AbortController()
    const params = new URLSearchParams({ job: selectedJob.key, days: '90', limit: '20' })
    if (selectedJob.host) params.set('host', selectedJob.host)
    if (selectedJob.consumerType) params.set('type', selectedJob.consumerType)
    fetch(`${API}/history/job?${params.toString()}`, { cache: 'no-store', signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`history ${response.status}`)))
      .then((history) => {
        const items = history?.items || []
        const targetAt = Date.parse(selectedJob.at || '')
        const row = Number.isFinite(targetAt)
          ? items.reduce((best, item) => {
              const at = Date.parse(item?.collected_at || '')
              if (!Number.isFinite(at)) return best
              if (!best) return item
              return Math.abs(at - targetAt) < Math.abs(Date.parse(best.collected_at) - targetAt) ? item : best
            }, null)
          : items[0] || null
        const details = row?.details || {}
        const isJob = String(selectedJob.consumerType || row?.consumer_type || '').toUpperCase() === 'JOB'
        setContext({
          jobName: String(details.job_name || (isJob ? selectedJob.key : '') || '').trim(),
          program: String(details.program || '').trim(),
          host: row?.host || selectedJob.host || '',
          observedAt: row?.collected_at || selectedJob.at || '',
        })
      })
      .catch((error) => { if (error.name !== 'AbortError') setContext({ jobName: selectedJob.key, program: '', host: selectedJob.host || '', observedAt: selectedJob.at || '' }) })
    return () => controller.abort()
  }, [refreshToken, selectedJob?.at, selectedJob?.consumerType, selectedJob?.host, selectedJob?.key])

  if (!target || !context?.jobName) return null
  return createPortal(
    <div className="rundeckSm37VerificationDynamic">
      <RundeckSm37Verification {...context} refreshToken={refreshToken} />
    </div>,
    target,
  )
}
