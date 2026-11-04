"use client";

// components/AthBreakoutPanel.js
//
// [2026-11-03 신설] "오늘 역사적 신고가 돌파" 칸 — 홈 오른쪽(관심종목 바로 아래), 휴대폰은 "시장" 탭.
//   재성님: "장중에 돌파하면 넣고 다시 빠지면 빼버려" + "역사적 신고가 돌파로 해주라"
//   자료: /api/ath-breakouts (계산은 lib/athBreakout.js — 3분마다 갱신, 시세는 15~20분 지연)
//   · 장중: 지금 가격이 상장 이후 최고가를 넘은 종목만. 다시 내려오면 다음 갱신 때 빠짐.
//   · 장 마감 뒤: 오늘 마지막 결과를 "장 마감 기준"으로 보여 줌.
//   · 장 시작 전: "장이 열리면 여기에 나타나요" 안내.
//   종목을 누르면 차트 창, 오른쪽 "보기"는 종목 페이지.

import Link from "next/link";
import { useEffect, useState } from "react";
import { Crown } from "lucide-react";
import { openStockChart } from "../lib/openStockChart";

const POLL_MS = 3 * 60 * 1000;

function hhmm(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "";
  const d = new Date(t + 9 * 3600 * 1000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
function athWhen(s) {
  if (!s) return "";
  const [y, m, d] = s.split("-");
  return d ? `${y.slice(2)}.${m}.${d}` : `${y.slice(2)}.${m}`;
}
const won = (v) => (typeof v === "number" ? v.toLocaleString("ko-KR") : "—");

// 여러 곳(PC 칸·휴대폰 바로가기 칸)이 같은 자료를 쓰므로, 한 번만 받아서 나눠 씀
let shared = { data: null, at: 0, subs: new Set(), timer: null };
function loadShared() {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  fetch("/api/ath-breakouts")
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!d) return;
      shared.data = d;
      shared.at = Date.now();
      shared.subs.forEach((fn) => fn(d));
    })
    .catch(() => {});
}
export function useAthBreakouts() {
  const [data, setData] = useState(shared.data);
  useEffect(() => {
    shared.subs.add(setData);
    if (!shared.data || Date.now() - shared.at > POLL_MS) loadShared();
    if (!shared.timer) {
      shared.timer = setInterval(loadShared, POLL_MS);
      document.addEventListener("visibilitychange", loadShared);
    }
    return () => {
      shared.subs.delete(setData);
      if (!shared.subs.size && shared.timer) {
        clearInterval(shared.timer);
        shared.timer = null;
        document.removeEventListener("visibilitychange", loadShared);
      }
    };
  }, []);
  return data;
}

export default function AthBreakoutPanel({ className = "" }) {
  const data = useAthBreakouts();

  const items = data?.items || [];
  const status = data?.status;
  const sub =
    status === "live"
      ? `${hhmm(data.at)} 기준 · 15~20분 지연`
      : status === "closed"
      ? "오늘 장 마감 기준"
      : "";

  return (
    <section className={`panel ath-panel ${className}`} aria-label="오늘 역사적 신고가 돌파">
      <div className="ath-head">
        <span className="panel-label" style={{ margin: 0 }}>
          <Crown size={13} className="ath-ico" /> 역사적 신고가 돌파
        </span>
        {items.length > 0 && <span className="ath-count mono">{items.length}</span>}
      </div>
      {sub && <p className="ath-sub">{sub}</p>}

      {!data ? (
        <div className="ath-skel" aria-hidden="true"><i /><i /></div>
      ) : items.length === 0 ? (
        <p className="ath-empty">
          {status === "before"
            ? "장이 열리면 상장 이후 최고가를 넘어선 종목이 여기에 나타나요."
            : status === "preparing"
            ? "최고가 자료를 모으는 중이에요. 곧 채워져요."
            : status === "closed"
            ? "오늘은 역사적 신고가를 넘은 종목이 없었어요."
            : status === "live"
            ? "아직 상장 이후 최고가를 넘은 종목이 없어요. 넘으면 바로 여기에 들어와요."
            : "잠시 후 다시 확인해 주세요."}
        </p>
      ) : (
        <ul className="ath-list">
          {items.slice(0, 12).map((s) => (
            <li key={s.code} className="ath-row">
              <button
                type="button"
                className="ath-name"
                onClick={() => openStockChart({ code: s.code, name: s.name, market: s.market })}
                title={`${s.name} 일봉 차트 보기`}
              >
                <span className="ath-nm">{s.name}</span>
                <span className="ath-meta">
                  전 최고 {won(s.ath)} <span className="ath-when">({athWhen(s.athDate)})</span>
                </span>
              </button>
              <span className="ath-right">
                <span className="mono ath-price">{won(s.price)}</span>
                <span className={`mono ath-chg ${s.changePct > 0 ? "up" : s.changePct < 0 ? "down" : "flat"}`}>
                  {typeof s.changePct === "number" ? `${s.changePct > 0 ? "+" : ""}${s.changePct.toFixed(1)}%` : "—"}
                </span>
              </span>
              <Link href={`/stock/${s.code}`} className="watch-page" aria-label={`${s.name} 종목 페이지`}>
                보기
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
