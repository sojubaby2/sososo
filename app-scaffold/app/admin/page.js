"use client";

// /admin
//
// [2026-09-09 추가] 재성님이 "카드 지우는 게 너무 복잡하다"고 하셔서 만든
// 간단한 관리자 화면. 예전에는 /api/feed를 직접 열어서 텍스트 안에서 id를
// 눈으로 찾아 복사한 다음, 삭제 주소를 손으로 만들어서 열어야 했음 —
// 이 화면은 그 과정을 없애고 그냥 목록에서 "삭제" 버튼만 누르면 되게 만듦.
//
// 사용법: 브라우저 주소창에 https://newsmeme.co.kr/admin 입력해서 열면 됨.
// 비밀번호로는 CRON_SECRET 값을 입력(Vercel 프로젝트 환경변수에서 확인
// 가능). 한 번 입력하면 이 브라우저에는 저장해두기 때문에 다음에 열 때는
// 다시 안 물어봄(로그아웃 버튼 누르면 다시 물어봄).
//
// 헤더 메뉴 등 사이트 어디에도 이 페이지로 가는 링크는 안 걸어뒀음 —
// 주소를 아는 사람(재성님)만 들어올 수 있게 하기 위함.

// [2026-11-04 추가] 재성님: "삭제 가능한 주소를 암호화처럼 만들어서 줘, 저장해 놓고 종종 쓰게"
//   → 로그인한 뒤 화면 위쪽 "바로가기 주소 만들기"를 누르면, 비밀번호가 뒤섞인 글자로 들어간
//     주소(https://newsmeme.co.kr/admin#k=nm1.xxxx)가 만들어지고 복사됩니다.
//     이 주소를 즐겨찾기·메모에 저장해 두면, 어느 기기에서든 열자마자 비밀번호 없이 바로 카드 목록이 나옵니다.
//   · 비밀번호는 주소의 "#" 뒤에만 들어가서 사이트 서버나 기록(로그)으로는 전송되지 않습니다.
//   · 뒤섞기는 "눈으로 봐서는 알 수 없게" 하는 정도라, 이 주소 자체를 남에게 보내면 안 됩니다.
//   · 비밀번호(CRON_SECRET)를 바꾸면 예전 바로가기 주소는 더 이상 안 통합니다 — 새로 만들면 됩니다.
//   · 목록 위에 "찾기" 칸도 추가 — 제목 몇 글자로 지울 카드를 바로 찾음.

import { useEffect, useState, useCallback } from "react";

const SECRET_STORAGE_KEY = "nm_admin_secret";
const LINK_PREFIX = "nm1.";
const MIX = "newsmeme-admin-link";

