/* Supabase client singleton. Reads config from Vite env vars. */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // Loud, early failure beats a confusing null-client crash later.
  console.warn(
    '[MAINFRAME] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
    'Copy .env.example to .env and fill them in.'
  );
}

export const supabase: SupabaseClient = createClient(
  url ?? 'http://localhost',
  anonKey ?? 'anon',
  { auth: { persistSession: true, autoRefreshToken: true } }
);
