/* Monthly report deliberately reuses the restrained SPHERE landscape visual language.
 * It contains stored observations only; no inferred root cause or SM37 run totals. */
import { APP_DISPLAY_VERSION } from '../../app/version.js'

const HEX = [[35, 166, 183], [93, 134, 201], [155, 110, 199], [201, 142, 76], [84, 160, 123]]
const labelHost = value => {
  const raw = String(value || '').split('.')[0].toUpperCase()
  const app = raw.match(/(?:AOPH([1-5])PAPPDC|^APP([1-5])$)/)
  return app ? 'APP' + (app[1] || app[2]) : raw
}
const format = (value, digits = 1) => value === null || value === undefined || !Number.isFinite(Number(value))
  ? 'N/A' : Number(value).toLocaleString('en-US', { maximumFractionDigits: digits })
const pct = value => format(value) === 'N/A' ? 'N/A' : format(value) + '%'
const dateWib = value => value ? new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(value)) + ' WIB' : 'Not observed'

const errorCategoryLabel = (category, fallback) => ({
  MEMORY: 'Memory', LOCK: 'Lock / Deadlock', DATABASE: 'Database',
  RUNTIME: 'Runtime / Timeout', RFC: 'RFC / Network',
  APPLICATION: 'ABAP Application', ABAP_DATA: 'ABAP Data', OTHER: 'Other',
})[category] || fallback || 'Other'

function drawMultiHostChart(pdf, rows, key, label, x, y, w, h, month, threshold) {
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(22, 35, 43)
  pdf.setFontSize(8.6)
  pdf.text(label, x, y - 2)
  const chartY = y + 1
  pdf.setFillColor(255, 255, 255)
  pdf.roundedRect(x, chartY, w, h, 1, 1, 'F')
  const left = x + 9
  const top = chartY + 3
  const plotH = h - 11
  const plotW = w - 15
  const [year, monthNum] = month.split('-').map(Number)
  const days = new Date(Date.UTC(year, monthNum, 0)).getUTCDate()
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(6.2)
  ;[0, 50, 100].forEach(level => {
    const yy = top + plotH * (1 - level / 100)
    pdf.setDrawColor(226, 232, 236)
    pdf.setLineWidth(.12)
    pdf.line(left, yy, left + plotW, yy)
    pdf.setTextColor(85, 104, 117)
    pdf.text(String(level), x + 1.2, yy + .8)
  })
  ;[1, 10, 20, days].forEach(day => {
    const xx = left + plotW * (day - 1) / Math.max(1, days - 1)
    pdf.setTextColor(85, 104, 117)
    pdf.text((day === 1 || day === days ? day + ' ' + month.slice(5) + '/' + month.slice(2,4) : String(day)), xx, chartY + h - 2.1, { align: 'center' })
  })
  if (threshold != null && Number.isFinite(Number(threshold))) {
    const warnY = top + plotH * (1 - Math.max(0, Math.min(100, Number(threshold))) / 100)
    pdf.setDrawColor(192, 105, 48)
    pdf.setLineWidth(.4)
    pdf.setLineDashPattern([1.5, 1.3], 0)
    pdf.line(left, warnY, left + plotW, warnY)
    pdf.setLineDashPattern([], 0)
    pdf.setFont('helvetica','bold')
    pdf.setTextColor(156, 79, 37)
    pdf.text('Warning ' + pct(threshold), left + plotW - 1, warnY - 1.5, {align:'right'})
  }
  const hosts = [...new Set(rows.map(row => labelHost(row.host)))].sort().slice(0, 5)
  hosts.forEach((host, index) => {
    const color = HEX[index]
    pdf.setDrawColor(...color)
    pdf.setLineWidth(.65)
    const hostDays = rows.filter(row => labelHost(row.host) === host && row[key] !== null && row[key] !== undefined)
      .map(row => ({ day: Number(String(row.day).slice(-2)), value: Math.max(0, Math.min(100, Number(row[key]))) }))
      .sort((a, b) => a.day - b.day)
    hostDays.forEach((point, i) => {
      const xx = left + plotW * (point.day - 1) / Math.max(1, days - 1)
      const yy = top + plotH * (1 - point.value / 100)
      if (i && point.day === hostDays[i - 1].day + 1) {
        const previous = hostDays[i - 1]
        pdf.line(left + plotW * (previous.day - 1) / Math.max(1, days - 1),
          top + plotH * (1 - previous.value / 100), xx, yy)
      }
      pdf.setFillColor(...color)
      pdf.circle(xx, yy, .48, 'F')
    })
  })
  pdf.setFontSize(6.2)
  let lx = x + 2
  hosts.forEach((host, i) => {
    pdf.setFillColor(...HEX[i])
    pdf.rect(lx, chartY + h + 2, 2.5, 1.4, 'F')
    pdf.setTextColor(70, 83, 91)
    pdf.text(host, lx + 3.2, chartY + h + 3.4)
    lx += 23
  })
}

