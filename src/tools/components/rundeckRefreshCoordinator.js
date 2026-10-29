// Serialize collector refreshes from timer, SSE and manual collection.
// A burst of triggers produces at most one follow-up run, preventing an
// older in-flight response from overwriting a later collection snapshot.
export function coalesceAsyncRefresh(run) {
  if (typeof run !== 'function') throw new TypeError('Refresh task required')
  let running = false
  let pending = false
  return async function refresh() {
    if (running) { pending = true; return }
    running = true
    try {
      do {
        pending = false
        // The task handles per-run errors so pending triggers are not lost.
        await run()
      } while (pending)
    } finally {
      running = false
    }
  }
}
