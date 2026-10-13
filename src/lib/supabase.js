import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const authEnabled = false
export const publicOwner = 'local'
export const recordsTable = 'exercise_records'
export const recordColumns = 'id,user_id,workout_date,name,category,body_parts,duration,weight,sets,reps,notes,created_at,record_type,wod,set_entries,wod_mode,team_size,team_partners,team_rules'
export const supabase = url && key ? createClient(url, key, {
  auth: { persistSession: authEnabled, autoRefreshToken: authEnabled, detectSessionInUrl: authEnabled },
}) : null