function drawTopTable(pdf, title, rows, metric, x, y, width) {
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.setTextColor(35, 51, 61)
  pdf.text(title, x, y)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(6)
  pdf.setTextColor(100, 115, 125)
  pdf.text('Same APP and collection; co-observation does not prove causation', x, y + 3.3)
  const baseY = y + 8
  pdf.setDrawColor(215, 225, 230)
  pdf.line(x, baseY, x + width, baseY)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(6.5)
  pdf.setTextColor(56, 72, 82)
  pdf.text('JOB / PROGRAM', x, baseY + 3.3)
  pdf.text('CHECKS', x + width - 42, baseY + 3.3)
  pdf.text(metric === 'ram' ? 'PEAK PSS' : 'PEAK CPU', x + width - 6, baseY + 3.3, { align: 'right' })
  let ry = baseY + 6
  if (!rows.length) {
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(110, 121, 129)
    pdf.text('No matching workload observations during this pressure.', x, ry + 5)
    return ry + 8
  }
  rows.slice(0, 5).forEach(row => {
    const overlap = row.pressure_overlap || {}
    const count = metric === 'ram' ? overlap.ram_pressure_host_checks : overlap.cpu_pressure_host_checks
    const peak = metric === 'ram' ? format(overlap.pss_peak_during_ram_pressure, 2) + ' GB' : pct(overlap.cpu_peak_during_cpu_pressure)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(6.7)
    pdf.setTextColor(35, 51, 61)
    const name = pdf.splitTextToSize(String(row.consumer_key || 'UNKNOWN'), width - 55)
    // Rows expand rather than truncating long ABAP names.
    const rowH = Math.max(5, name.length * 2.7 + 1.4)
    pdf.text(name, x, ry + 2.8)
    pdf.text(String(count ?? 0), x + width - 36, ry + 2.8)
    pdf.text(peak, x + width - 6, ry + 2.8, { align: 'right' })
    ry += rowH
    pdf.setDrawColor(225, 232, 236)
    pdf.line(x, ry, x + width, ry)
  })
  return ry
}

async function loadLogo() {
  return new Promise(resolve => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = import.meta.env.BASE_URL + 'branding/logo/sphere-logo-navbar-dark.png'
  })
}

