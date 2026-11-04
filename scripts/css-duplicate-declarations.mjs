/** Read-only regression audit for identical adjacent CSS declarations.
 * Deliberately conservative: does not delete CSS rules or infer dead selectors.
 */
export const ADJACENT_IDENTICAL_DECLARATION = /([\w-]+)\s*:\s*([^;{}]+);(\s*)\1\s*:\s*\2\s*;/g

export function duplicateDeclarations(source) {
  return [...source.matchAll(ADJACENT_IDENTICAL_DECLARATION)]
    .map(match => ({
      property: match[1],
      value: match[2],
      line: source.slice(0, match.index).split('\n').length,
    }))
}