// 비밀번호 ↔ 주소에 넣을 뒤섞인 글자
function encodeKey(secret) {
  const bytes = new TextEncoder().encode(secret);
  const out = bytes.map((b, i) => b ^ MIX.charCodeAt(i % MIX.length));
  let bin = "";
  out.forEach((b) => (bin += String.fromCharCode(b)));
  return LINK_PREFIX + btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeKey(code) {
  try {
    if (!code || !code.startsWith(LINK_PREFIX)) return "";
    let b64 = code.slice(LINK_PREFIX.length).replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c, i) => c.charCodeAt(0) ^ MIX.charCodeAt(i % MIX.length));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

export default function AdminPage() {
  const [secret, setSecret] = useState("");
  const [secretInput, setSecretInput] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [query, setQuery] = useState("");
  const [linkText, setLinkText] = useState("");

  useEffect(() => {
    let saved = "";
    // [2026-11-04] 바로가기 주소(#k=...)로 들어오면 그 안의 비밀번호로 바로 로그인
    const m = /[#&]k=([^&]+)/.exec(window.location.hash || "");
    const fromLink = m ? decodeKey(decodeURIComponent(m[1])) : "";
    if (fromLink) {
      saved = fromLink;
      try {
        localStorage.setItem(SECRET_STORAGE_KEY, fromLink);
      } catch {}
    }
    try {
      if (!saved) saved = localStorage.getItem(SECRET_STORAGE_KEY) || "";
    } catch {
      // 브라우저 저장소를 못 쓰는 환경이면 그냥 매번 입력받음
    }
    if (saved) {
      setSecret(saved);
      setUnlocked(true);
    }
  }, []);

  const loadFeed = useCallback(async (secretValue) => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/feed", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data?.error || "피드를 불러오지 못했습니다.");
        setItems([]);
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setLoadError("피드를 불러오는 중 오류가 발생했습니다. 인터넷 연결을 확인해주세요.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (unlocked && secret) {
      loadFeed(secret);
    }
  }, [unlocked, secret, loadFeed]);

  function handleUnlock() {
    const trimmed = secretInput.trim();
    if (!trimmed) return;
    try {
      localStorage.setItem(SECRET_STORAGE_KEY, trimmed);
    } catch {
      // 저장 안 되더라도 이번 접속에서는 그냥 진행
    }
    setSecret(trimmed);
    setUnlocked(true);
  }

  async function makeLink() {
    const url = `${window.location.origin}/admin#k=${encodeKey(secret)}`;
    setLinkText(url);
    try {
      await navigator.clipboard.writeText(url);
      setMessage("바로가기 주소를 복사했어요. 메모장이나 즐겨찾기에 저장해 두세요(남에게는 보내지 마세요).");
    } catch {
      setMessage("아래 주소를 길게 눌러(또는 드래그해서) 복사한 뒤 저장해 두세요.");
    }
  }

  function handleLogout() {
    try {
      localStorage.removeItem(SECRET_STORAGE_KEY);
    } catch {}
    setSecret("");
    setSecretInput("");
    setUnlocked(false);
    setItems([]);
    setMessage("");
  }

  async function handleDelete(item) {
    const ok = window.confirm(`이 카드를 삭제할까요?\n\n${item.title}`);
    if (!ok) return;

    setDeletingId(item.id);
    setMessage("");
    try {
      const res = await fetch(
        `/api/admin/delete-feed-item?id=${encodeURIComponent(item.id)}`,
        { headers: { Authorization: `Bearer ${secret}` } }
      );
      const data = await res.json();

      if (res.status === 401) {
        setMessage("비밀번호(CRON_SECRET)가 올바르지 않습니다. 로그아웃 후 다시 입력해주세요.");
        return;
      }
      if (data.ok) {
        setItems((prev) => prev.filter((it) => it.id !== item.id));
        setMessage(`삭제했습니다: ${data.title || item.title}`);
      } else {
        setMessage(`삭제하지 못했습니다: ${data.reason || "알 수 없는 오류"}`);
      }
    } catch {
      setMessage("삭제 요청 중 오류가 발생했습니다.");
    } finally {
      setDeletingId(null);
    }
  }

  function formatDate(value) {
    if (!value) return "";
    try {
      return new Date(value).toLocaleString("ko-KR", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  }

  if (!unlocked) {
    return (
      <div style={styles.loginWrap}>
        <div style={styles.loginBox}>
          <h1 style={styles.loginTitle}>관리자 로그인</h1>
          <p style={styles.loginHint}>
            Cloudflare(또는 Vercel) 환경변수에 있는 CRON_SECRET 값을 입력해주세요. 한 번 들어온 뒤 "바로가기 주소 만들기"를 누르면 다음부터는 그 주소로 바로 들어올 수 있어요.
          </p>
          <input
            type="password"
            value={secretInput}
            onChange={(e) => setSecretInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleUnlock();
            }}
            placeholder="CRON_SECRET 값"
            style={styles.input}
            autoFocus
          />
          <button onClick={handleUnlock} style={styles.primaryBtn}>
            확인
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.pageWrap}>
      <div style={styles.headerRow}>
        <h1 style={styles.pageTitle}>뉴스 카드 관리</h1>
        <div>
          <button onClick={makeLink} style={styles.smallBtn}>
            바로가기 주소 만들기
          </button>
          <button onClick={() => loadFeed(secret)} style={styles.smallBtn}>
            새로고침
          </button>
          <button onClick={handleLogout} style={styles.smallBtnGhost}>
            로그아웃
          </button>
        </div>
      </div>

      {message && <div style={styles.message}>{message}</div>}
      {linkText && (
        <textarea readOnly value={linkText} onFocus={(e) => e.target.select()} style={styles.linkBox} rows={3} />
      )}
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="찾기 — 제목·종목 몇 글자 (예: 얘네는)"
        style={{ ...styles.input, marginBottom: 8 }}
      />
      {loadError && <div style={styles.error}>{loadError}</div>}
      {loading && <p style={styles.hint}>불러오는 중...</p>}
      {!loading && !loadError && items.length === 0 && (
        <p style={styles.hint}>표시할 카드가 없습니다.</p>
      )}

      <ul style={styles.list}>
        {items
          .filter((item) => {
            const q = query.trim();
            if (!q) return true;
            const hay = `${item.title || ""} ${(item.matches || []).map((m) => m.name || m).join(" ")} ${item.channel || ""}`;
            return hay.toLowerCase().includes(q.toLowerCase());
          })
          .map((item) => (
          <li key={item.id} style={styles.listItem}>
            <div style={styles.itemInfo}>
              <div style={styles.itemTitle}>{item.title}</div>
              <div style={styles.itemMeta}>
                {formatDate(item.savedAt || item.pubDate)}
                {item.source ? ` · ${item.source}` : ""}
                {item.channel ? ` · ${item.channel}` : ""}
              </div>
              {item.matches && item.matches.length > 0 && (
                <div style={styles.itemMatches}>
                  관련주: {item.matches.map((m) => m.name || m).join(", ")}
                </div>
              )}
            </div>
            <button
              onClick={() => handleDelete(item)}
              disabled={deletingId === item.id}
              style={styles.deleteBtn}
            >
              {deletingId === item.id ? "삭제 중..." : "삭제"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const styles = {
  loginWrap: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  loginBox: {
    width: "100%",
    maxWidth: 360,
    padding: 24,
    border: "1px solid #e5e5e5",
    borderRadius: 12,
  },
  loginTitle: { fontSize: 20, fontWeight: 700, marginBottom: 8 },
  loginHint: { fontSize: 13, color: "#777", marginBottom: 16, lineHeight: 1.5 },
  input: {
    width: "100%",
    padding: "10px 12px",
    fontSize: 15,
    borderRadius: 8,
    border: "1px solid #ccc",
    boxSizing: "border-box",
    marginBottom: 12,
  },
  primaryBtn: {
    width: "100%",
    padding: "10px 12px",
    fontSize: 15,
    fontWeight: 600,
    color: "#fff",
    background: "#c6862b",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
  },
  pageWrap: { maxWidth: 720, margin: "0 auto", padding: "24px 16px 80px" },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  pageTitle: { fontSize: 20, fontWeight: 700 },
  smallBtn: {
    fontSize: 13,
    padding: "6px 12px",
    borderRadius: 6,
    border: "1px solid #ccc",
    background: "#fff",
    cursor: "pointer",
    marginRight: 8,
  },
  smallBtnGhost: {
    fontSize: 13,
    padding: "6px 12px",
    borderRadius: 6,
    border: "1px solid transparent",
    background: "transparent",
    color: "#888",
    cursor: "pointer",
  },
  message: {
    padding: "10px 12px",
    background: "#fff7e6",
    border: "1px solid #ffe0a3",
    borderRadius: 8,
    fontSize: 13,
    marginBottom: 12,
  },
  error: {
    padding: "10px 12px",
    background: "#fdecec",
    border: "1px solid #f5b3b3",
    borderRadius: 8,
    fontSize: 13,
    marginBottom: 12,
    color: "#a33",
  },
  hint: { fontSize: 13, color: "#888" },
  linkBox: {
    width: "100%",
    padding: "10px 12px",
    fontSize: 12,
    fontFamily: "monospace",
    borderRadius: 8,
    border: "1px solid #ccc",
    boxSizing: "border-box",
    marginBottom: 12,
    wordBreak: "break-all",
    resize: "none",
  },
  list: { listStyle: "none", padding: 0, margin: 0 },
  listItem: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    padding: "12px 0",
    borderBottom: "1px solid #eee",
  },
  itemInfo: { flex: 1, minWidth: 0 },
  itemTitle: { fontSize: 14, fontWeight: 600, lineHeight: 1.4 },
  itemMeta: { fontSize: 12, color: "#999", marginTop: 4 },
  itemMatches: { fontSize: 12, color: "#c6862b", marginTop: 4 },
  deleteBtn: {
    flexShrink: 0,
    fontSize: 13,
    padding: "8px 14px",
    borderRadius: 6,
    border: "none",
    background: "#d64545",
    color: "#fff",
    cursor: "pointer",
  },
};