export async function buildMonthlyPdf({ month, data }) {
  const [{ jsPDF }, brand] = await Promise.all([import('jspdf'), loadLogo()])
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()
  const margin = 8
  const contentW = W - margin * 2
  const quality = data.quality || {}
  const pressure = data.monthly_pressure || {}
  const summary = data.summary || {}
  const hosts = pressure.hosts || []
  const trends = pressure.daily_hosts || []
  pdf.setFillColor(248, 250, 251)
  pdf.rect(0, 0, W, H, 'F')
  pdf.setFillColor(15, 21, 26)
  pdf.roundedRect(margin, 7, contentW, 17, 1, 1, 'F')
  let headerX = margin + 4
  if (brand?.naturalWidth && brand?.naturalHeight) {
    const logoH = 8
    const logoW = Math.min(31, logoH * brand.naturalWidth / brand.naturalHeight)
    pdf.addImage(brand, 'PNG', headerX, 11, logoW, logoH, undefined, 'FAST')
    headerX += logoW + 5
  } else {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    pdf.setTextColor(242, 247, 250)
    pdf.text('SPHERE', headerX, 18)
    headerX += 29
  }
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(11)
  pdf.setTextColor(239, 247, 249)
  pdf.text('SAP Monthly Performance Review', headerX, 18)
  pdf.setFillColor(40, 104, 116)
  pdf.roundedRect(W - margin - 34, 11, 30, 9, 1, 1, 'F')
  pdf.setFontSize(7)
  pdf.setTextColor(255, 255, 255)
  pdf.text('SPHERE HISTORY', W - margin - 19, 16.7, { align: 'center' })

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7.2)
  pdf.setTextColor(78, 91, 101)
  pdf.text('Periode ' + month + ' WIB. Sumber: Histori SPHERE. Dibuat: ' + dateWib(new Date().toISOString()), margin, 29.5)
  pdf.text('Data tercatat: ' + dateWib(data.start) + ' s.d. ' + dateWib(data.end) + ' (akhir tidak termasuk). Cakupan ' + pct(quality.coverage_pct), margin, 33.8)

  const kpis = [
    ['CPU HIGH CHECKS', format(pressure.cpu?.observed_pressure_host_checks,0) + ' checks', 'Warning ' + pct(pressure.thresholds?.cpu_warning_pct)],
    ['RAM HIGH CHECKS', format(pressure.ram?.observed_pressure_host_checks,0) + ' checks', 'Warning ' + pct(pressure.thresholds?.ram_warning_pct)],
    ['CRITICAL WP CHECKS', hosts.length ? format(hosts.reduce((s, h) => s + (h.critical_wp_host_checks || 0), 0), 0) + ' host-checks' : 'N/A', 'APP checks with Critical WP'],
    ['JOB / PROGRAM', format(summary.workloads, 0) + ' observed', format(summary.review_required, 0) + ' need review'],
    ['ERROR PROGRAM', data.monthly_errors?.status === 'ERROR_SOURCE_NOT_RETAINED' ? 'N/A' : format(data.monthly_errors?.error_program_count,0), 'WP trace evidence, not ST22'],
  ]
  const kpiGap = 3
  const kpiW = (contentW - (kpis.length - 1) * kpiGap) / kpis.length
  kpis.forEach(([label, main, detail], i) => {
    const x = margin + i * (kpiW + kpiGap)
    pdf.setFillColor(231, 238, 242)
    pdf.roundedRect(x, 37, kpiW, 18, 1, 1, 'F')
    pdf.setFontSize(6.1); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(83, 104, 115)
    pdf.text(label, x + 2.8, 42)
    pdf.setFontSize(9.3); pdf.setTextColor(22, 37, 48)
    pdf.text(main, x + 2.8, 48)
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.1); pdf.setTextColor(80, 97, 106)
    pdf.text(detail, x + 2.8, 52)
  })

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.setTextColor(35, 51, 61)
  pdf.text('SAP APP SERVERS - MONTHLY RESOURCE SUMMARY', margin, 62)
  const cols = [0, 40, 73, 108, 143, 182, 218, 249]
  pdf.setFontSize(6.6)
  ;['APP', 'AVG CPU', 'PEAK CPU', 'AVG RAM', 'PEAK RAM', 'CPU HIGH', 'RAM HIGH', 'CRITICAL WP'].forEach((name, i) => pdf.text(name, margin + cols[i], 67))
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(6.8)
  hosts.slice(0, 5).forEach((row, i) => {
    const y = 71 + i * 3.7
    const vals = [labelHost(row.host), pct(row.avg_cpu_pct), pct(row.peak_cpu_pct), pct(row.avg_ram_pct),
      pct(row.peak_ram_pct), String(row.cpu_warning_host_checks), String(row.ram_warning_host_checks), String(row.critical_wp_host_checks)]
    vals.forEach((v, index) => pdf.text(v, margin + cols[index], y))
  })
  if (!hosts.length) {
    pdf.setFont('helvetica', 'italic')
    pdf.text('APP host metrics are not available for this period.', margin, 74)
  }

  const chartW = (contentW - 6) / 2
  drawMultiHostChart(pdf, trends, 'peak_cpu_pct', 'APP CPU - Daily Peak', margin, 91, chartW, 35, month, pressure.thresholds?.cpu_warning_pct)
  drawMultiHostChart(pdf, trends, 'peak_ram_pct', 'APP RAM - Daily Peak', margin + chartW + 6, 91, chartW, 35, month, pressure.thresholds?.ram_warning_pct)

  const ramBottom = drawTopTable(pdf, 'JOBS & PROGRAMS DURING RAM PRESSURE', pressure.top_ram_workloads || [], 'ram', margin + 2, 140, chartW - 4)
  const cpuBottom = drawTopTable(pdf, 'JOBS & PROGRAMS DURING CPU PRESSURE', pressure.top_cpu_workloads || [], 'cpu', margin + chartW + 7, 140, chartW - 4)
  let errorLineY = Math.max(183, ramBottom + 2, cpuBottom + 2)
  if (errorLineY > H - 27) {
    pdf.addPage()
    pdf.setFillColor(248, 250, 251);pdf.rect(0, 0, W, H, 'F')
    pdf.setFillColor(15, 21, 26);pdf.roundedRect(margin, 7, contentW, 17, 1, 1, 'F')
    pdf.setFont('helvetica', 'bold');pdf.setFontSize(11);pdf.setTextColor(240, 245, 248)
    pdf.text('SPHERE - ABAP ERROR REVIEW', margin + 4, 18)
    errorLineY = 35
  }
  const tuningCandidates = data.monthly_abap_candidates || []
  const errorEvidence = data.monthly_errors || {}
  const errorRows = (errorEvidence.top_errors || []).filter(row => row.event_count || row.snapshot_host_checks || row.untimed_trace_checks)
  pdf.setDrawColor(215, 225, 230)
  pdf.line(margin, errorLineY, W - margin, errorLineY)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.setTextColor(36, 52, 62)
  pdf.text('MONTHLY FINDINGS - ABAP AND WP', margin, errorLineY + 6)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7)
  pdf.setTextColor(78, 98, 108)
  const wpSourceMissing = errorEvidence.status === 'ERROR_SOURCE_NOT_RETAINED'
  const errorSummary = wpSourceMissing
    ? 'ABAP/WP error count not available: error fields were not retained in SPHERE history.'
    : errorEvidence.truncated
      ? 'Error evidence is partial. The full monthly total cannot be confirmed.'
      : format(errorEvidence.error_program_count,0) + ' programs with WP error evidence. ' +
        format(errorEvidence.timestamped_events,0) + ' timestamped events. ' +
        format(errorEvidence.rabax_wp_checks,0) + ' RABAX WP checks.'
  pdf.text(errorSummary, margin, errorLineY + 10.5)
  const tuningSummary = format(tuningCandidates.length,0) +
    ' Jobs/Programs require performance evaluation. This is not a count of failed jobs.'
  pdf.text(tuningSummary, margin, errorLineY + 14.7)
  pdf.setTextColor(94, 105, 113)
  const peakDetails = 'CPU peak: ' + pct(pressure.cpu?.peak?.peak_pct) + ' on ' +
    labelHost(pressure.cpu?.peak?.host) + ' at ' + dateWib(pressure.cpu?.peak?.peak_at) +
    '. RAM peak: ' + pct(pressure.ram?.peak?.peak_pct) + ' on ' +
    labelHost(pressure.ram?.peak?.host) + ' at ' + dateWib(pressure.ram?.peak?.peak_at)
  pdf.setFontSize(6.4)
  pdf.text(pdf.splitTextToSize(peakDetails, contentW), margin, errorLineY + 18.5)

  // Detailed error section is sourced only from timestamped trace evidence or
  // separately labeled WP snapshot observations. It is not a ST22 dump count.
  if (errorRows.length) {
    let ey = 41
    const header = (continued = false) => {
      pdf.setFillColor(248, 250, 251)
      pdf.rect(0, 0, W, H, 'F')
      pdf.setFillColor(15, 21, 26)
      pdf.roundedRect(margin, 7, contentW, 17, 1, 1, 'F')
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(11)
      pdf.setTextColor(240, 245, 248)
      pdf.text('SPHERE - ABAP Error Evidence' + (continued ? ' (cont.)' : ''), margin + 4, 18)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7)
      pdf.setTextColor(70, 85, 94)
      pdf.text('Period ' + month + ' WIB. Source: retained SPHERE WP trace', margin, 30)
      ey = 40
      pdf.setFontSize(6.3)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(47, 64, 76)
      ;[
        ['CATEGORY', 0], ['ERROR CODE', 40], ['ERROR PROGRAM', 106],
        ['APP', 201], ['EVENTS', 221], ['SNAPSHOT', 249],
      ].forEach(([value,x]) => pdf.text(value, margin + x, ey))
      pdf.setDrawColor(204, 216, 224)
      pdf.line(margin, ey + 2, W - margin, ey + 2)
      ey += 5
    }
    pdf.addPage()
    header()
    errorRows.forEach(row => {
      const cat = pdf.splitTextToSize(String(errorCategoryLabel(row.category, row.category_label)), 37)
      const code = pdf.splitTextToSize(String(row.error_code || 'Not available'), 61)
      const program = pdf.splitTextToSize(String(row.program || 'Not identified'), 88)
      const resource = row.snapshot_host_checks > 0 && (row.cpu_snapshot_pct !== null || row.pss_snapshot_gb !== null)
        ? 'Snapshot CPU ' + pct(row.cpu_snapshot_pct) + ', PSS ' + format(row.pss_snapshot_gb, 2) + ' GB'
        : row.untimed_trace_checks > 0 ? 'Untimed trace: ' + format(row.untimed_trace_checks, 0) + ' observations' : ''
      const provenance = row.program_link === 'EXPLICIT_ERROR_PROGRAM'
        ? 'Explicit error program in WP trace' : 'Workload context only; not causation'
      const workloadContext = row.sample_workload ? 'Observed Job/Program: ' + row.sample_workload : ''
      const timing = row.first_at
        ? 'First ' + dateWib(row.first_at) + '; last ' + dateWib(row.last_at) : ''
      const detailLines = pdf.splitTextToSize([provenance, workloadContext, timing, resource].filter(Boolean).join('. '), 88)
      const rowH = Math.max(6.2, 3.3 * Math.max(cat.length, code.length, program.length + detailLines.length) + 1.8)
      if (ey + rowH > H - 17) {
        pdf.addPage()
        header(true)
      }
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7)
      pdf.setTextColor(34, 49, 59)
      pdf.text(cat, margin, ey + 3)
      pdf.text(code, margin + 40, ey + 3)
      pdf.text(program, margin + 106, ey + 3)
      if (detailLines.length) {
        pdf.setFontSize(6)
        pdf.setTextColor(100, 116, 125)
        pdf.text(detailLines, margin + 106, ey + 3 + 3.3 * program.length)
        pdf.setFontSize(7)
        pdf.setTextColor(34, 49, 59)
      }
      pdf.text(labelHost(row.host), margin + 201, ey + 3)
      pdf.text(String(row.event_count ?? 'N/A'), margin + 229, ey + 3, {align: 'right'})
      pdf.text(String(row.snapshot_host_checks ?? 'N/A'), margin + 258, ey + 3, {align: 'right'})
      pdf.setDrawColor(222, 231, 235)
      pdf.line(margin, ey + rowH, W - margin, ey + rowH)
      ey += rowH
    })
    if (ey + 13 > H - 15) {
      pdf.addPage()
      header(true)
    }
    pdf.setTextColor(78, 98, 109)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(6.6)
    pdf.text('Event: unique APP, PID, error code and explicit event timestamp; not an ST22 dump total.', margin, ey + 5)
    pdf.text('Snapshot: error signal when collected. A workload context is not proof of the failing ABAP program.', margin, ey + 9)
  }

  // Automatically include source-backed tuning candidates. These entries are
  // observed workloads selected for review, NEVER confirmed ABAP errors.
  if (tuningCandidates.length) {
    let ty = 48
    const tuningHeader = (continued = false) => {
      pdf.setFillColor(248, 250, 251);pdf.rect(0, 0, W, H, 'F')
      pdf.setFillColor(15, 21, 26);pdf.roundedRect(margin, 7, contentW, 17, 1, 1, 'F')
      pdf.setFont('helvetica', 'bold');pdf.setFontSize(11);pdf.setTextColor(240, 245, 248)
      pdf.text('SPHERE - ABAP Tuning Candidates' + (continued ? ' (cont.)' : ''), margin + 4, 18)
      pdf.setFont('helvetica', 'normal');pdf.setFontSize(7);pdf.setTextColor(70, 85, 94)
      pdf.text('Period ' + month + ' WIB. Review required based on SPHERE history', margin, 30)
      pdf.setFontSize(6.5)
      pdf.text('Performance investigation only; no confirmed Job failure, ST22 dump or root-cause attribution.', margin, 35)
      pdf.text('Workload CPU can exceed 100% across CPU cores; PSS is process memory (GB).', margin, 38)
      pdf.setFont('helvetica', 'bold');pdf.setFontSize(6.6);pdf.setTextColor(47, 64, 76)
      pdf.text('JOB / PROGRAM', margin + 2, 42)
      pdf.text('CPU AVG / PEAK', margin + 160, 42, {align:'right'})
      pdf.text('PSS AVG / PEAK', margin + 211, 42, {align:'right'})
      pdf.text('CHECKS', margin + 238, 42, {align:'right'})
      pdf.text('CPU / RAM', margin + 279, 42, {align:'right'})
      pdf.setDrawColor(204, 216, 224);pdf.line(margin, 44, W - margin, 44)
      ty = 48
    }
    pdf.addPage()
    tuningHeader()
    tuningCandidates.forEach((row, index) => {
      const names = pdf.splitTextToSize(
        (index + 1) + '. ' + String(row.consumer_key || 'UNKNOWN') + ' [' + String(row.consumer_type || 'WORKLOAD') + ']',
        119,
      )
      const observedApps = (row.hosts || []).map(labelHost).join(', ') || 'N/A'
      const cpuApps = (row.cpu_pressure_hosts || []).map(labelHost).join(', ') || 'none'
      const ramApps = (row.ram_pressure_hosts || []).map(labelHost).join(', ') || 'none'
      const signals = [
        row.signals?.sustained_high_cpu && 'High CPU',
        row.signals?.high_memory && 'High PSS',
        row.signals?.cpu_spike && 'CPU spike',
        row.signals?.baseline_anomaly && 'Above baseline',
      ].filter(Boolean).join(', ') || 'Review Required'
      const detail = pdf.splitTextToSize(
        'Observed APP: ' + observedApps + '. CPU warning APP: ' + cpuApps +
        '. RAM warning APP: ' + ramApps + '. Review: ' + signals +
        '. Confidence: ' + String(row.confidence || 'UNKNOWN'),
        contentW - 5,
      )
      const rowH = names.length * 3.25 + detail.length * 3.0 + 4.4
      if (ty + rowH > H - 16) {
        pdf.addPage()
        tuningHeader(true)
      }
      pdf.setFont('helvetica','bold');pdf.setFontSize(7);pdf.setTextColor(34, 49, 59)
      pdf.text(names, margin + 2, ty + 2.5)
      pdf.setFont('helvetica','normal');pdf.setFontSize(6.6)
      pdf.text(pct(row.avg_cpu_pct) + ' / ' + pct(row.peak_cpu_pct), margin + 160, ty + 2.5, {align:'right'})
      pdf.text(format(row.avg_pss_gb,2) + ' / ' + format(row.peak_pss_gb,2) + ' GB', margin + 211, ty + 2.5, {align:'right'})
      pdf.text(format(row.occurrences,0), margin + 238, ty + 2.5, {align:'right'})
      pdf.text(format(row.cpu_pressure_host_checks,0) + ' / ' +
        format(row.ram_pressure_host_checks,0), margin + 279, ty + 2.5, {align:'right'})
      pdf.setFontSize(6.3);pdf.setTextColor(92, 108, 118)
      pdf.text(detail, margin + 2, ty + names.length * 3.25 + 2)
      ty += rowH
      pdf.setDrawColor(224, 232, 236);pdf.line(margin, ty, W - margin, ty)
    })
  }

  // RABAX/RXMSG are WP diagnostics, not ST22 dump counts. Detail appears
  // only when the retained collection history contains such signals.
  const wpDiagnostics = (errorEvidence.wp_diagnostics || []).slice(0, 20)
  if (wpDiagnostics.length) {
    let signalY = 43
    const signalHeader = (continued = false) => {
      pdf.setFillColor(248, 250, 251);pdf.rect(0, 0, W, H, 'F')
      pdf.setFillColor(15, 21, 26);pdf.roundedRect(margin, 7, contentW, 17, 1, 1, 'F')
      pdf.setFont('helvetica', 'bold');pdf.setFontSize(11);pdf.setTextColor(240, 245, 248)
      pdf.text('SPHERE - WP Diagnostic Signals' + (continued ? ' (cont.)' : ''), margin + 4, 18)
      pdf.setFont('helvetica', 'normal');pdf.setFontSize(7);pdf.setTextColor(70, 85, 94)
      pdf.text('RABAX and RXMSG are collector trace indicators, not ST22 dump counts.', margin, 30)
      pdf.setFont('helvetica', 'bold');pdf.setFontSize(7)
      ;[['SIGNAL',0], ['APP',32], ['PROGRAM CONTEXT',60], ['CHECKS',219], ['PEAK TRACE',260]]
        .forEach(([name, position]) => pdf.text(name, margin + position, 38))
      pdf.setDrawColor(204, 216, 224);pdf.line(margin, 40, W - margin, 40)
      signalY = 43
    }
    pdf.addPage()
    signalHeader()
    wpDiagnostics.forEach(item => {
      const program = pdf.splitTextToSize(String(item.program || 'Not identified'), 150)
      const context = item.program_link === 'EXPLICIT_ERROR_PROGRAM'
        ? 'Explicit program in WP trace'
        : 'Workload context: ' + String(item.sample_workload || 'not identified')
      const contextLines = pdf.splitTextToSize(context, 150)
      const rowH = Math.max(8, program.length * 3 + contextLines.length * 2.7 + 3)
      if (signalY + rowH > H - 16) {
        pdf.addPage()
        signalHeader(true)
      }
      pdf.setFont('helvetica', 'normal');pdf.setFontSize(7);pdf.setTextColor(34, 49, 59)
      pdf.text(String(item.signal || 'WP'), margin, signalY + 3)
      pdf.text(labelHost(item.host), margin + 32, signalY + 3)
      pdf.text(program, margin + 60, signalY + 3)
      pdf.text(String(item.observed_checks ?? 0), margin + 244, signalY + 3, { align: 'right' })
      pdf.text(format(item.peak_tail_count, 0), margin + 279, signalY + 3, { align: 'right' })
      pdf.setFontSize(6);pdf.setTextColor(100, 116, 125)
      pdf.text(contextLines, margin + 60, signalY + 3 + program.length * 3)
      signalY += rowH
      pdf.setDrawColor(222, 231, 235);pdf.line(margin, signalY, W - margin, signalY)
    })
  }

  const pages = pdf.internal.getNumberOfPages()
  for(let i=1;i<=pages;i++){
    pdf.setPage(i)
    pdf.setDrawColor(218, 228, 234)
    // Minimal footer: no divider line.
    pdf.setTextColor(96, 109, 117);pdf.setFont('helvetica', 'normal');pdf.setFontSize(6.5)
    pdf.text('SPHERE - ' + APP_DISPLAY_VERSION + ' - Period ' + month, margin, H-4)
    pdf.text('Page '+i+' of '+pages, W-margin, H-4,{align:'right'})
  }
  return pdf.output('blob')
}
