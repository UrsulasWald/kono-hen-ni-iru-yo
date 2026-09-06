import type { MemberRow } from "./supabase";

export const SELF_COLOR = { bg: "#F8A4A4", text: "#4A4A48" };

// 自分以外のメンバーカラー。参加順に割り当て、6人目以降は先頭に戻ってループする。
const PALETTE = [
  { bg: "#C5E063", text: "#4A4A48" }, // 1人目
  { bg: "#8FC2DA", text: "#4A4A48" }, // 2人目
  { bg: "#AC91DD", text: "#FFFFFF" }, // 3人目
  { bg: "#54B65C", text: "#FFFFFF" }, // 4人目
  { bg: "#E5E785", text: "#4A4A48" }, // 5人目以降
];

export type MemberColor = { bg: string; text: string };

// group内の参加順(joined_at昇順)から、メンバーごとの色を計算する。
// 自分の色は呼び出し側で常にSELF_COLORに上書きする。
export function assignMemberColors(members: MemberRow[]): Map<string, MemberColor> {
  const sorted = [...members].sort(
    (a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()
  );
  const map = new Map<string, MemberColor>();
  sorted.forEach((m, i) => {
    map.set(m.name, PALETTE[i % PALETTE.length]);
  });
  return map;
}
