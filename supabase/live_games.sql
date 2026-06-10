create table if not exists public.live_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished', 'cancelled')),
  max_players integer not null default 2 check (max_players = 2),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create table if not exists public.live_room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.live_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  seat integer not null check (seat in (1, 2)),
  is_ready boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (room_id, user_id),
  unique (room_id, seat)
);

create table if not exists public.live_game_state (
  room_id uuid primary key references public.live_rooms(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  turn_user_id uuid references public.profiles(id) on delete set null,
  version integer not null default 0 check (version >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.live_game_actions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.live_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  action_type text not null,
  payload jsonb not null default '{}'::jsonb,
  version integer not null check (version >= 0),
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_rooms'
  ) then
    alter publication supabase_realtime add table public.live_rooms;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_room_players'
  ) then
    alter publication supabase_realtime add table public.live_room_players;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_game_state'
  ) then
    alter publication supabase_realtime add table public.live_game_state;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_game_actions'
  ) then
    alter publication supabase_realtime add table public.live_game_actions;
  end if;
end;
$$;

create index if not exists live_rooms_code_idx
  on public.live_rooms (code);

create index if not exists live_room_players_user_idx
  on public.live_room_players (user_id, joined_at desc);

create index if not exists live_room_players_room_idx
  on public.live_room_players (room_id, seat);

create index if not exists live_game_actions_room_version_idx
  on public.live_game_actions (room_id, version);

alter table public.live_rooms enable row level security;
alter table public.live_room_players enable row level security;
alter table public.live_game_state enable row level security;
alter table public.live_game_actions enable row level security;

drop policy if exists "Players can see their live rooms" on public.live_rooms;
create policy "Players can see their live rooms"
on public.live_rooms for select
to authenticated
using (
  exists (
    select 1
    from public.live_room_players p
    where p.room_id = live_rooms.id
      and p.user_id = auth.uid()
  )
);

drop policy if exists "Players can see room players" on public.live_room_players;
create policy "Players can see room players"
on public.live_room_players for select
to authenticated
using (true);

