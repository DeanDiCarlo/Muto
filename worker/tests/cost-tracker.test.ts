// Minimal assertion harness — no test runner, just runs via `tsx`.
// Usage: npx tsx worker/tests/cost-tracker.test.ts
//
// We intentionally avoid pulling a full test framework into the worker until
// there's enough test volume to justify it. If this file grows past ~3 cases,
// convert to vitest.
//
// NOTE: cost-tracker.ts transitively imports lib/supabase.ts, which fails
// fast if SUPABASE_URL is unset. This test only exercises pure math, so we
// stub the env vars before the dynamic import. Swap to real env vars if you
// ever want to test trackUsage() here.

process.env.SUPABASE_URL ??= 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'stub-key-for-test-only'

const { calcGeminiCostCents, GEMINI_PRICING } = await import('../lib/cost-tracker.js')

let failed = 0
function assertEq(label: string, actual: number, expected: number) {
  if (actual === expected) {
    console.log(`PASS  ${label} -> ${actual}`)
  } else {
    console.error(`FAIL  ${label} -> expected ${expected}, got ${actual}`)
    failed++
  }
}

// 1M input + 1M output on Flash:
//   (1 * $0.30) + (1 * $2.50) = $2.80 = 280 cents
assertEq('flash 1M/1M', calcGeminiCostCents('gemini-2.5-flash', 1_000_000, 1_000_000), 280)

// 1M input + 1M output on Pro:
//   (1 * $1.25) + (1 * $10.00) = $11.25 = 1125 cents
assertEq('pro 1M/1M', calcGeminiCostCents('gemini-2.5-pro', 1_000_000, 1_000_000), 1125)

// Fractional call rounds up (never charge less than actual):
//   1000 in, 1000 out on Flash: (1000/1M * 0.30) + (1000/1M * 2.50) = $0.0028 -> 0.28 cents -> ceil = 1 cent
assertEq('flash tiny rounds up', calcGeminiCostCents('gemini-2.5-flash', 1000, 1000), 1)

// Zero usage -> zero cents (not negative, not NaN):
assertEq('zero usage', calcGeminiCostCents('gemini-2.5-flash', 0, 0), 0)

// Negative inputs clamp to zero:
assertEq('negative clamps', calcGeminiCostCents('gemini-2.5-flash', -5, -5), 0)

// Sanity: pricing constants are structurally what we expect.
const flashPricing = GEMINI_PRICING['gemini-2.5-flash']
assertEq('flash input per M', flashPricing.inputPerMillion * 100, 30) // $0.30
assertEq('flash output per M', flashPricing.outputPerMillion * 100, 250) // $2.50

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed.`)
  process.exit(1)
}
console.log('\nAll assertions passed.')

// Make this file an ES module so top-level await type-checks.
export {}
