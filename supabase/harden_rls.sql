-- 既存のSupabaseプロジェクト用の移行スクリプト。
-- 「groups/membersを直接読み書き自由」だった古い設定を、
-- RPC関数経由のみに絞る新しい設定へ置き換える。
-- SupabaseのSQL Editorでこのファイルの内容を一度だけ実行してください。
-- 実行後、supabase/schema.sql の内容がそのまま最新の正しい状態になっている。

drop policy if exists "anyone can read groups" on groups;
drop policy if exists "anyone can create groups" on groups;
drop policy if exists "anyone can read members" on members;
drop policy if exists "anyone can insert members" on members;
drop policy if exists "anyone can update members" on members;
drop policy if exists "anyone can delete members" on members;

-- リアルタイム購読(postgres_changes)はRLSでの読み取り許可が必要なため、
-- 直接アクセスを塞ぐこの方針とは両立しない。ポーリングに一本化するので購読を外す。
alter publication supabase_realtime drop table if exists members;

-- 以降は supabase/schema.sql と同じ内容(冪等なので、まとめて実行してOK)。
