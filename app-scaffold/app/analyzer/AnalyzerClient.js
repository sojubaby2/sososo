"use client";

// app/analyzer/AnalyzerClient.js
//
// [2026-11-14 신설] 내 종목 분석기 화면 — 설명은 app/analyzer/page.js, 계산 규칙은 lib/positionPlan.js
//   · 종목 고르기: 종목 검색 창과 같은 목록(/api/stock-index)을 씀
//   · 시세: 차트 창과 같은 주소(/api/candles) — 사이트 다른 곳과 같은 숫자
//   · 주소에 ?code=005930&avg=70000&h=swing 을 붙이면 바로 그 결과가 열림(종목 페이지의 "내 평단으로 분석" 단추가 이걸 씀)
//   · 입력한 평단가는 이 브라우저 안에서만 쓰고 서버에 보내지 않습니다.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Search, Target, ShieldAlert, Layers, TrendingUp, ChevronDown } from "lucide-react";
import { buildPlan, HORIZONS, wonKo } from "../../lib/positionPlan";

const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, "");
const won = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v).toLocaleString("ko-KR") : "—");
const sign = (v, d = 1) => (typeof v === "number" && Number.isFinite(v) ? `${v > 0 ? "+" : ""}${v.toFixed(d)}%` : "—");
const marketName = (m) => (m === "Q" || m === "KQ" || m === "코스닥" ? "코스닥" : "코스피");

// ── 차트: 최근 일봉 + 기준선 + "도달 예시" 점선 ─────────────────────
function PlanChart({ candles, plan, mode }) {
  const W = 720;
  const H = 400;
  const PL = 8;
  const PR = 8;
  const PT = 18;
  const PB = 18;
  const cs = candles.slice(-60);
  const zoneX = PL + (W - PL - PR) * 0.74; // 오른쪽 26%는 "도달 예시" 자리
  const bw = (zoneX - PL) / cs.length;

  const levels = [
    { key: "avg", price: plan.avg, label: "내 평단", cls: "an-l-avg" },
    { key: "stop", price: plan.stop, label: "손절 기준", cls: "an-l-stop" },
    { key: "target", price: plan.target, label: "익절 기준", cls: "an-l-target" },
    ...plan.adds.map((a) => ({ key: `add${a.step}`, price: a.price, label: `${a.step}차 물타기`, cls: "an-l-add" })),
    ...(plan.guard ? [{ key: "guard", price: plan.guard.price, label: "수익 지킴선", cls: "an-l-add" }] : []),
  ];
  let lo = Math.min(...cs.map((c) => c.l), ...levels.map((l) => l.price));
  let hi = Math.max(...cs.map((c) => c.h), ...levels.map((l) => l.price));
  const pad = (hi - lo) * 0.06 || 1;
  lo -= pad;
  hi += pad;
  const y = (v) => PT + (H - PT - PB) * (1 - (v - lo) / (hi - lo));
  const lastX = PL + (cs.length - 1) * bw + bw / 2;
  const endX = W - PR - 26;

  // 지금 고른 칸(손절/익절/물타기)에 따라 강조할 선과 점선 길
  const focus =
    mode === "stop" ? ["stop"] : mode === "target" ? ["target"] : plan.adds.length ? plan.adds.map((a) => `add${a.step}`) : plan.guard ? ["guard"] : [];
  const path = (() => {
    const p0 = [lastX, y(plan.cur)];
    const pts = [];
    if (mode === "stop") pts.push([endX, y(plan.stop)]);
    else if (mode === "target") pts.push([endX, y(plan.target)]);
    else if (plan.adds.length) {
      const n = plan.adds.length;
      plan.adds.forEach((a, i) => pts.push([lastX + ((endX - lastX) * (i + 1)) / n, y(a.price)]));
    } else if (plan.guard) pts.push([endX, y(plan.guard.price)]);
    if (!pts.length) return null;
    let d = `M${p0[0]},${p0[1]}`;
    let prev = p0;
    for (const p of pts) {
      const mx = (prev[0] + p[0]) / 2;
      d += ` C${mx},${prev[1]} ${mx},${p[1]} ${p[0]},${p[1]}`;
      prev = p;
    }
    return { d, pts };
  })();
  const tone = mode === "stop" ? "an-p-stop" : mode === "target" ? "an-p-target" : "an-p-add";

  return (
    <svg className="an-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`최근 일봉과 손절 기준 ${won(plan.stop)}원, 익절 기준 ${won(plan.target)}원`}>
      <rect className="an-zone" x={zoneX} y={PT} width={W - PR - zoneX} height={H - PT - PB} rx="6" />
      <text className="an-zone-t" x={W - PR - 10} y={PT + 24} textAnchor="end">
        도달 예시
      </text>
      {cs.map((c, i) => {
        const up = c.c >= c.o;
        const x = PL + i * bw + bw / 2;
        const top = y(Math.max(c.o, c.c));
        const bot = y(Math.min(c.o, c.c));
        return (
          <g key={c.d} className={up ? "an-up" : "an-down"}>
            <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} strokeWidth="1.4" />
            <rect x={x - bw * 0.32} y={top} width={bw * 0.64} height={Math.max(1.5, bot - top)} rx="1" />
          </g>
        );
      })}
      {levels.map((l) => {
        const on = focus.includes(l.key) || l.key === "avg";
        const yy = y(l.price);
        return (
          <g key={l.key} className={`an-level ${l.cls} ${on ? "on" : ""}`}>
            <line x1={PL} x2={W - PR} y1={yy} y2={yy} />
            {on && (
              <g>
                <rect x={PL + 2} y={yy - 19} width={l.label.length * 22 + won(l.price).length * 13.5 + 34} height="38" rx="9" />
                <text x={PL + 15} y={yy + 8}>
                  {l.label} {won(l.price)}
                </text>
              </g>
            )}
          </g>
        );
      })}
      {path && (
        <g key={`${mode}-${plan.stop}-${plan.target}`} className={`an-path ${tone}`}>
          <path d={path.d} pathLength="1" />
          {path.pts.map((p, i) => (
            <circle key={i} cx={p[0]} cy={p[1]} r="6" style={{ animationDelay: `${0.5 + ((i + 1) / path.pts.length) * 0.9}s` }} />
          ))}
        </g>
      )}
      <circle className="an-now" cx={lastX} cy={y(plan.cur)} r="4.5" />
    </svg>
  );
}