drop policy if exists "Players can see live game state" on public.live_game_state;
create policy "Players can see live game state"
on public.live_game_state for select
to authenticated
using (
  exists (
    select 1
    from public.live_room_players p
    where p.room_id = live_game_state.room_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists "Players can see live game actions" on public.live_game_actions;
create policy "Players can see live game actions"
on public.live_game_actions for select
to authenticated
using (
  exists (
    select 1
    from public.live_room_players p
    where p.room_id = live_game_actions.room_id
      and p.user_id = auth.uid()
  )
);

create or replace function public.generate_live_room_code()
returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  output text := '';
  i integer;
begin
  for i in 1..6 loop
    output := output || substr(alphabet, floor(random() * length(alphabet) + 1)::integer, 1);
  end loop;
  return output;
end;
$$;

create or replace function public.create_live_room()
returns table (
  id uuid,
  code text,
  host_id uuid,
  status text,
  max_players integer,
  created_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  next_code text;
  next_room_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion para crear una sala.';
  end if;

  loop
    next_code := public.generate_live_room_code();
    exit when not exists (select 1 from public.live_rooms r where r.code = next_code);
  end loop;

  insert into public.live_rooms (code, host_id)
  values (next_code, auth.uid())
  returning live_rooms.id into next_room_id;

  insert into public.live_room_players (room_id, user_id, seat, is_ready)
  values (next_room_id, auth.uid(), 1, true);

  insert into public.live_game_state (room_id, state, version)
  values (next_room_id, '{}'::jsonb, 0);

  return query
  select r.id, r.code, r.host_id, r.status, r.max_players, r.created_at, r.started_at, r.finished_at
  from public.live_rooms r
  where r.id = next_room_id;
end;
$$;

create or replace function public.join_live_room(room_code text)
returns table (
  id uuid,
  code text,
  host_id uuid,
  status text,
  max_players integer,
  created_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_room public.live_rooms%rowtype;
  player_count integer;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion para unirte a una sala.';
  end if;

  select *
  into target_room
  from public.live_rooms r
  where r.code = upper(trim(room_code))
    and r.status in ('waiting', 'playing')
  for update;

  if not found then
    raise exception 'Sala no encontrada.';
  end if;

  if exists (
    select 1 from public.live_room_players p
    where p.room_id = target_room.id
      and p.user_id = auth.uid()
  ) then
    return query
    select r.id, r.code, r.host_id, r.status, r.max_players, r.created_at, r.started_at, r.finished_at
    from public.live_rooms r
    where r.id = target_room.id;
    return;
  end if;

  select count(*)
  into player_count
  from public.live_room_players p
  where p.room_id = target_room.id;

  if player_count >= target_room.max_players then
    raise exception 'La sala ya esta llena.';
  end if;

  insert into public.live_room_players (room_id, user_id, seat, is_ready)
  values (target_room.id, auth.uid(), player_count + 1, true);

  if player_count + 1 >= target_room.max_players then
    update public.live_rooms
    set status = 'playing',
        started_at = coalesce(live_rooms.started_at, now())
    where live_rooms.id = target_room.id;
  end if;

  return query
  select r.id, r.code, r.host_id, r.status, r.max_players, r.created_at, r.started_at, r.finished_at
  from public.live_rooms r
  where r.id = target_room.id;
end;
$$;

create or replace function public.start_live_game(
  target_room_id uuid,
  initial_state jsonb,
  first_turn_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_room public.live_rooms%rowtype;
  player_count integer;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion para iniciar una partida.';
  end if;

  select *
  into target_room
  from public.live_rooms r
  where r.id = target_room_id
  for update;

  if not found then
    raise exception 'Sala no encontrada.';
  end if;

  if target_room.host_id <> auth.uid() then
    raise exception 'Solo el anfitrion puede iniciar la partida.';
  end if;

  select count(*)
  into player_count
  from public.live_room_players p
  where p.room_id = target_room_id;

  if player_count < 2 then
    raise exception 'Falta un jugador para iniciar.';
  end if;

  if not exists (
    select 1
    from public.live_room_players p
    where p.room_id = target_room_id
      and p.user_id = first_turn_user_id
  ) then
    raise exception 'El primer turno debe pertenecer a un jugador de la sala.';
  end if;

  update public.live_rooms
  set status = 'playing',
      started_at = coalesce(live_rooms.started_at, now())
  where live_rooms.id = target_room_id;

  insert into public.live_game_state (room_id, state, turn_user_id, version, updated_at)
  values (target_room_id, initial_state, first_turn_user_id, 1, now())
  on conflict (room_id) do update
  set state = excluded.state,
      turn_user_id = excluded.turn_user_id,
      version = 1,
      updated_at = now();

  insert into public.live_game_actions (room_id, user_id, action_type, payload, version)
  values (target_room_id, auth.uid(), 'start', initial_state, 1);
end;
$$;

create or replace function public.submit_live_game_state(
  target_room_id uuid,
  expected_version integer,
  next_state jsonb,
  next_turn_user_id uuid,
  action_type text,
  action_payload jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_state public.live_game_state%rowtype;
  next_version integer;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion para jugar.';
  end if;

  select *
  into current_state
  from public.live_game_state s
  where s.room_id = target_room_id
  for update;

  if not found then
    raise exception 'Partida no encontrada.';
  end if;

  if current_state.version <> expected_version then
    raise exception 'La partida cambio. Actualiza e intenta de nuevo.';
  end if;

  if current_state.turn_user_id <> auth.uid() then
    raise exception 'No es tu turno.';
  end if;

  if next_turn_user_id is not null and not exists (
    select 1
    from public.live_room_players p
    where p.room_id = target_room_id
      and p.user_id = next_turn_user_id
  ) then
    raise exception 'El siguiente turno debe pertenecer a un jugador de la sala.';
  end if;

  next_version := current_state.version + 1;

  insert into public.live_game_actions (room_id, user_id, action_type, payload, version)
  values (target_room_id, auth.uid(), action_type, coalesce(action_payload, '{}'::jsonb), next_version);

  update public.live_game_state
  set state = next_state,
      turn_user_id = next_turn_user_id,
      version = next_version,
      updated_at = now()
  where live_game_state.room_id = target_room_id;

  return next_version;
end;
$$;

grant execute on function public.create_live_room() to authenticated;
grant execute on function public.join_live_room(text) to authenticated;
grant execute on function public.start_live_game(uuid, jsonb, uuid) to authenticated;
grant execute on function public.submit_live_game_state(uuid, integer, jsonb, uuid, text, jsonb) to authenticated;
