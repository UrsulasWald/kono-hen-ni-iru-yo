import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);

if (!supabaseConfigured) {
  console.warn(
    "Supabase の環境変数が設定されていません。.env.example を参考に .env を作成してください。"
  );
}

export const supabase = createClient(url ?? "https://placeholder.supabase.co", anonKey ?? "placeholder");

// get_group_members RPCが返す列そのまま。id/group_codeはRPCの返り値に含まれない
// (呼び出し側は既に自分のgroup_codeを知っているので不要)。
export type MemberRow = {
  name: string;
  lat: number | null;
  lng: number | null;
  updated_at: string;
  joined_at: string;
};
