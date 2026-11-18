"use client";

// app/overnight/OvernightClient.js
//
// [2026-11-15 신설] 내일 장 미리 보기 화면 — 설명은 app/overnight/page.js, 자료는 lib/overnight.js
//   · 위: "밤사이 방향" 한 줄(네 가지 지표의 평균 — 규칙을 화면에 그대로 적음)
//   · 해외에 상장된 한국 주식(삼성전자 GDR, SK하이닉스 ADR, 한국 ETF)
//   · 미국 지수·반도체·빅테크 — 종목마다 "같이 볼 국내 종목"을 누르면 차트 창
//   숫자는 1분마다 새로 받고, 바뀌면 잠깐 반짝입니다(components/LivePct.js).

import { useEffect, useState } from "react";
import Link from "next/link";
import { MoonStar } from "lucide-react";
import LivePct from "../../components/LivePct";
import UsThemeNight from "../../components/UsThemeNight"; // [2026-11-18] 밤사이 미국 테마 칸
import { openStockChart } from "../../lib/openStockChart";

const won = (v) => (typeof v === "number" ? Math.round(v).toLocaleString("ko-KR") : "—");
const usd = (v, fx) => (typeof v !== "number" ? "—" : fx ? `${v.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}원` : v.toLocaleString("en-US", { maximumFractionDigits: 2 }));
const timeKo = (iso) => {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "";
  const d = new Date(t + 9 * 3600 * 1000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

export default function OvernightClient() {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.visibilityState === "hidden") return;
      fetch("/api/overnight")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!alive) return;
          if (d && Array.isArray(d.groups) && d.groups.length) {
            setData(d);
            setFailed(false);
          } else setFailed(true);
        })
        .catch(() => alive && setFailed(true));
    };
    load();
    const t = setInterval(load, 60000);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const mood = data?.mood;

  return (
    <main className="on-page">
      <header>
        <p className="ec-eyebrow">
          <MoonStar size={14} aria-hidden="true" /> 밤사이 해외 시장
        </p>
        <h1 className="ec-h1">내일 장 미리 보기</h1>
        <p className="ec-sub">미국 증시와 해외에 상장된 한국 주식이 밤사이 어떻게 움직였는지 한 화면에 모았어요.</p>
      </header>

      {!data && !failed && <p className="ec-empty">해외 시세를 불러오는 중…</p>}
      {!data && failed && <p className="ec-empty">지금 해외 시세를 받아오지 못했어요. 잠시 뒤 새로고침해 주세요.</p>}

      {data && (
        <>
          <section className={`on-mood ${mood?.tone || "flat"}`} aria-label="밤사이 방향">
            <p className="on-mood-k">밤사이 해외 지표로 본 분위기</p>
            <p className="on-mood-v">
              {mood ? (
                <>
                  어제 한국 종가보다 <b>{mood.label}</b>
                  <span className="mono">평균 {mood.avg > 0 ? "+" : ""}
                  {mood.avg.toFixed(2)}%</span>
                </>
              ) : (
                "지표가 아직 충분히 들어오지 않았어요"
              )}
            </p>
            <ul className="on-parts">
              {(data.parts || []).map((p) => (
                <li key={p.label}>
                  <span>{p.label}</span>
                  <LivePct value={p.pct} digits={2} empty="—" />
                </li>
              ))}
            </ul>
            <p className="on-mood-n">위 네 가지 등락률을 단순 평균한 값이에요. 실제 시초가와 다를 수 있고, 예측이 아닙니다.</p>
          </section>

          <section className="panel on-sec">
            <h2 className="on-h2">해외에 상장된 한국 주식</h2>
            <ul className="on-rows">
              {(data.korea || []).map((k) => (
                <li key={k.code} className="on-row">
                  <div className="on-row-l">
                    <button type="button" className="ec-name" onClick={() => openStockChart({ code: k.code, name: k.name, market: "코스피" })}>
                      {k.name}
                    </button>
                    <span className="ec-meta">
                      {k.abroad ? `${k.abroad.venue} · ${timeKo(k.abroad.asOf)}` : "해외 시세 없음"}
                      {typeof k.domestic?.price === "number" ? ` · 국내 종가 ${won(k.domestic.price)}원` : ""}
                    </span>
                  </div>
                  <div className="on-row-r">
                    {typeof k.abroad?.krwPerShare === "number" && (
                      <span className="on-sub mono">
                        환산 {won(k.abroad.krwPerShare)}원 <LivePct value={k.abroad.gapPct} digits={2} />
                      </span>
                    )}
                    <span className="on-main">
                      <i>해외 등락</i> <LivePct value={k.abroad?.changePct} digits={2} empty="—" />
                    </span>
                  </div>
                </li>
              ))}
              {data.ewy && (
                <li className="on-row">
                  <div className="on-row-l">
                    <span className="on-name">{data.ewy.name}</span>
                    <span className="ec-meta">한국 대표 종목을 담은 미국 상장 ETF · {timeKo(data.ewy.quote?.asOf)}</span>
                  </div>
                  <div className="on-row-r">
                    <span className="on-sub mono">{usd(data.ewy.quote?.price)}달러</span>
                    <span className="on-main">
                      <LivePct value={data.ewy.quote?.changePct} digits={2} empty="—" />
                    </span>
                  </div>
                </li>
              )}
            </ul>
            <p className="on-note">"환산"은 해외 가격을 환율로 바꿔 국내 1주 값으로 맞춘 것이고, 옆의 %는 국내 종가와의 차이예요.</p>
          </section>

          {/* [2026-11-18] 밤사이 미국 테마 → 이어지는 한국 테마 (components/UsThemeNight.js) */}
          <UsThemeNight />

          {data.groups.map((g) => (
            <section key={g.key} className="panel on-sec">
              <h2 className="on-h2">{g.title}</h2>
              <ul className={`on-grid ${g.key}`}>
                {g.items.map((it) => (
                  <li key={it.sym} className="on-card">
                    <div className="on-card-top">
                      <span className="on-name">{it.name}</span>
                      <LivePct value={it.quote?.changePct} digits={2} empty="—" className="on-pct" />
                    </div>
                    <span className="on-price mono">
                      {usd(it.quote?.price, it.fx)}
                      {it.note ? <i> · {it.note}</i> : null}
                    </span>
                    {it.kr?.length > 0 && (
                      <div className="on-kr">
                        <span>같이 볼 국내 종목</span>
                        {it.kr.map((s) => (
                          <button key={s.code} type="button" onClick={() => openStockChart(s)}>
                            {s.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              {g.key === "index" && <p className="on-note">환율이 오르면(원화 약세) 외국인 수급에 부담이고, VIX가 오르면 시장 불안이 커졌다는 뜻이에요.</p>}
            </section>
          ))}

          <p className="on-updated mono">자료 받은 시각 {timeKo(data.fetchedAt)} · 1분마다 새로 받아요</p>
        </>
      )}

      <p className="stock-disclaimer">
        해외 시세는 15~20분 늦을 수 있어요. 코스피 야간선물 가격은 무료 공식 자료가 없어 넣지 않았고, 대신 미국에 상장된 한국 ETF와 삼성전자·SK하이닉스 해외 주식으로 방향을
        봅니다. "같이 볼 국내 종목"은 사업상 관련이 큰 대표 종목을 고른 것이며 같은 방향으로 움직인다는 뜻이 아닙니다. 특정 종목의 매수·매도를 권하지 않습니다.{" "}
        <Link href="/briefing">장전 브리핑 보기 →</Link>
      </p>
    </main>
  );
}
