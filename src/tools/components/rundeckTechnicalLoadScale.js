/** Source-preserving visual scale for saved Technical Load samples.
 * Full view remains the default; Typical may hide extreme values from the plot,
 * but always reports their true peak, observation time and outlier count.
 */
export function technicalLoadScale(items = [], mode = 'max') {
  const key = mode === 'avg' ? 'avg_value' : 'max_value'
  const samples = (Array.isArray(items) ? items : []).filter(row => row &&
    row[key] !== null && row[key] !== undefined && row[key] !== '' &&
    Number.isFinite(Number(row[key])) && Number(row[key]) >= 0)
    .map(row => ({value:Number(row[key]),host:String(row.host || ''),at:row[key === 'max_value' ? 'peak_at' : 'bucket'] || row.bucket || ''}))
  if (!samples.length) return { axisMax:null, peak:null, peakHost:'', peakAt:'', outliers:0 }
  const high = samples.reduce((best,item)=>item.value > best.value ? item : best,samples[0])
  if (samples.length < 10) return { axisMax:null, peak:high.value, peakHost:high.host, peakAt:high.at, outliers:0 }
  const sorted=samples.map(row=>row.value).sort((a,b)=>a-b)
  const p90=sorted[Math.floor((sorted.length-1)*0.9)]
  const typicalMax=Math.max(5,Math.ceil(p90*1.2/2)*2)
  const clipped=high.value>typicalMax*1.35 && typicalMax>0
  return {
    axisMax:clipped?typicalMax:null,
    peak:high.value,peakHost:high.host,peakAt:high.at,
    outliers:clipped?samples.filter(row=>row.value>typicalMax).length:0
  }
}
