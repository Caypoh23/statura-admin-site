const CDN_URL = "https://esm.sh/@supabase/supabase-js@2";

export async function createSupabaseClient({ supabaseUrl, supabaseAnonKey }) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase URL and anon key are required");
  }
  const { createClient } = await import(CDN_URL);
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
}
