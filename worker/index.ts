import 'dotenv/config'
import { processNextJob } from './lib/job-runner.js'

// Register processors here as they are implemented (T8, T9, etc.)
import './processors/parse-materials.js'
import './processors/propose-plan.js'
// import './processors/generate-lab.js'
// import './processors/generate-embeddings.js'

const POLL_INTERVAL_MS = 5000
let running = true

// Graceful shutdown
process.on('SIGTERM', () => {
  running = false
  console.log('[worker] SIGTERM received, shutting down...')
})
process.on('SIGINT', () => {
  running = false
  console.log('[worker] SIGINT received, shutting down...')
})

async function main() {
  console.log('[worker] Starting poll loop...')
  while (running) {
    try {
      const processed = await processNextJob()
      if (!processed) {
        // No pending jobs — wait before polling again
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
      }
      // If we processed a job, immediately check for the next one (no delay)
    } catch (error) {
      console.error('[worker] Poll loop error:', error)
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
    }
  }
  console.log('[worker] Shut down cleanly.')
}

main()
