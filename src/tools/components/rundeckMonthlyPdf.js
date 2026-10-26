/* Monthly report deliberately reuses the restrained SPHERE landscape visual language.
 * It contains stored observations only; no inferred root cause or SM37 run totals. */
import { APP_DISPLAY_VERSION } from '../../app/version.js'
import { wpCpuCoreEquivalent } from './monthlyCpuMetrics.js'

const HEX = [[35, 166, 183], [93, 134, 201], [155, 110, 199], [201, 142, 76], [84, 160, 123]]
const labelHost = value => {
  const raw = String(value || '').split('.')[0].toUpperCase()
  const app = raw.match(/(?:AOPH([1-5])PAPPDC|^APP([1-5])$)/)
  return app ? 'APP' + (app[1] || app[2]) : raw
}
const format = (value, digits = 1) => value === null || value === undefined || !Number.isFinite(Number(value))
  ? 'N/A' : Number(value).toLocaleString('en-US', { maximumFractionDigits: digits })
const pct = value => format(value) === 'N/A' ? 'N/A' : format(value) + '%'
// Collector WP CPU is core-based and may exceed 100%; 100% = one logical CPU core.
const coreEquivalent = value => {
  const cores = wpCpuCoreEquivalent(value)
  return cores === null ? 'N/A' : format(cores, 2) + ' core eq.'
}
const dateWib = value => value ? new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(value)) + ' WIB' : 'Not observed'

const errorCategoryLabel = (category, fallback) => ({
  MEMORY: 'Memory', LOCK: 'Lock / Deadlock', DATABASE: 'Database',
  RUNTIME: 'Runtime / Timeout', RFC: 'RFC / Network',
  APPLICATION: 'ABAP Application', ABAP_DATA: 'ABAP Data', OTHER: 'Other',
})[category] || fallback || 'Other'

