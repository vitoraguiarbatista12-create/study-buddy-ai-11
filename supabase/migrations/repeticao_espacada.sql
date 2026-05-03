-- Tabela de revisões agendadas (repetição espaçada)
create table if not exists public.revisoes_agendadas (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  materia_id uuid references public.materias(id) on delete cascade not null,

  -- Dados SM-2
  intervalo_dias integer not null default 1,
  facilidade numeric(4,2) not null default 2.5,
  repeticoes integer not null default 0,
  ultima_nota numeric(4,1) not null default 0,
  proxima_revisao date not null,

  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),

  unique(user_id, materia_id)
);

alter table public.revisoes_agendadas enable row level security;

create policy "Users can manage their own scheduled reviews"
  on public.revisoes_agendadas
  for all
  using (user_id = auth.uid());

-- Índice para buscar revisões pendentes por data
create index if not exists revisoes_por_data
  on public.revisoes_agendadas(user_id, proxima_revisao);