// ── 종목 고르기 ──────────────────────────────────────────────────
function StockPicker({ rows, value, onPick }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const boxRef = useRef(null);

  useEffect(() => {
    if (value) setQ(value.name);
  }, [value]);
  useEffect(() => {
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, []);

  const list = useMemo(() => {
    const nq = norm(q);
    if (!rows || !nq || (value && value.name === q)) return [];
    const out = [];
    for (const r of rows) {
      let s = 0;
      if (/^\d{2,6}$/.test(nq) && r.code.startsWith(nq)) s = 90;
      else if (r.n === nq) s = 100;
      else if (r.n.startsWith(nq)) s = 80;
      else if (r.n.includes(nq)) s = 60;
      if (s) out.push([s - r.name.length * 0.1, r]);
    }
    return out
      .sort((a, b) => b[0] - a[0])
      .slice(0, 8)
      .map((x) => x[1]);
  }, [q, rows, value]);

  const pick = (r) => {
    onPick(r);
    setQ(r.name);
    setOpen(false);
  };

  return (
    <div className="an-pick" ref={boxRef}>
      <label className="an-label" htmlFor="an-stock">
        종목
      </label>
      <div className="an-input">
        <Search size={16} aria-hidden="true" />
        <input
          id="an-stock"
          name="stock"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder={rows ? "종목명 또는 종목코드 (예: 삼성전자)…" : "종목 목록을 불러오는 중…"}
          value={q}
          role="combobox"
          aria-expanded={open && list.length > 0}
          aria-controls="an-stock-list"
          aria-autocomplete="list"
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setHi(0);
            if (value) onPick(null);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!list.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHi((h) => (h + 1) % list.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHi((h) => (h - 1 + list.length) % list.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              pick(list[hi]);
            } else if (e.key === "Escape") setOpen(false);
          }}
        />
      </div>
      {open && list.length > 0 && (
        <ul className="an-list" id="an-stock-list" role="listbox">
          {list.map((r, i) => (
            <li key={r.code} role="option" aria-selected={i === hi}>
              <button type="button" className={i === hi ? "on" : ""} onPointerEnter={() => setHi(i)} onClick={() => pick(r)}>
                <span className="an-list-name">{r.name}</span>
                <span className="an-list-code mono">
                  {r.code} · {marketName(r.m)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── 화면 ────────────────────────────────────────────────────────
export default function AnalyzerClient() {
  const params = useSearchParams();
  const [rows, setRows] = useState(null);
  const [stock, setStock] = useState(null);
  const [avgText, setAvgText] = useState("");
  const [horizon, setHorizon] = useState("swing");
  const [state, setState] = useState("idle"); // idle | loading | ready | error
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // { stock, candles, avg }
  const [mode, setMode] = useState("stop"); // stop | target | add
  const resultRef = useRef(null);
  const autoRan = useRef(false);

  // 종목 목록(검색 창과 같은 자료)
  useEffect(() => {
    let alive = true;
    fetch("/api/stock-index")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setRows((d.rows || []).map(([code, name, m]) => ({ code, name, m, n: norm(name) })));
      })
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, []);

  const avg = Number(String(avgText).replace(/[^\d]/g, "")) || 0;

  const run = useCallback((s, a) => {
    if (!s) {
      setError("종목을 먼저 골라 주세요. 이름을 치면 아래에 목록이 나옵니다.");
      setState("error");
      return;
    }
    if (!(a > 0)) {
      setError("내 평단가(산 가격)를 숫자로 넣어 주세요.");
      setState("error");
      return;
    }
    setState("loading");
    setError("");
    const qs = new URLSearchParams({ code: s.code, market: marketName(s.m) });
    fetch(`/api/candles?${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no data"))))
      .then((d) => {
        if (!Array.isArray(d?.candles) || d.candles.length < 15) throw new Error("no data");
        setResult({ stock: s, candles: d.candles, avg: a });
        setState("ready");
        setMode("stop");
        requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
      })
      .catch(() => {
        setError("이 종목의 시세를 받아오지 못했어요. 잠시 뒤 다시 눌러 주세요.");
        setState("error");
      });
  }, []);

  // 주소에 ?code=…&avg=… 가 있으면 바로 분석
  useEffect(() => {
    if (autoRan.current || !rows) return;
    const code = params.get("code");
    if (!code) return;
    autoRan.current = true;
    const s = rows.find((r) => r.code === code);
    const h = params.get("h");
    if (h && HORIZONS[h]) setHorizon(h);
    if (!s) return;
    setStock(s);
    const a = Number(params.get("avg")) || 0;
    if (a > 0) {
      setAvgText(a.toLocaleString("ko-KR"));
      run(s, a);
    }
  }, [rows, params, run]);

  const plan = useMemo(() => (result ? buildPlan(result.candles, result.avg, horizon) : null), [result, horizon]);

  // 결과를 주소에 반영(뒤로 가기·공유용). 평단가는 주소에만 남고 서버에는 보내지 않음.
  useEffect(() => {
    if (!result) return;
    const qs = new URLSearchParams({ code: result.stock.code, avg: String(result.avg), h: horizon });
    window.history.replaceState(null, "", `/analyzer?${qs}`);
  }, [result, horizon]);

  const H = HORIZONS[horizon];
  const thirdLabel = plan && !plan.losing ? "수익 지킴" : "물타기";

  return (
    <main className="an-page">
      <header className="an-head">
        <p className="an-eyebrow">
          <Target size={14} aria-hidden="true" /> 무료 · 회원가입 없음
        </p>
        <h1 className="an-h1">내 종목 분석기</h1>
        <p className="an-sub">종목과 내가 산 가격을 넣으면, 최근 차트 기준으로 손절·익절·물타기 기준 가격을 보여 드려요.</p>
      </header>

      <form
        className="panel an-form"
        onSubmit={(e) => {
          e.preventDefault();
          run(stock, avg);
        }}
      >
        <StockPicker rows={rows} value={stock} onPick={setStock} />
        <div>
          <label className="an-label" htmlFor="an-avg">
            내 평단가
          </label>
          <div className="an-input">
            <input
              id="an-avg"
              name="avg"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              className="mono"
              placeholder="예: 70,000…"
              value={avgText}
              onChange={(e) => {
                const n = e.target.value.replace(/[^\d]/g, "").slice(0, 9);
                setAvgText(n ? Number(n).toLocaleString("ko-KR") : "");
              }}
            />
            <span className="an-unit">원</span>
          </div>
        </div>
        <fieldset className="an-seg">
          <legend className="an-label">보유 기간</legend>
          <div className="an-seg-row">
            {Object.entries(HORIZONS).map(([k, v]) => (
              <button key={k} type="button" className={horizon === k ? "on" : ""} aria-pressed={horizon === k} onClick={() => setHorizon(k)}>
                <b>{v.label}</b>
                <span>{v.sub}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <button type="submit" className="an-go" disabled={state === "loading"}>
          {state === "loading" ? "분석하는 중…" : "분석하기"}
        </button>
        <p className="an-msg" aria-live="polite">
          {state === "error" ? error : ""}
        </p>
      </form>

      {plan && result && (
        <section className="an-result" ref={resultRef}>
          <div className="an-stockline">
            <div>
              <h2 className="an-name">{result.stock.name}</h2>
              <span className="an-code mono">
                {result.stock.code} · {marketName(result.stock.m)} · {plan.asOfDate} 기준
              </span>
            </div>
            <div className="an-now-box">
              <span className="mono an-now-price">{won(plan.cur)}원</span>
              <span className={`mono an-pnl ${plan.pnlPct > 0 ? "up" : plan.pnlPct < 0 ? "down" : "flat"}`}>내 수익률 {sign(plan.pnlPct, 2)}</span>
            </div>
          </div>

          <p className={`an-verdict ${plan.belowStop ? "bad" : plan.losing ? "warn" : "good"}`}>
            {plan.belowStop
              ? `지금 가격이 손절 기준(${wonKo(plan.stop)}) 아래에 있어요.`
              : plan.losing
                ? `손실 구간이에요. 본전까지 ${sign(plan.breakevenNeedPct)} 올라야 하고, 손절 기준까지는 ${sign(plan.stopFromCurPct)} 남았어요.`
                : `수익 구간이에요. 익절 기준까지 ${sign(plan.targetFromCurPct)}, 손절 기준까지 ${sign(plan.stopFromCurPct)} 거리예요.`}
          </p>

          <div className="an-tabs" role="tablist" aria-label="기준 가격">
            <button type="button" role="tab" aria-selected={mode === "stop"} className={`an-tab stop ${mode === "stop" ? "on" : ""}`} onClick={() => setMode("stop")}>
              <span className="an-tab-k">
                <ShieldAlert size={14} aria-hidden="true" /> 손절 기준
              </span>
              <span className="an-tab-v mono">{won(plan.stop)}</span>
              <span className="an-tab-s mono"><i>현재가 대비 </i>{sign(plan.stopFromCurPct)}</span>
            </button>
            <button type="button" role="tab" aria-selected={mode === "target"} className={`an-tab target ${mode === "target" ? "on" : ""}`} onClick={() => setMode("target")}>
              <span className="an-tab-k">
                <TrendingUp size={14} aria-hidden="true" /> 익절 기준
              </span>
              <span className="an-tab-v mono">{won(plan.target)}</span>
              <span className="an-tab-s mono"><i>현재가 대비 </i>{sign(plan.targetFromCurPct)}</span>
            </button>
            <button type="button" role="tab" aria-selected={mode === "add"} className={`an-tab add ${mode === "add" ? "on" : ""}`} onClick={() => setMode("add")}>
              <span className="an-tab-k">
                <Layers size={14} aria-hidden="true" /> {thirdLabel}
              </span>
              <span className="an-tab-v mono">{plan.adds.length ? won(plan.adds[0].price) : plan.guard ? won(plan.guard.price) : "—"}</span>
              <span className="an-tab-s">{plan.adds.length ? `${plan.adds.length}단계` : plan.guard ? "이 아래면 수익 반납" : "해당 없음"}</span>
            </button>
          </div>

          <div className="panel an-chartbox">
            <p className="an-headline">
              {mode === "stop" && (
                <>
                  <b className="an-c-stop">{wonKo(plan.stop)}</b> 아래로 내려가면 손절 기준
                </>
              )}
              {mode === "target" && (
                <>
                  <b className="an-c-target">{wonKo(plan.target)}</b>에 닿으면 익절 기준
                </>
              )}
              {mode === "add" &&
                (plan.adds.length ? (
                  <>
                    물타기는 <b className="an-c-add">{plan.adds.map((a) => wonKo(a.price)).join(" → ")}</b> 구간
                  </>
                ) : plan.guard ? (
                  <>
                    <b className="an-c-add">{wonKo(plan.guard.price)}</b> 아래로 내려가면 수익 지키기
                  </>
                ) : (
                  <>지금은 물타기·지킴선 기준이 따로 없어요</>
                ))}
            </p>
            <PlanChart candles={result.candles} plan={plan} mode={mode} />
            <p className="an-cap">최근 60거래일 일봉 · 오른쪽 점선은 그 가격에 닿는 모습을 그린 예시이며 예측이 아닙니다.</p>
          </div>

          {mode === "add" && plan.adds.length > 0 && (
            <div className="panel an-table">
              <h3 className="an-h3">물타기 하면 평단이 이렇게 바뀌어요</h3>
              <p className="an-note">처음 산 수량만큼 한 번씩 더 산다고 가정한 계산이에요.</p>
              <table>
                <thead>
                  <tr>
                    <th scope="col">단계</th>
                    <th scope="col">살 가격</th>
                    <th scope="col">현재가 대비</th>
                    <th scope="col">바뀌는 평단</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.adds.map((a) => (
                    <tr key={a.step}>
                      <th scope="row">{a.step}차</th>
                      <td className="mono">{won(a.price)}</td>
                      <td className="mono down">{sign(a.fromCurPct)}</td>
                      <td className="mono">{won(a.newAvg)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="an-note">물타기는 손절 기준({won(plan.stop)}원) 위에서만 의미가 있어요. 그 아래로 내려가면 물타기보다 손절 기준이 먼저입니다.</p>
            </div>
          )}

          <div className="an-facts">
            <div>
              <span>최근 {H.n}일 저점(지지선)</span>
              <b className="mono">{won(plan.support)}</b>
            </div>
            <div>
              <span>최근 {H.n}일 고점(저항선)</span>
              <b className="mono">{won(plan.resistance)}</b>
            </div>
            <div>
              <span>하루 평균 움직임</span>
              <b className="mono">±{plan.atrPct.toFixed(1)}%</b>
            </div>
            <div>
              <span>손익비(익절 폭 ÷ 손절 폭)</span>
              <b className="mono">{plan.rewardRisk ? plan.rewardRisk.toFixed(2) : "—"}</b>
            </div>
          </div>

          <details className="panel an-how">
            <summary>
              계산 방법 보기 <ChevronDown size={15} aria-hidden="true" />
            </summary>
            <ul>
              <li>
                <b>지지선·저항선</b>: 최근 {H.n}거래일({H.label} 기준) 중 가장 낮았던 가격과 가장 높았던 가격이에요.
              </li>
              <li>
                <b>손절 기준</b>: 지지선보다 하루 평균 움직임의 절반만큼 아래예요. 지금 가격과 너무 가까우면 평균 움직임의 {H.k}배 아래로 잡고, 너무 멀면 현재가의 -
                {Math.round(H.maxLoss * 100)}%에서 자릅니다.
              </li>
              <li>
                <b>익절 기준</b>: 저항선이에요. 손절까지 거리의 1.5배보다 가까우면 그만큼으로 늘리고, 현재가의 +{Math.round(H.maxLoss * 200)}%를 넘으면 거기서 자릅니다.
              </li>
              <li>
                <b>물타기 구간</b>: 손실 중일 때만 보여요. 현재가와 손절 기준 사이의 40% 지점(1차), 75% 지점(2차)입니다.
              </li>
              <li>
                <b>수익 지킴선</b>: 수익 중일 때, 내 평단가와 20일 평균선 중 높은 쪽이에요.
              </li>
              <li>모든 가격은 한국거래소 호가 단위에 맞춰 반올림했어요.</li>
            </ul>
          </details>

          <p className="an-links">
            <Link href={`/stock/${result.stock.code}`}>{result.stock.name} 관련 속보·테마 보기 →</Link>
          </p>
        </section>
      )}

      <p className="stock-disclaimer">
        이 분석기는 공개된 시세에 정해진 계산 규칙을 적용한 참고 자료이며, 특정 종목의 매수·매도를 권하지 않습니다. 실적·공시·뉴스 같은 요인은 계산에 들어가지 않아요. 투자 판단과
        책임은 본인에게 있습니다. 입력한 평단가는 이 브라우저에서만 쓰이고 저장되지 않습니다.
      </p>
    </main>
  );
}
