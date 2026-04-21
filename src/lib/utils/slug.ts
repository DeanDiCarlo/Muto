/**
 * Slug utilities for the northstar cutover (migration 006).
 *
 * The migration backfilled existing rows with
 *   lower(regexp_replace(title, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(id, 1, 6)
 * — we mirror that regex here so new inserts match the same shape.
 */

/**
 * Lowercases, replaces non-alphanumeric runs with single hyphens, and strips
 * leading/trailing hyphens. Matches the Postgres backfill in migration 006.
 *
 * slugify('K-Means: Choosing K')        === 'k-means-choosing-k'
 * slugify('   !!! Bell States !!! ')    === 'bell-states'
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Returns a collision-free slug by appending `-2`, `-3`, … when `existsFn`
 * reports the candidate is taken. Caller supplies the scope check
 * (e.g. `(slug) => db.courses.exists({ institution_id, created_by, slug })`).
 *
 * The migration's id-suffix trick (`-<first-6-of-uuid>`) guarantees
 * uniqueness without any retry pass, so this helper is only needed when a
 * caller deliberately chooses NOT to append the id suffix — e.g. prettier
 * user-facing slugs on a feature where collision risk is acceptable.
 */
export async function ensureUniqueSlug(
  base: string,
  existsFn: (candidate: string) => Promise<boolean>,
  maxAttempts = 50
): Promise<string> {
  const seed = slugify(base) || 'untitled'
  if (!(await existsFn(seed))) return seed

  for (let n = 2; n <= maxAttempts; n++) {
    const candidate = `${seed}-${n}`
    if (!(await existsFn(candidate))) return candidate
  }

  throw new Error(`ensureUniqueSlug: could not find a free slug after ${maxAttempts} attempts for "${base}"`)
}
