-- Tabela de flashcards (cache por matéria)
create table if not exists public.flashcards (
  id uuid default gen_random_uuid() primary key,
  materia_id uuid references public.materias(id) on delete cascade not null,
  cards jsonb not null default '[]',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(materia_id)
);

alter table public.flashcards enable row level security;

create policy "Users can manage their own flashcards"
  on public.flashcards
  for all
  using (
    materia_id in (
      select id from public.materias where user_id = auth.uid()
    )
  );

-- Tabela de planos de estudo
create table if not exists public.planos_estudo (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  conteudo text not null,
  created_at timestamp with time zone default now(),
  unique(user_id)
);

alter table public.planos_estudo enable row level security;

create policy "Users can manage their own study plan"
  on public.planos_estudo
  for all
  using (user_id = auth.uid());
