-- Squad Tracker database setup
-- Paste this whole file into Supabase: SQL Editor -> New query -> Run.

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  gamertag text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  played_at timestamptz not null default now(),
  mode text not null,
  placement int not null check (placement >= 1 and placement <= 100),
  drop_spot text,
  elim_cause text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists match_stats (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  kills int not null default 0 check (kills >= 0),
  damage int not null default 0 check (damage >= 0),
  assists int not null default 0 check (assists >= 0),
  unique (match_id, player_id)
);

create index if not exists matches_played_at_idx on matches (played_at desc);
create index if not exists match_stats_match_idx on match_stats (match_id);

-- Row Level Security: anyone with the site link can read and log games.
-- Fine for a private squad link. See README for locking it down later.
alter table players enable row level security;
alter table matches enable row level security;
alter table match_stats enable row level security;

drop policy if exists "squad all players" on players;
drop policy if exists "squad all matches" on matches;
drop policy if exists "squad all stats" on match_stats;

create policy "squad all players" on players for all to anon, authenticated using (true) with check (true);
create policy "squad all matches" on matches for all to anon, authenticated using (true) with check (true);
create policy "squad all stats" on match_stats for all to anon, authenticated using (true) with check (true);
