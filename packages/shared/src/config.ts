// Single source of truth for constants referenced across the frontend, worker,
// and shared schemas. v1 (~/kinetic-labs) scattered dimension values and model
// names across 7+ files; upgrading from 768 → 1536 dims required touching every
// one. Every new consumer MUST import from here.

export const EMBEDDING_MODEL = 'text-embedding-3-small' as const
export const EMBEDDING_DIM = 1536 as const

export const CHUNK_SIZE = 1000 as const
export const CHUNK_OVERLAP = 150 as const

// Default top-k for RAG retrieval. Parametrize per call site; never hardcode
// another number (v1 anti-pattern: chat/route.ts:101 hardcoded 5).
export const RAG_K_DEFAULT = 5 as const

// Retrieval tuning for buildGenerationContext.
export const SIMILAR_LABS_K = 4 as const
export const SIMILAR_LABS_MIN_QUALITY = 0.7 as const
export const COGNITIVE_SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000 // 24h

// Lab-embedding quality decay policy (out of scope for S5, pinned here so S7
// follow-up has one place to tune).
export const LAB_QUALITY_INITIAL = 1.0 as const
export const LAB_QUALITY_DECAY = 0.05 as const
export const LAB_QUALITY_FLOOR = 0.2 as const

// Embedding batch tuning — ported from v1 adaptive backoff.
export const EMBED_BATCH_SIZE = 32 as const
export const EMBED_BACKOFF_MIN_MS = 50 as const
export const EMBED_BACKOFF_MAX_MS = 2000 as const
export const EMBED_BATCH_FAIL_THRESHOLD = 0.2 as const // abort if >20% fail

// Sandpack dependency pins. v1 proved these exact versions work together
// inside the Sandpack template="react-ts" iframe. Keep in sync with the
// allowlist below.
export const SANDPACK_DEPS = {
  react: '18.2.0',
  'react-dom': '18.2.0',
  three: '0.167.1',
  '@react-three/fiber': '8.17.10',
  '@react-three/drei': '9.114.3',
  recharts: '2.12.7',
  d3: '7.9.0',
  katex: '0.16.11',
  'react-katex': '3.0.1',
  'framer-motion': '11.11.9',
  'lucide-react': '0.453.0',
} as const

// Static allowlist derived from SANDPACK_DEPS + the built-in React runtimes.
// Any import outside this list fails AST validation in the worker.
export const SANDPACK_ALLOWLIST: ReadonlyArray<string> = [
  'react',
  'react-dom',
  'react-dom/client',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'three',
  '@react-three/fiber',
  '@react-three/drei',
  'recharts',
  'd3',
  'katex',
  'react-katex',
  'framer-motion',
  'lucide-react',
]

// Hard-blocked globals that should never appear in generated Sandpack code.
export const SANDPACK_BLOCKED_GLOBALS: ReadonlyArray<string> = [
  'eval',
  'Function',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
]
