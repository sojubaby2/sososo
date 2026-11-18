"use client";

// components/UsThemeNight.js
//
// [2026-11-18 신설] "밤사이 미국 테마" 칸 — 내일 장 미리 보기(/overnight) 화면에 들어갑니다.
//   재성님: "지금 화면에 자연스럽게 미국주식도 녹이는 방법 … 조잡해지지 않고 깔끔하게"
//   밤사이 미국에서 많이 오른 테마 5개·내린 테마 5개를 보여 주고, 각 테마에 이어지는 한국 테마를 바로 누를 수 있게 합니다.
//   (미국 테마 → 오늘 한국에서 볼 테마. 뉴스매매의 "뉴스 → 관련주"와 같은 흐름)
//   자료: /api/us-themes (전일 미국 종가 기준, 하루 한 번 바뀜 — lib/usThemeQuotes.js)

import { useEffect, useState } from "react";
import Link from "next/link";
import LivePct from "./LivePct";
import { loadUsThemes } from "../lib/usThemesClient";

function Row({ t }) {
  const movers = t.stocks.filter((s) => typeof s.c === "number");
  const lead = t.change >= 0 ? movers.slice(0, 2) : movers.slice(-2).reverse();
  return (
    <li className="ust-row">
      <div className="ust-row-top">
        <Link href={`/themes?m=us&ut=${encodeURIComponent(t.theme)}`} className="ust-name">
          {t.theme}
        </Link>
        <LivePct value={t.change} digits={2} empty="—" />
      </div>
      <p className="ust-lead">
        {lead.map((s) => (
          <span key={s.t}>
            {s.n} <b className={s.c > 0 ? "up" : s.c < 0 ? "down" : ""}>{s.c > 0 ? "+" : ""}{s.c.toFixed(1)}%</b>
          </span>
        ))}
      </p>
      {t.kr.length > 0 && (
        <p className="ust-kr">
          <i>한국</i>
          {t.kr.slice(0, 3).map((k) => (
            <Link key={k} href={`/themes?theme=${encodeURIComponent(k)}`} className="ust-chip">
              {k}
            </Link>
          ))}
        </p>
      )}
    </li>
  );
}

export default function UsThemeNight() {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    loadUsThemes().then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, []);

  const ranked = (data?.themes || []).filter((t) => typeof t.change === "number").sort((a, b) => b.change - a.change);
  if (ranked.length < 10) return null; // 시세를 못 받은 날에는 칸 자체를 숨김(빈 칸을 보여 주지 않음)
  const up = ranked.slice(0, 5);
  const down = ranked.slice(-5).reverse();

  return (
    <section className="panel on-sec ust" aria-label="밤사이 미국 테마">
      <div className="ust-head">
        <h2 className="on-h2">밤사이 미국 테마</h2>
        <Link href="/themes?m=us" className="ust-all">
          미국 테마 {data.themes.filter((t) => !t.etf).length}개 전체 보기
        </Link>
      </div>
      <div className="ust-cols">
        <div>
          <p className="ust-k up">많이 오른 테마</p>
          <ul className="ust-list">{up.map((t) => <Row key={t.theme} t={t} />)}</ul>
        </div>
        <div>
          <p className="ust-k down">많이 내린 테마</p>
          <ul className="ust-list">{down.map((t) => <Row key={t.theme} t={t} />)}</ul>
        </div>
      </div>
      <p className="on-note">테마에 속한 미국 종목의 전일 종가 등락률을 평균한 값이에요. "한국" 옆 단추를 누르면 이어지는 국내 테마로 넘어갑니다.{data.stale ? " (최신 자료를 받지 못해 직전 자료를 보여 주고 있어요)" : ""}</p>
    </section>
  );
}
