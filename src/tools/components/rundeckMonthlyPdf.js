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

function drawMultiHostChart(pdf, rows, key, label, x, y, w, h, month) {
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(22, 35, 43)
  pdf.setFontSize(8.6)
  pdf.text(label, x, y - 2)
  const chartY = y + 1
  pdf.setFillColor(17, 28, 38)
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
    pdf.setDrawColor(58, 74, 85)
    pdf.setLineWidth(.12)
    pdf.line(left, yy, left + plotW, yy)
    pdf.setTextColor(157, 175, 186)
    pdf.text(String(level), x + 1.2, yy + .8)
  })
  ;[1, 10, 20, days].forEach(day => {
    const xx = left + plotW * (day - 1) / Math.max(1, days - 1)
    pdf.setTextColor(157, 175, 186)
    pdf.text(String(day), xx, chartY + h - 2.1, { align: 'center' })
  })
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
  pdf.text('Terpantau pada APP dan collection yang sama; bukan bukti penyebab', x, y + 3.3)
  const baseY = y + 8
  pdf.setDrawColor(215, 225, 230)
  pdf.line(x, baseY, x + width, baseY)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(6.5)
  pdf.setTextColor(56, 72, 82)
  pdf.text('JOB DAN PROGRAM', x, baseY + 3.3)
  pdf.text('OBSERVASI', x + width - 42, baseY + 3.3)
  pdf.text(metric === 'ram' ? 'PSS PUNCAK' : 'CPU PUNCAK', x + width - 6, baseY + 3.3, { align: 'right' })
  let ry = baseY + 6
  if (!rows.length) {
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(110, 121, 129)
    pdf.text('Tidak ada program yang terpantau bersama tekanan resource bulan ini.', x, ry + 5)
    return
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
}

async function loadLogo() {
  return new Promise(resolve => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = import.meta.env.BASE_URL + 'branding/logo/sphere-logo-navbar-dark.png'
  })
}

