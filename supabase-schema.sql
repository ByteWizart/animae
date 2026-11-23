-- Animaê · tabelas do Supabase
-- Como usar: Supabase > SQL Editor > New query > cole tudo > Run. Pode rodar de novo sem problema.
-- Cada pessoa só enxerga e altera as próprias linhas (RLS ligado).
-- Este é o ÚNICO arquivo SQL do projeto: inclui também a configuração da IA (tabela ai_config, no final).

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

-- Configuração da IA (provedor padrão + modelo de cada provedor), salva pelo painel Admin.
-- Uma única linha (id = 1). Guarda só o que não é segredo: provedor principal, reservas, modelo, modelos de reserva,
-- TPM e o endereço do provedor "Outro". As CHAVES de API não vão para o banco (variável de ambiente ou painel).
-- Sem nenhuma policy: só o servidor, com a chave service_role, lê e grava. Visitantes e usuários logados não têm acesso.
create table if not exists public.ai_config (
  id          int primary key default 1 check (id = 1),
  provider    text  not null default 'gemini',
  fallback    jsonb not null default '[]'::jsonb,
  providers   jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
alter table public.ai_config enable row level security;
revoke all on public.ai_config from anon, authenticated;
-- A linha id = 1 é criada pelo próprio servidor na primeira vez que ele conectar (com a configuração que já estiver valendo).
