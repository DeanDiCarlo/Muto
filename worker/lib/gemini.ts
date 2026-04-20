import { GoogleGenAI } from '@google/genai'
import './env.js'

// Worker uses Google's unified GenAI SDK (@google/genai) to talk to Gemini.
// One client instance handles both Flash and Pro — the model is selected per
// request on each generateContent call. We expose two exported model constants
// to make intent explicit at the call site.
//
// Fail-fast on missing key (same pattern as worker/lib/supabase.ts).

if (!process.env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY is not set. The worker cannot start without it.')
}

export const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

// Model identifiers — keep these as string constants so cost-tracker and
// parse-materials reference the same name and stay in sync with pricing keys
// in worker/lib/cost-tracker.ts.
export const GEMINI_FLASH_MODEL = 'gemini-2.5-flash' as const
export const GEMINI_PRO_MODEL = 'gemini-2.5-pro' as const

export type GeminiModel = typeof GEMINI_FLASH_MODEL | typeof GEMINI_PRO_MODEL