export async function buildMonthlyPdf({ month, data, selections }) {
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
  const limited = Number(quality.coverage_pct ?? 0) < 95 || quality.confidence === 'LOW'
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
  pdf.text('Laporan Evaluasi Performa SAP Bulanan', headerX, 18)
  pdf.setFillColor(limited ? 180 : 61, limited ? 124 : 132, limited ? 45 : 100)
  pdf.roundedRect(W - margin - 34, 11, 30, 9, 1, 1, 'F')
  pdf.setFontSize(7)
  pdf.setTextColor(255, 255, 255)
  pdf.text(limited ? 'DATA TERBATAS' : 'HISTORI SAP', W - margin - 19, 16.7, { align: 'center' })

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7.2)
  pdf.setTextColor(78, 91, 101)
  pdf.text('Periode ' + month + ' WIB  |  Sumber: histori SPHERE  |  Dicetak: ' + dateWib(new Date().toISOString()), margin, 29.5)
  pdf.text('Rentang data: ' + dateWib(data.start) + ' sampai sebelum ' + dateWib(data.end), margin, 33.8)

  const kpis = [
    ['TEKANAN CPU', String(pressure.cpu?.episodes ?? 'N/A') + ' kejadian', 'Puncak ' + pct(pressure.cpu?.peak?.peak_pct)],
    ['TEKANAN RAM', String(pressure.ram?.episodes ?? 'N/A') + ' kejadian', 'Puncak ' + pct(pressure.ram?.peak?.peak_pct)],
    ['OBSERVASI WP', hosts.length ? format(hosts.reduce((s, h) => s + (h.critical_wp_host_checks || 0), 0), 0) + ' observasi' : 'N/A', 'WP berstatus critical'],
    ['JOB DAN PROGRAM', format(summary.workloads, 0) + ' terpantau', format(summary.review_required, 0) + ' perlu evaluasi'],
    ['CAKUPAN DATA', pct(quality.coverage_pct), format(quality.complete_checks, 0) + ' pemeriksaan'],
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
  pdf.text('SERVER APLIKASI SAP  |  Ringkasan resource bulanan', margin, 62)
  const cols = [0, 40, 73, 108, 143, 182, 218, 249]
  pdf.setFontSize(6.6)
  ;['APP', 'CPU RERATA', 'CPU PUNCAK', 'RAM RERATA', 'RAM PUNCAK', 'CPU TINGGI', 'RAM TINGGI', 'WP'].forEach((name, i) => pdf.text(name, margin + cols[i], 67))
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
    pdf.text('Data APP belum tersedia pada periode ini.', margin, 74)
  }

  const chartW = (contentW - 6) / 2
  drawMultiHostChart(pdf, trends, 'peak_cpu_pct', 'Tren CPU  |  Puncak harian APP', margin, 91, chartW, 35, month)
  drawMultiHostChart(pdf, trends, 'peak_ram_pct', 'Tren RAM  |  Puncak harian APP', margin + chartW + 6, 91, chartW, 35, month)

  drawTopTable(pdf, 'JOB DAN PROGRAM SAAT RAM TINGGI', pressure.top_ram_workloads || [], 'ram', margin + 2, 140, chartW - 4)
  drawTopTable(pdf, 'JOB DAN PROGRAM SAAT CPU TINGGI', pressure.top_cpu_workloads || [], 'cpu', margin + chartW + 7, 140, chartW - 4)
  pdf.setDrawColor(215, 225, 230)
  pdf.line(margin, 191, W - margin, 191)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(6.9)
  pdf.setTextColor(40, 55, 65)
  pdf.text('CATATAN', margin, 195)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(6.2)
  pdf.setTextColor(87, 103, 113)
  pdf.text('Workloads were observed on the same APP and collection as CPU/RAM pressure, not proven causes. Host RAM % and program PSS GB are different metrics.', margin, 198.5)
  pdf.text('Missing collection intervals remain unknown. Coverage ' + pct(quality.coverage_pct) +
    ' (' + (quality.confidence || 'UNKNOWN') + '), incomplete checks ' + format(quality.partial_or_incomplete_checks, 0) +
    '. Observations are not SM37 job executions or SAP response time.', margin, 201.6)

  // Optional appendix is emitted only for operator-selected evidence; names always wrap.
  if (selections.length) {
    pdf.addPage()
    pdf.setFillColor(248, 250, 251);pdf.rect(0, 0, W, H, 'F')
    pdf.setFillColor(15, 21, 26);pdf.roundedRect(margin, 7, contentW, 17, 1, 1, 'F')
    pdf.setFont('helvetica', 'bold');pdf.setFontSize(11);pdf.setTextColor(240, 245, 248)
    pdf.text('SPHERE  |  Selected Job & Program Evidence', margin + 4, 18)
    pdf.setFont('helvetica', 'normal');pdf.setFontSize(7);pdf.setTextColor(70, 85, 94)
    pdf.text('Period ' + month + ' WIB  |  Manually selected SPHERE observations - not a root-cause declaration', margin, 30)
    let y = 39
    const addText = (value, size = 7.5, bold = false) => {
      pdf.setFont('helvetica', bold ? 'bold' : 'normal')
      pdf.setFontSize(size)
      pdf.setTextColor(bold ? 30 : 78, bold ? 47 : 94, bold ? 60 : 103)
      const lines = pdf.splitTextToSize(String(value), contentW)
      const height = Math.max(4, lines.length * size * .42 + 2)
      if (y + height > H - 16) { pdf.addPage(); y = 18 }
      pdf.text(lines, margin, y)
      y += height
    }
    selections.forEach((row, index) => {
      const overlap = row.pressure_overlap || {}
      addText((index + 1) + '. ' + String(row.consumer_key || 'UNKNOWN') + '  (' + row.consumer_type + ')', 9, true)
      addText('APP ' + (row.hosts || []).map(labelHost).join(', ') +
        ' | Avg/peak CPU ' + pct(row.avg_cpu_pct) + '/' + pct(row.peak_cpu_pct) +
        ' | Avg/peak PSS ' + format(row.avg_pss_gb, 2) + '/' + format(row.peak_pss_gb, 2) + ' GB')
      addText('Saved collection checks ' + format(row.occurrences, 0) +
        ' | CPU pressure APP host-checks ' + format(overlap.cpu_pressure_host_checks, 0) +
        ' | RAM pressure APP host-checks ' + format(overlap.ram_pressure_host_checks, 0) +
        ' | WP APP host-checks ' + format(overlap.wp_host_checks, 0))
      y += 3
    })
  }
  const pages = pdf.internal.getNumberOfPages()
  for(let i=1;i<=pages;i++){
    pdf.setPage(i)
    pdf.setDrawColor(218, 228, 234)
    pdf.line(margin, H-7.5, W-margin, H-7.5)
    pdf.setTextColor(96, 109, 117);pdf.setFont('helvetica', 'normal');pdf.setFontSize(6.5)
    pdf.text('SPHERE  |  ' + APP_DISPLAY_VERSION + '  |  Monthly ' + month + '  |  Source: SPHERE retained history', margin, H-4)
    pdf.text('Page '+i+' / '+pages, W-margin, H-4,{align:'right'})
  }
  return pdf.output('blob')
}
