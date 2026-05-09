import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn("⚠️ Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong file .env")
}

// Sử dụng Service Role Key để backend có toàn quyền bypass RLS
export const supabase = createClient(
  supabaseUrl || '',
  supabaseServiceKey || ''
)