function drawMultiHostChart(pdf, rows, key, label, x, y, w, h, month, threshold, warningSummary = '') {
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(22, 35, 43)
  pdf.setFontSize(8.6)
  pdf.text(label, x, y - 2)
  if (warningSummary) {
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(86, 101, 113)
    pdf.setFontSize(6.1)
    pdf.text(warningSummary, x + w - 1, y - 2, { align: 'right' })
  }
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
  pdf.text(metric === 'cpu'
    ? 'CPU shown as cores used; not total server CPU'
    : 'Memory used by the program, not total server RAM', x, y + 3.3)
  const baseY = y + 8
  pdf.setDrawColor(215, 225, 230)
  pdf.line(x, baseY, x + width, baseY)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(6.5)
  pdf.setTextColor(56, 72, 82)
  pdf.text('JOB / PROGRAM', x, baseY + 3.3)
  pdf.text('TIMES SEEN', x + width - 42, baseY + 3.3)
  pdf.text(metric === 'ram' ? 'MAX MEMORY' : 'MAX CPU CORES', x + width - 6, baseY + 3.3, { align: 'right' })
  let ry = baseY + 6
  if (!rows.length) {
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(110, 121, 129)
    pdf.text('No matching programs in the saved records.', x, ry + 5)
    return ry + 8
  }
  rows.slice(0, 5).forEach(row => {
    const overlap = row.pressure_overlap || {}
    const count = metric === 'ram' ? overlap.ram_pressure_host_checks : overlap.cpu_pressure_host_checks
    const peak = metric === 'ram' ? format(overlap.pss_peak_during_ram_pressure, 2) + ' GB'
      : coreEquivalent(overlap.cpu_peak_during_cpu_pressure).replace(' core eq.', ' cores')
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
  pdf.text('MONTHLY REPORT', W - margin - 19, 16.7, { align: 'center' })

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7.2)
  pdf.setTextColor(78, 91, 101)
  pdf.text('Reporting month: ' + month + '  |  Prepared: ' + dateWib(new Date().toISOString()), margin, 29.5)
  pdf.text('Estimated data coverage: ' + pct(quality.coverage_pct) + '  |  Results are based on available SPHERE monitoring records only.', margin, 33.8)

  const kpis = [
    ['PROGRAMS TO REVIEW', format(summary.review_required,0), 'Out of ' + format(summary.workloads,0) + ' observed workloads'],
    ['HIGH CPU READINGS', format(pressure.cpu?.observed_pressure_host_checks,0), 'APP CPU at or above ' + pct(pressure.thresholds?.cpu_warning_pct)],
    ['HIGH RAM READINGS', format(pressure.ram?.observed_pressure_host_checks,0), 'APP RAM at or above ' + pct(pressure.thresholds?.ram_warning_pct)],
    ['DATA COVERAGE', pct(quality.coverage_pct), 'Estimated monitoring history available'],
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
  pdf.text('APP Server Performance', margin, 62)
  pdf.setFont('helvetica','normal')
  pdf.setFontSize(5.3)
  pdf.setTextColor(92, 109, 117)
  pdf.text('High readings = monitoring results above limit / days affected. Peak = highest reading.', margin, 64.6)
  const cols = [0, 37, 69, 105, 141, 181, 231]
  pdf.setFontSize(6.6)
  ;['APP', 'AVG CPU', 'MAX CPU', 'AVG RAM', 'MAX RAM', 'HIGH CPU (TIMES/DAYS)', 'HIGH RAM (TIMES/DAYS)'].forEach((name, i) => pdf.text(name, margin + cols[i], 67))
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(6.8)
  hosts.slice(0, 5).forEach((row, i) => {
    const y = 71 + i * 3.7
    const vals = [labelHost(row.host), pct(row.avg_cpu_pct), pct(row.peak_cpu_pct), pct(row.avg_ram_pct),
      pct(row.peak_ram_pct),
      String(row.cpu_warning_host_checks ?? 0) + ' / ' + format(row.cpu_warning_days,0),
      String(row.ram_warning_host_checks ?? 0) + ' / ' + format(row.ram_warning_days,0)]
    vals.forEach((v, index) => pdf.text(v, margin + cols[index], y))
  })
  if (!hosts.length) {
    pdf.setFont('helvetica', 'italic')
    pdf.text('APP host metrics are not available for this period.', margin, 74)
  }

  const chartW = (contentW - 6) / 2
  const cpuWarningSummary = format(pressure.cpu?.observed_pressure_host_checks,0) + ' readings / ' +
    format(pressure.cpu?.observed_warning_app_days,0) + ' server-days'
  const ramWarningSummary = format(pressure.ram?.observed_pressure_host_checks,0) + ' readings / ' +
    format(pressure.ram?.observed_warning_app_days,0) + ' server-days'
  drawMultiHostChart(pdf, trends, 'peak_cpu_pct', 'Daily Highest CPU', margin, 91, chartW, 35, month,
    pressure.thresholds?.cpu_warning_pct, cpuWarningSummary)
  drawMultiHostChart(pdf, trends, 'peak_ram_pct', 'Daily Highest RAM', margin + chartW + 6, 91, chartW, 35, month,
    pressure.thresholds?.ram_warning_pct, ramWarningSummary)

  const ramBottom = drawTopTable(pdf, 'Programs Seen During High RAM', pressure.top_ram_workloads || [], 'ram', margin + 2, 140, chartW - 4)
  const cpuBottom = drawTopTable(pdf, 'Programs Seen During High CPU', pressure.top_cpu_workloads || [], 'cpu', margin + chartW + 7, 140, chartW - 4)
  const errorLineY = Math.max(183, ramBottom + 2, cpuBottom + 2)
  // Never generate an almost-empty page just for a few finding lines.
  // If the prior workload tables take more space, the findings are covered
  // by the management KPI and review-priority page instead.
  const showFindingsOnFirstPage = errorLineY <= H - 27
  const tuningCandidates = data.monthly_abap_candidates || []
  const errorEvidence = data.monthly_errors || {}
  const errorRows = (errorEvidence.top_errors || []).filter(row => row.event_count || row.snapshot_host_checks || row.untimed_trace_checks)
  if (showFindingsOnFirstPage) {
  pdf.setDrawColor(215, 225, 230)
  pdf.line(margin, errorLineY, W - margin, errorLineY)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.setTextColor(36, 52, 62)
  pdf.text('What Needs Attention', margin, errorLineY + 6)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7)
  pdf.setTextColor(78, 98, 108)
  const wpSourceMissing = errorEvidence.status === 'ERROR_SOURCE_NOT_RETAINED'
  const errorSummary = wpSourceMissing
    ? 'Error details are not available for this month. This does not mean there were no errors.'
    : errorEvidence.truncated
      ? 'Only partial error data is available; the number of errors cannot be confirmed.'
      : format(errorEvidence.error_code_count,0) + ' types of WP errors recorded; ' +
        format(errorEvidence.error_program_count,0) + ' programs identified for investigation.'
  pdf.text(errorSummary, margin, errorLineY + 10.5)
  const tuningSummary = format(tuningCandidates.length,0) +
    ' jobs or programs are flagged for review; this does not confirm a failed job.'
  pdf.text(tuningSummary, margin, errorLineY + 14.7)
  pdf.setTextColor(94, 105, 113)
  const peakDetails = 'Highest server CPU: ' + pct(pressure.cpu?.peak?.peak_pct) + ' (' +
    labelHost(pressure.cpu?.peak?.host) + ', ' + dateWib(pressure.cpu?.peak?.peak_at) +
    '). Highest RAM: ' + pct(pressure.ram?.peak?.peak_pct) + ' (' +
    labelHost(pressure.ram?.peak?.host) + ', ' + dateWib(pressure.ram?.peak?.peak_at) + ')'
  pdf.setFontSize(6.4)
  pdf.text(pdf.splitTextToSize(peakDetails, contentW), margin, errorLineY + 18.5)

  }

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
      pdf.text('SAP Errors to Check' + (continued ? ' (cont.)' : ''), margin + 4, 18)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7)
      pdf.setTextColor(70, 85, 94)
      pdf.text('Reporting month ' + month + '. Based on saved SAP logs; job failure not confirmed.', margin, 30)
      ey = 40
      pdf.setFontSize(6.3)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(47, 64, 76)
      ;[
        ['ISSUE TYPE', 0], ['SAP ERROR CODE', 40], ['RELATED PROGRAM', 106],
        ['APP', 201], ['DATED', 221], ['SEEN', 249],
      ].forEach(([value,x]) => pdf.text(value, margin + x, ey))
      pdf.setDrawColor(204, 216, 224)
      pdf.line(margin, ey + 2, W - margin, ey + 2)
      ey += 5
    }
    pdf.addPage()
    header()
    errorRows.slice(0, 10).forEach(row => {
      const cat = pdf.splitTextToSize(String(errorCategoryLabel(row.category, row.category_label)), 37)
      const code = pdf.splitTextToSize(String(row.error_code || 'Not available'), 61)
      const program = pdf.splitTextToSize(String(row.program === 'Belum teridentifikasi' ? 'Unidentified program' : (row.program || 'Unidentified program')), 88)
      const association = row.program_link === 'EXPLICIT_ERROR_PROGRAM'
        ? 'Named in SAP trace'
        : 'Related workload only; cause not confirmed'
      const dateInfo = row.first_at ? 'First recorded: ' + dateWib(row.first_at)
        : row.observed_at ? 'Recorded on: ' + dateWib(row.observed_at)
        : 'Event date not available'
      const detailLines = pdf.splitTextToSize(
        association + '. ' + dateInfo, 88
      )
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
    pdf.text('Dated = errors with a recorded time. Seen = readings with an error signal.', margin, ey + 5)
    pdf.text('A related program is not necessarily the cause. Confirm in SAP before reporting.', margin, ey + 9)
  }

  // Management-facing priority list: one concise page. All 25 source-backed
  // candidates remain available with drilldown in the Monthly Review interface.
  if (tuningCandidates.length) {
    pdf.addPage()
    pdf.setFillColor(248, 250, 251)
    pdf.rect(0, 0, W, H, 'F')
    pdf.setFillColor(15, 21, 26)
    pdf.roundedRect(margin, 7, contentW, 17, 1, 1, 'F')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    pdf.setTextColor(240, 245, 248)
    pdf.text('Programs to Review', margin + 4, 18)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7.3)
    pdf.setTextColor(67, 84, 95)
    pdf.text('Showing ' + format(Math.min(10, tuningCandidates.length),0) +
      ' of ' + format(summary.review_required,0) +
      ' jobs/programs flagged for review. Full list is available in SPHERE.', margin, 30)
    pdf.text('These are performance review candidates, not confirmed failed jobs or program errors.', margin, 34.5)
    pdf.setFontSize(6.6)
    pdf.text('CPU cores = estimated logical core usage by the workload; memory = SAP process memory, not total server use.', margin, 38.5)

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7)
    pdf.setTextColor(45, 63, 77)
    pdf.text('JOB / PROGRAM', margin + 2, 46)
    pdf.text('WHY REVIEW', margin + 119, 46)
    pdf.text('MAX CPU', margin + 184, 46, { align: 'right' })
    pdf.text('MAX MEMORY', margin + 236, 46, { align: 'right' })
    pdf.text('TIMES SEEN', margin + 279, 46, { align: 'right' })
    pdf.setDrawColor(204, 216, 224)
    pdf.line(margin, 48, W-margin, 48)

    const reviewReason = row => [
      row.signals?.sustained_high_cpu && 'High CPU',
      row.signals?.high_memory && 'High memory',
      row.signals?.cpu_spike && 'CPU spike',
      row.signals?.baseline_anomaly && 'Above usual level',
    ].filter(Boolean).slice(0,2).join(', ') || 'Resource usage'

    let y = 52
    tuningCandidates.slice(0, 10).forEach((row, index) => {
      const jobName = String(row.consumer_key || 'Name not available')
      const apps = (row.hosts || []).map(labelHost).join(', ') || 'APP not identified'
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(7)
      pdf.setTextColor(36, 53, 66)
      const nameLines = pdf.splitTextToSize((index+1) + '. ' + jobName, 110).slice(0,2)
      pdf.text(nameLines, margin + 2, y + 2.3)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(6.1)
      pdf.setTextColor(106, 122, 133)
      pdf.text('Server: ' + apps, margin + 2, y + 6.8)
      pdf.setFontSize(6.8)
      pdf.setTextColor(45, 63, 77)
      pdf.text(pdf.splitTextToSize(reviewReason(row), 54).slice(0,2), margin + 119, y + 2.3)
      pdf.text(coreEquivalent(row.peak_cpu_pct).replace(' core eq.', ' cores'), margin + 184, y + 2.3, {align:'right'})
      pdf.text(format(row.peak_pss_gb, 2) + ' GB', margin + 236, y + 2.3, {align:'right'})
      pdf.text(format(row.occurrences, 0), margin + 279, y + 2.3, {align:'right'})
      y += 11
      pdf.setDrawColor(230, 235, 240)
      pdf.line(margin, y, W-margin, y)
    })
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    pdf.setTextColor(34, 53, 67)
    pdf.text('Recommended Follow-up', margin, 174)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7.2)
    pdf.text('SAP Basis: check high CPU and RAM periods and confirm the affected servers.', margin, 180)
    pdf.text('ABAP / Functional: review the listed programs and confirm whether tuning is needed.', margin, 185)
    pdf.text('Job or error status must be verified separately in SAP before any failure is reported.', margin, 190)
  }

  // Detailed WP counters and traces remain available for SAP Basis in SPHERE.
  // They are intentionally omitted from the management PDF to avoid presenting
  // diagnostic signals as confirmed business incidents.

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
