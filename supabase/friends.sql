create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text not null,
  city text,
  avatar_url text,
  rating integer not null default 1200 check (rating >= 0),
  games integer not null default 0 check (games >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,24}$')
);

create table if not exists public.friend_invites (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (sender_id <> receiver_id)
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  accepted_invite_id uuid references public.friend_invites(id) on delete set null,
  accepted_at timestamptz not null default now(),
  games_together integer not null default 0 check (games_together >= 0),
  check (user_id < friend_id),
  unique (user_id, friend_id)
);

create unique index if not exists friend_invites_one_pending_pair
  on public.friend_invites (least(sender_id, receiver_id), greatest(sender_id, receiver_id))
  where status = 'pending';

create index if not exists friend_invites_receiver_status_idx
  on public.friend_invites (receiver_id, status, created_at desc);

create index if not exists friend_invites_sender_status_idx
  on public.friend_invites (sender_id, status, created_at desc);

create index if not exists friendships_user_idx
  on public.friendships (user_id, accepted_at desc);

create index if not exists friendships_friend_idx
  on public.friendships (friend_id, accepted_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_username text;
  safe_username text;
  final_username text;
begin
  raw_username := coalesce(
    new.raw_user_meta_data->>'username',
    split_part(new.email, '@', 1),
    'jugador'
  );
  safe_username := lower(regexp_replace(raw_username, '[^a-zA-Z0-9_]+', '_', 'g'));
  safe_username := trim(both '_' from safe_username);
  if length(safe_username) < 3 then
    safe_username := 'jugador';
  end if;
  safe_username := left(safe_username, 24);
  final_username := safe_username;

  if exists (select 1 from public.profiles where username = final_username) then
    final_username := left(safe_username, 15) || '_' || left(replace(new.id::text, '-', ''), 8);
  end if;

  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    final_username,
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1), 'Jugador')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row execute function public.handle_new_user_profile();

alter table public.profiles enable row level security;
alter table public.friend_invites enable row level security;
alter table public.friendships enable row level security;

drop policy if exists "Profiles are searchable by signed in users" on public.profiles;
create policy "Profiles are searchable by signed in users"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "Users can create their own profile" on public.profiles;
create policy "Users can create their own profile"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "Users can see their friend invites" on public.friend_invites;
create policy "Users can see their friend invites"
on public.friend_invites for select
to authenticated
using (sender_id = auth.uid() or receiver_id = auth.uid());

drop policy if exists "Users can send friend invites" on public.friend_invites;
create policy "Users can send friend invites"
on public.friend_invites for insert
to authenticated
with check (
  sender_id = auth.uid()
  and status = 'pending'
  and sender_id <> receiver_id
  and not exists (
    select 1
    from public.friendships f
    where f.user_id = least(sender_id, receiver_id)
      and f.friend_id = greatest(sender_id, receiver_id)
  )
);

drop policy if exists "Users can see their friendships" on public.friendships;
create policy "Users can see their friendships"
on public.friendships for select
to authenticated
using (user_id = auth.uid() or friend_id = auth.uid());

create or replace function public.accept_friend_invite(invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.friend_invites%rowtype;
begin
  select *
  into invite
  from public.friend_invites
  where id = invite_id
    and receiver_id = auth.uid()
    and status = 'pending'
  for update;

  if not found then
    raise exception 'Invitacion no encontrada o no autorizada.';
  end if;

  update public.friend_invites
  set status = 'accepted',
      responded_at = now()
  where id = invite.id;

  insert into public.friendships (user_id, friend_id, accepted_invite_id)
  values (
    least(invite.sender_id, invite.receiver_id),
    greatest(invite.sender_id, invite.receiver_id),
    invite.id
  )
  on conflict (user_id, friend_id) do nothing;
end;
$$;

create or replace function public.reject_friend_invite(invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.friend_invites
  set status = 'rejected',
      responded_at = now()
  where id = invite_id
    and receiver_id = auth.uid()
    and status = 'pending';

  if not found then
    raise exception 'Invitacion no encontrada o no autorizada.';
  end if;
end;
$$;

grant execute on function public.accept_friend_invite(uuid) to authenticated;
grant execute on function public.reject_friend_invite(uuid) to authenticated;
