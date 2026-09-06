-- このへんにいるよ: Supabase スキーマ
-- SupabaseダッシュボードのSQL Editorにこのファイルの内容をそのまま貼って実行してください。

create extension if not exists "pgcrypto";

create table if not exists groups (
  code text primary key,
  created_at timestamptz not null default now()
);

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  group_code text not null references groups(code) on delete cascade,
  name text not null,
  lat double precision,
  lng double precision,
  updated_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  unique (group_code, name)
);

create index if not exists members_group_code_idx on members (group_code);

alter table groups enable row level security;
alter table members enable row level security;

-- ログイン無し・「コードを知っている人には見える」が仕様そのものなので、
-- 認証なしでの読み書きをそのまま許可する（設計仕様書 3.1 参照）。
create policy "anyone can read groups" on groups for select using (true);
create policy "anyone can create groups" on groups for insert with check (true);

create policy "anyone can read members" on members for select using (true);
create policy "anyone can insert members" on members for insert with check (true);
create policy "anyone can update members" on members for update using (true);
create policy "anyone can delete members" on members for delete using (true);

-- リアルタイム購読を有効化
alter publication supabase_realtime add table members;
