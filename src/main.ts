import "./style.css";
import { supabase, supabaseConfigured, type MemberRow } from "./lib/supabase";
import { haversine, bearing, bearingToRad } from "./lib/geo";
import { fmtDist, fmtAgo, escapeHtml, genCode } from "./lib/format";
import { assignMemberColors, SELF_COLOR, type MemberColor } from "./lib/colors";
import type { RealtimeChannel } from "@supabase/supabase-js";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const SESSION_KEY = "konohen:session";
const SEND_INTERVAL_MS = 8000;
const POLL_INTERVAL_MS = 5000;
const STALE_MS = 5 * 60 * 1000;

type Session = { code: string; name: string };

type State = {
  code: string | null;
  name: string | null;
  myPos: { lat: number; lng: number } | null;
  members: MemberRow[];
  lastSent: number;
  watchId: number | null;
  pollTimer: number | null;
  channel: RealtimeChannel | null;
};

const state: State = {
  code: null,
  name: null,
  myPos: null,
  members: [],
  lastSent: 0,
  watchId: null,
  pollTimer: null,
  channel: null,
};

// ---------- session persistence ----------
function saveSession(code: string, name: string) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ code, name } satisfies Session));
}
function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.code === "string" && typeof parsed?.name === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}
function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

// ---------- setup screen ----------
function showSetupError(msg: string) {
  const box = $("setupError");
  box.textContent = msg;
  box.classList.remove("hidden");
}
function hideSetupError() {
  $("setupError").classList.add("hidden");
}

$("createBtn").addEventListener("click", async () => {
  const name = $<HTMLInputElement>("nameInput").value.trim();
  if (!name) {
    showSetupError("名前を入れてね。");
    return;
  }
  if (!supabaseConfigured) {
    showSetupError("Supabaseの設定が未完了です。.envを確認してください。");
    return;
  }
  hideSetupError();

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = genCode();
    const { error } = await supabase.from("groups").insert({ code });
    if (!error) {
      await joinAsMember(code, name);
      startGroup(code, name);
      return;
    }
    if (error.code !== "23505") {
      showSetupError("グループの作成に失敗しました。もう一度お試しください。");
      return;
    }
    // コードが衝突した場合は作り直す
  }
  showSetupError("グループの作成に失敗しました。もう一度お試しください。");
});

$("joinBtn").addEventListener("click", async () => {
  const name = $<HTMLInputElement>("nameInput").value.trim();
  const code = $<HTMLInputElement>("joinInput").value.trim().toUpperCase();
  if (!name) {
    showSetupError("名前を入れてね。");
    return;
  }
  if (code.length !== 4) {
    showSetupError("コードは4文字です。");
    return;
  }
  if (!supabaseConfigured) {
    showSetupError("Supabaseの設定が未完了です。.envを確認してください。");
    return;
  }
  hideSetupError();

  const { data, error } = await supabase.from("groups").select("code").eq("code", code).maybeSingle();
  if (error || !data) {
    showSetupError("そのコードのグループが見つかりませんでした。");
    return;
  }
  await joinAsMember(code, name);
  startGroup(code, name);
});

$<HTMLInputElement>("joinInput").addEventListener("input", (e) => {
  const target = e.target as HTMLInputElement;
  target.value = target.value.toUpperCase();
});

async function joinAsMember(code: string, name: string) {
  await supabase
    .from("members")
    .upsert(
      { group_code: code, name, updated_at: new Date().toISOString() },
      { onConflict: "group_code,name" }
    );
}

// ---------- transition ----------
function startGroup(code: string, name: string) {
  state.code = code;
  state.name = name;
  saveSession(code, name);

  $("screen-setup").classList.add("hidden");
  $("screen-app").classList.remove("hidden");
  $("codeDisplay").textContent = code;

  startGeolocation();
  fetchMembers();
  subscribeRealtime(code);
  state.pollTimer = window.setInterval(fetchMembers, POLL_INTERVAL_MS);
}

$("copyBtn").addEventListener("click", () => {
  if (!state.code) return;
  navigator.clipboard.writeText(state.code).then(() => {
    const btn = $("copyBtn");
    btn.textContent = "✓";
    setTimeout(() => {
      btn.textContent = "⧉";
    }, 1200);
  });
});

$("leaveBtn").addEventListener("click", async () => {
  const { code, name } = state;
  if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
  if (state.pollTimer !== null) clearInterval(state.pollTimer);
  if (state.channel) supabase.removeChannel(state.channel);

  if (code && name) {
    supabase.from("members").delete().eq("group_code", code).eq("name", name).then(
      () => {},
      () => {}
    );
  }

  clearSession();
  state.code = null;
  state.name = null;
  state.myPos = null;
  state.members = [];
  state.lastSent = 0;
  state.watchId = null;
  state.pollTimer = null;
  state.channel = null;

  $("screen-app").classList.add("hidden");
  $("screen-setup").classList.remove("hidden");
  $<HTMLInputElement>("nameInput").value = "";
  $<HTMLInputElement>("joinInput").value = "";
  hideSetupError();
});

