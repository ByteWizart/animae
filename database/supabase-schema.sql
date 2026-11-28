-- Animaê · tabelas do Supabase
-- Como usar: Supabase > SQL Editor > New query > cole tudo > Run. Pode rodar de novo sem problema.
-- Cada pessoa só enxerga e altera as próprias linhas (RLS ligado).
-- Este é o ÚNICO arquivo SQL do projeto: inclui também as configurações do painel Admin (tabela admin_config).

-- Vídeos gerados (histórico de cada usuário)
create table if not exists public.videos (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null default 'Sem título',
  duration    numeric not null default 0,
  look        text not null default 'cartoon',
  res         text not null default '720',
  fps         int  not null default 30,
  format      text not null default 'webm',
  bytes       bigint not null default 0,
  scenes      int  not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists videos_user_created_idx on public.videos (user_id, created_at desc);

-- Biblioteca de histórias (roteiro + JSON de cada usuário)
create table if not exists public.stories (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  story       jsonb not null,
  script      text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists stories_user_updated_idx on public.stories (user_id, updated_at desc);

alter table public.videos  enable row level security;
alter table public.stories enable row level security;

drop policy if exists "videos: dono lê"      on public.videos;
drop policy if exists "videos: dono insere"  on public.videos;
drop policy if exists "videos: dono apaga"   on public.videos;
create policy "videos: dono lê"     on public.videos for select using (auth.uid() = user_id);
create policy "videos: dono insere" on public.videos for insert with check (auth.uid() = user_id);
create policy "videos: dono apaga"  on public.videos for delete using (auth.uid() = user_id);

drop policy if exists "stories: dono lê"      on public.stories;
drop policy if exists "stories: dono insere"  on public.stories;
drop policy if exists "stories: dono altera"  on public.stories;
drop policy if exists "stories: dono apaga"   on public.stories;
create policy "stories: dono lê"     on public.stories for select using (auth.uid() = user_id);
create policy "stories: dono insere" on public.stories for insert with check (auth.uid() = user_id);
create policy "stories: dono altera" on public.stories for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "stories: dono apaga"  on public.stories for delete using (auth.uid() = user_id);

-- Configurações do painel Admin (TODAS): formato da tela e legendas, IA (provedor, reservas, modelos, TPM, limites, chaves),
-- voz, créditos (cota e custos), senha do painel (só o hash), 2FA, endereço secreto do painel e opções de login.
-- Uma única linha (id = 1) com tudo num JSON. O servidor cria a linha sozinho na primeira conexão (com a configuração que
-- já estiver valendo) e depois envia cada mudança feita no painel. Reiniciar ou trocar de servidor não perde nada.
-- Contém segredos (chaves de API, hash da senha): sem NENHUMA policy, só o servidor, com a chave service_role, lê e grava.
-- Visitantes e usuários logados não têm acesso. (Defina DATA_KEY no servidor para as chaves irem cifradas também aqui.)
create table if not exists public.admin_config (
  id          int primary key default 1 check (id = 1),
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
alter table public.admin_config enable row level security;
revoke all on public.admin_config from anon, authenticated;
-- A tabela ai_config das versões anteriores não é mais usada; se existir, o servidor lê o que ela tem uma única vez e a migra para cá.
-- Se ela ainda existe (criada por uma versão antiga, possivelmente sem RLS), fecha o acesso pela API pública: só o servidor (service_role) lê.
do $$
begin
  if to_regclass('public.ai_config') is not null then
    execute 'alter table public.ai_config enable row level security';
    execute 'revoke all on public.ai_config from anon, authenticated';
  end if;
end $$;

-- Saldos diários de créditos (uma linha por pessoa que usou hoje ou tem créditos de presente). Sem isso, reiniciar o servidor
-- (ou trocar de hospedagem) devolveria a cota cheia a todo mundo. Mesma proteção: sem policy, só o servidor (service_role) acessa.
--   key = u:<id da conta> ou ip:<hash do IP>;  d = dia (fuso de Brasília);  u = usado hoje;  b = presente (não expira);
--   w = e-mail (para o painel);  t = último uso (ms);  s = início da janela (ms). Linhas de dias antigos sem presente são apagadas pelo servidor.
create table if not exists public.credit_balances (
  key         text primary key check (char_length(key) <= 80),
  d           text   not null default '',
  u           int    not null default 0,
  b           int    not null default 0,
  w           text   not null default '',
  t           bigint not null default 0,
  updated_at  timestamptz not null default now()
);
-- s = início da janela de renovação (ms); usado quando o painel renova os créditos "a cada N horas" em vez de à meia-noite.
alter table public.credit_balances add column if not exists s bigint not null default 0;
-- x = vantagens de cupons (cota extra, desconto, ilimitado, com a data em que acabam) e cupons já usados pela pessoa: {"p":[...],"c":{"CODIGO":1}}.
alter table public.credit_balances add column if not exists x jsonb not null default '{}'::jsonb;
alter table public.credit_balances enable row level security;
revoke all on public.credit_balances from anon, authenticated;

-- Chat de suporte no modo serverless (Vercel): lá não existe disco, então todas as conversas ficam num único documento (id = 1).
-- Em servidor próprio (node server.js) essa tabela não é usada: as conversas ficam em .dados/suporte.json.
-- Mesma proteção das outras: sem policy, só o servidor (service_role) lê e grava.
create table if not exists public.support_store (
  id          int primary key default 1 check (id = 1),
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
alter table public.support_store enable row level security;
revoke all on public.support_store from anon, authenticated;

-- Permissões das tabelas (necessárias em projetos que não concedem acesso automático ao schema public).
-- service_role (chave secret): o servidor grava admin_config, vídeos e histórias.
-- authenticated (usuário logado): só videos e stories, e o RLS acima limita a cada pessoa as próprias linhas.
grant usage on schema public to service_role, authenticated;
grant all on public.admin_config, public.credit_balances, public.support_store, public.videos, public.stories to service_role;
grant select, insert, update, delete on public.videos, public.stories to authenticated;
grant usage, select on all sequences in schema public to service_role, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Endurecimento (segurança): limites de tamanho e de quantidade por usuário, e nenhum acesso para visitantes (anon).
-- Sem isso, qualquer conta gratuita poderia gravar linhas gigantes ou milhões de linhas e estourar o plano do Supabase.
-- "not valid" = vale para as linhas novas; as que já existem não são verificadas (e não quebram a execução do script).
-- ---------------------------------------------------------------------------------------------------------------
revoke all on public.videos, public.stories from anon;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'videos_limits') then
    alter table public.videos add constraint videos_limits check (
      char_length(name) <= 200 and duration between 0 and 36000 and bytes between 0 and 5000000000 and scenes between 0 and 999
      and look ~ '^[a-z0-9-]{1,30}$' and res in ('720', '1080') and fps in (30, 60) and format in ('webm', 'mp4')
    ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stories_limits') then
    alter table public.stories add constraint stories_limits check (
      char_length(id) <= 40 and char_length(name) <= 200 and char_length(script) <= 20000 and octet_length(story::text) <= 2000000
    ) not valid;
  end if;
end $$;

create or replace function public.limit_rows_per_user() returns trigger language plpgsql as $f$
declare n bigint;
begin
  execute format('select count(*) from %I.%I where user_id = $1', tg_table_schema, tg_table_name) into n using new.user_id;
  if n >= tg_argv[0]::bigint then raise exception 'Limite de % linhas por usuário atingido.', tg_argv[0] using errcode = '54000'; end if;
  return new;
end $f$;
drop trigger if exists stories_row_limit on public.stories;
create trigger stories_row_limit before insert on public.stories for each row execute function public.limit_rows_per_user(1000);
drop trigger if exists videos_row_limit on public.videos;
create trigger videos_row_limit before insert on public.videos for each row execute function public.limit_rows_per_user(20000);
