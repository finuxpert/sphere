/**
 * Publish source-backed data as soon as one request resolves.
 * The caller still uses Promise.allSettled to evaluate every source independently.
 * Rejection is intentionally preserved for conservative freshness/failure flags.
 */
export function publishOnResolve(promise, publish) {
  return Promise.resolve(promise).then((value) => {
    publish(value)
    return value
  })
}
