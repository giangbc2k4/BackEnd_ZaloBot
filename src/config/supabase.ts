import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Service role client — bypasses RLS, used only server-side
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

// Create a client scoped to a specific user (for RLS-respecting queries)
export function createUserClient(accessToken: string) {
  return createClient(supabaseUrl, supabaseServiceKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  })
}
