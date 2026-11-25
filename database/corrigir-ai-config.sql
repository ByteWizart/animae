-- Fecha a tabela antiga ai_config (das versões anteriores) para a API pública do Supabase.
-- Rode no SQL Editor. É seguro rodar mais de uma vez; se a tabela não existir, não faz nada.
-- O servidor continua lendo essa tabela com a chave service_role (que ignora o RLS), então a migração das configurações não é afetada.

do $$
begin
  if to_regclass('public.ai_config') is not null then
    execute 'alter table public.ai_config enable row level security';
    execute 'revoke all on public.ai_config from anon, authenticated';
  end if;
end $$;

-- Conferência: todas as tabelas de public devem aparecer com rls_ligado = true.
select c.relname as tabela, c.relrowsecurity as rls_ligado
from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
order by c.relname;
