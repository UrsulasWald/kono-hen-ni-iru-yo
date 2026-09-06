-- このへんにいるよ: Supabase スキーマ
-- SupabaseダッシュボードのSQL Editorにこのファイルの内容をそのまま貼って実行してください。
--
-- 設計方針: groups/members テーブルへの直接アクセスは一切許可しない。
-- 読み書きはすべて下記のRPC関数(security definer)経由に限定する。
-- こうしないと、グループコードを知らない第三者でも
-- 「テーブルを直接クエリする」ことで全グループ・全メンバーの現在地を
-- 丸ごと取得できてしまうため(RLSの`using(true)`だけでは、
-- クライアントが送ってくる絞り込み条件そのものは強制できない)。

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

revoke all on groups from anon, authenticated;
revoke all on members from anon, authenticated;

-- 新しいグループコードを作る。既に存在すれば false を返す(呼び出し側で作り直す)。
create or replace function create_group(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into groups (code) values (p_code);
  return true;
exception when unique_violation then
  return false;
end;
$$;

-- そのコードのグループが存在するか確認する。
create or replace function group_exists(p_code text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists(select 1 from groups where code = p_code);
$$;

-- グループに参加する(既にいれば最終更新時刻だけ更新)。
create or replace function join_group(p_code text, p_name text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into members (group_code, name, updated_at)
  values (p_code, p_name, now())
  on conflict (group_code, name)
  do update set updated_at = now();
$$;

-- 自分の位置を更新する。group_code + name が一致する自分の行だけを書き換える。
create or replace function update_my_position(p_code text, p_name text, p_lat double precision, p_lng double precision)
returns void
language sql
security definer
set search_path = public
as $$
  update members
  set lat = p_lat, lng = p_lng, updated_at = now()
  where group_code = p_code and name = p_name;
$$;

-- 指定したグループのメンバー一覧を取得する。p_codeを知らない第三者はこの関数を呼べても
-- 該当グループが存在しなければ空、存在しても他グループの情報は一切返らない。
create or replace function get_group_members(p_code text)
returns table (name text, lat double precision, lng double precision, updated_at timestamptz, joined_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select m.name, m.lat, m.lng, m.updated_at, m.joined_at
  from members m
  where m.group_code = p_code
  order by m.joined_at asc;
$$;

-- グループを抜ける(自分の行だけ削除)。
create or replace function leave_group(p_code text, p_name text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from members where group_code = p_code and name = p_name;
$$;

grant execute on function create_group(text) to anon, authenticated;
grant execute on function group_exists(text) to anon, authenticated;
grant execute on function join_group(text, text) to anon, authenticated;
grant execute on function update_my_position(text, text, double precision, double precision) to anon, authenticated;
grant execute on function get_group_members(text) to anon, authenticated;
grant execute on function leave_group(text, text) to anon, authenticated;