// ---------- geolocation ----------
function startGeolocation() {
  if (!navigator.geolocation) {
    showGeoError("この端末では位置情報が使えないようです。");
    return;
  }
  state.watchId = navigator.geolocation.watchPosition(
    (pos) => {
      $("geoError").classList.add("hidden");
      state.myPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      $("statusText").textContent = "位置情報 取得済み";
      const now = Date.now();
      if (now - state.lastSent > SEND_INTERVAL_MS) {
        state.lastSent = now;
        pushMyPosition();
      }
      render();
    },
    () => {
      showGeoError("位置情報を許可してください。設定から「位置情報の利用」をオンにすると使えます。");
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );
}
function showGeoError(msg: string) {
  const box = $("geoError");
  box.textContent = msg;
  box.classList.remove("hidden");
}

async function pushMyPosition() {
  if (!state.myPos || !state.code || !state.name) return;
  await supabase
    .from("members")
    .update({
      lat: state.myPos.lat,
      lng: state.myPos.lng,
      updated_at: new Date().toISOString(),
    })
    .eq("group_code", state.code)
    .eq("name", state.name);
}

// ---------- data sync ----------
async function fetchMembers() {
  if (!state.code) return;
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("group_code", state.code)
    .order("joined_at", { ascending: true });
  if (error || !data) return;
  state.members = data as MemberRow[];
  render();
}

function subscribeRealtime(code: string) {
  state.channel = supabase
    .channel(`group:${code}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "members", filter: `group_code=eq.${code}` },
      () => fetchMembers()
    )
    .subscribe();
}

// ---------- render ----------
type Enriched = { name: string; dist: number; bearing: number; t: number; color: MemberColor };

function render() {
  if (!state.name) return;
  const colorByName = assignMemberColors(state.members);
  const others = state.members.filter((m) => m.name !== state.name && m.lat !== null && m.lng !== null);

  if (!state.myPos) {
    renderRadar([], 300);
    $("memberList").innerHTML = '<div class="empty-hint">自分の位置を待っています…</div>';
    return;
  }

  const enriched: Enriched[] = others
    .map((m) => {
      const d = haversine(state.myPos!.lat, state.myPos!.lng, m.lat!, m.lng!);
      const b = bearing(state.myPos!.lat, state.myPos!.lng, m.lat!, m.lng!);
      return {
        name: m.name,
        dist: d,
        bearing: b,
        t: new Date(m.updated_at).getTime(),
        color: colorByName.get(m.name) ?? SELF_COLOR,
      };
    })
    .sort((a, b) => a.dist - b.dist);

  const maxDist = Math.max(100, ...enriched.map((e) => e.dist), 0) * 1.25;
  renderRadar(enriched, maxDist);

  if (enriched.length === 0) {
    $("memberList").innerHTML =
      '<div class="empty-hint">まだ他のメンバーがいません。<br>コードを共有して呼んでみて。</div>';
    return;
  }

  $("memberList").innerHTML = enriched
    .map((e) => {
      const stale = Date.now() - e.t > STALE_MS;
      return `
        <div class="member-row">
          <div class="avatar" style="background:${e.color.bg}; color:${e.color.text};">${escapeHtml(
        e.name.charAt(0)
      )}</div>
          <div class="member-info">
            <div class="member-name">${escapeHtml(e.name)}</div>
            <div class="member-time">${fmtAgo(e.t)}${stale ? "・更新が止まっています" : ""}</div>
          </div>
          <div class="member-dist${stale ? " stale-txt" : ""}">${fmtDist(e.dist)}</div>
        </div>
      `;
    })
    .join("");
}

function renderRadar(entries: Enriched[], maxDist: number) {
  const svg = $("radarSvg");
  const cx = 150,
    cy = 150,
    R = 128;
  const parts: string[] = [];

  [1, 2, 3].forEach((i) => {
    const r = (R * i) / 3;
    parts.push(
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--line)" stroke-width="1.4" stroke-dasharray="3 5" filter="url(#wobble)"/>`
    );
    const label = fmtDist((maxDist * i) / 3);
    parts.push(`<text x="${cx + 6}" y="${cy - r + 4}" class="radar-label">${label}</text>`);
  });

  parts.push(
    `<text x="${cx}" y="${cy - R - 10}" text-anchor="middle" class="radar-label" style="font-size:15px;">N</text>`
  );

  entries.forEach((e) => {
    const scaled = Math.min(e.dist / maxDist, 1) * R;
    const rad = bearingToRad(e.bearing);
    const x = cx + scaled * Math.sin(rad);
    const y = cy - scaled * Math.cos(rad);
    const stale = Date.now() - e.t > STALE_MS;
    parts.push(`
      <g class="member-dot ${stale ? "stale" : ""}">
        <circle cx="${x}" cy="${y}" r="15" fill="${e.color.bg}" stroke="var(--ink)" stroke-width="2"/>
        <text x="${x}" y="${y + 4}" text-anchor="middle" fill="${e.color.text}">${escapeHtml(
      e.name.charAt(0)
    )}</text>
      </g>
    `);
  });

  parts.push(`<circle cx="${cx}" cy="${cy}" r="9" fill="${SELF_COLOR.bg}" stroke="#fff" stroke-width="2.5"/>`);
  parts.push(
    `<circle cx="${cx}" cy="${cy}" r="9" fill="none" stroke="${SELF_COLOR.bg}" stroke-width="1.5" opacity="0.5"><animate attributeName="r" values="9;22;9" dur="2.4s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.5;0;0.5" dur="2.4s" repeatCount="indefinite"/></circle>`
  );

  svg.innerHTML = parts.join("");
}

// ---------- boot ----------
async function boot() {
  const session = loadSession();
  if (!session || !supabaseConfigured) {
    $("screen-setup").classList.remove("hidden");
    return;
  }

  const { data, error } = await supabase
    .from("groups")
    .select("code")
    .eq("code", session.code)
    .maybeSingle();

  if (error || !data) {
    clearSession();
    $("screen-setup").classList.remove("hidden");
    return;
  }

  $<HTMLInputElement>("nameInput").value = session.name;
  await joinAsMember(session.code, session.name);
  startGroup(session.code, session.name);
}

boot();
