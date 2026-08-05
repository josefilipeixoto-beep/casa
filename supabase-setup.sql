-- Corre isto no Supabase, em SQL Editor > New query

create table if not exists budget_kv (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

alter table budget_kv enable row level security;

-- Política simples: qualquer pessoa com a chave anon pode ler/escrever.
-- Ok para uma app privada usada só por vocês os dois (o link/chaves não
-- devem ser partilhados publicamente).
create policy "allow all on budget_kv"
  on budget_kv
  for all
  using (true)
  with check (true);
