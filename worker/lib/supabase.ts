import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

// Worker uses service role — bypasses RLS for job processing.
// Uses SUPABASE_URL (not NEXT_PUBLIC_) since this is a server-only Node.js process.
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)
