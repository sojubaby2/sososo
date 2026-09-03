"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useRef, useState } from "react";
import { Newspaper, Loader2, Flame, Bell, Globe, Volume2, VolumeX, Smartphone, X } from "lucide-react";
import Header from "../components/Header";
import NewsCard from "../components/NewsCard";
import { isPoliticalTheme } from "../lib/themeData";

const HOT_THEME_COUNT = 8;
const FEED_POLL_MS = 10000; // check for new articles every 10s
const TRENDING_STOCK_COUNT = 14;
const ALERT_KEYWORDS = ["공급계약", "특허", "FDA", "무상증자", "단독", "세계 최초", "국내 최초", "인수", "합병", "수주", "유상증자"];

// Short beep via Web Audio — no audio file to host/fetch. Browsers block
// audio autoplay until the user has interacted with the page at least
// once, which is exactly what clicking the toggle button provides.
function playAlertBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1046, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.42);
  } catch {
    // Web Audio unavailable — fail quietly, the visual toast still shows
  }
}

// Turns a saved /api/poll feed item into the shape NewsCard expects.
function toCardShape(item) {
  const hasLegitimate = item.matches.some((m) => m.confidence === "confirmed" || m.confidence === "theme");
  const reason = item.matches
    .map((m) => m.reason)
    .filter(Boolean)
    .slice(0, 3)
    .join(" / ");
  // Any match Claude tagged with a confirmed negative-catalyst type (유상증자
  // 등) — surfaced once at the card level for the "악재" badge, and again
  // per-chip so it's clear exactly which stock it's about.
  const badMatch = item.matches.find((m) => m.catalyst);

  return {
    id: item.id,
    time: item.pubDate || "",
    source: item.keyword,
    headline: item.title,
    summary: item.summary,
    link: item.link,
    confidence: hasLegitimate ? "confirmed" : "rumor",
    reason: reason || "관련 근거 정보 없음",
    badCatalyst: badMatch?.catalyst || null,
    stocks: item.matches.map((m) => ({ name: m.name, code: m.code, market: m.market, catalyst: m.catalyst || null })),
  };
}

// Compact sidebar panel — a smaller reference version of what used to be a
// big colored grid across the top of the page. Toggle switches between the
// 1-week and 1-month change field from /api/theme-momentum.
function HotThemePanel() {
  const [rawThemes, setRawThemes] = useState([]);
  const [state, setState] = useState("loading");
  const [range, setRange] = useState("1M"); // "1W" | "1M"

  useEffect(() => {
    fetch("/api/theme-momentum")
      .then((r) => r.json())
      .then((data) => {
        if (!data.themeChanges) {
          setState("error");
          return;
        }
        setRawThemes(data.themeChanges);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  const field = range === "1W" ? "change1W" : "change1M";

  const themes = useMemo(() => {
    return rawThemes
      .filter((t) => typeof t[field] === "number" && !isPoliticalTheme(t.theme))
      .sort((a, b) => b[field] - a[field])
      .slice(0, HOT_THEME_COUNT);
  }, [rawThemes, field]);

  if (state === "error") return null;

  return (
    <aside className="trending-panel">
      <div className="trending-panel-header">
        <h2 className="trending-panel-title">
          <Flame size={12} style={{ color: "var(--up)" }} />
          HOT 테마
        </h2>
        <div className="range-toggle">
          <button
            type="button"
            className={`range-toggle-btn ${range === "1W" ? "active" : ""}`}
            onClick={() => setRange("1W")}
          >
            1주일
          </button>
          <button
            type="button"
            className={`range-toggle-btn ${range === "1M" ? "active" : ""}`}
            onClick={() => setRange("1M")}
          >
            1개월
          </button>
        </div>
      </div>
      {state === "loading" ? (
        <p className="trending-empty">불러오는 중...</p>
      ) : (
        themes.map((t) => {
          const val = t[field];
          return (
            <div key={t.theme} className="trending-row">
              <span className="trending-row-name">{t.theme}</span>
              <span className="mono up" style={{ fontSize: 13, fontWeight: 700 }}>
                {val > 0 ? "+" : ""}
                {val.toFixed(1)}%
              </span>
            </div>
          );
        })
      )}
    </aside>
  );
}
