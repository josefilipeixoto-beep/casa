import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  // eslint-disable-next-line no-console
  console.error(
    "Faltam VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Define-as no ficheiro .env (local) ou nas variáveis de ambiente do Netlify."
  );
}

export const supabase = createClient(url, key);

// Guarda tudo numa única tabela "budget_kv" (key/value em jsonb).
// key é um destes 3 valores: 'settings' | 'current-month' | 'history'
export async function loadKV(key_) {
  const { data, error } = await supabase
    .from("budget_kv")
    .select("value")
    .eq("key", key_)
    .maybeSingle();
  if (error) throw error;
  return data ? data.value : null;
}

export async function saveKV(key_, value) {
  const { error } = await supabase
    .from("budget_kv")
    .upsert({ key: key_, value, updated_at: new Date().toISOString() });
  if (error) throw error;
}

