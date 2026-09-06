export function fmtDist(m: number): string {
  if (m < 1000) return Math.round(m / 10) * 10 + "m";
  return (m / 1000).toFixed(1) + "km";
}

export function fmtAgo(t: number): string {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 20) return "たった今";
  if (s < 60) return s + "秒前";
  const min = Math.floor(s / 60);
  return min + "分前";
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c] as string
  );
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function genCode(): string {
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
}
