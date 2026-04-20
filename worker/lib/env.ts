// Load the monorepo-root .env.local so worker and Next share one env file.
// We anchor the path to this source file's location rather than process.cwd()
// so `npm run dev` works from both the repo root and the worker/ directory.
//
// Import this BEFORE anything that reads process.env (supabase client,
// gemini client, etc.). Entry points should have it as their first import.

import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const rootEnv = resolve(here, '../../.env.local')

config({ path: rootEnv })
