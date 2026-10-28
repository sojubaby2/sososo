"use client";

// components/MobileShorts.js
//
// [2026-10-28 신설] 휴대폰 "속보" 탭 — A. 숏폼 속보(릴스·쇼츠처럼).
//   재성님: "모바일 화면 맘에안드는데 다시 바꾸자 — 훨씬 혁신적인 모바일 화면" → 시안 A+B 선택.
//
// 화면:
//   · 맨 위: 테마 동그라미 줄(인스타 스토리처럼). 오늘 속보에 많이 나온 테마 순.
//       테두리 빨강 = 관련주 평균 오름, 파랑 = 내림. 누르면 그 테마 속보만 넘겨 봄. "전체"로 되돌림.
//   · 가운데: 속보 한 건이 화면 하나. 위로 밀면 다음 속보(아래 카드가 살짝 보여서 넘길 수 있다는 걸 알려 줌).
//       카드 안: 말머리 딱지 · 테마 · 몇 분 전 · 큰 제목 · 요약 · 관련주(최근 20일 가격 그림 + 등락률, 누르면 차트)
//       오른쪽 단추: 관심종목 담기(첫 번째 관련주) · 차트 · 공유 · 원문 기사
//   · 새 속보가 오면: 맨 위 카드를 보고 있으면 맨 앞에 바로 끼워 넣고 "NEW"로 반짝.
//       아래 카드를 읽는 중이면 끌고 올라가지 않고 "↑ 새 속보 N건" 단추만 띄움.
//   · 광고: 4번째 속보 뒤에 1장, 그다음 7장마다 1장(최대 4장). "광고" 표시가 붙은 별도 카드.
//       그 자리 바로 앞까지 넘겨 왔을 때만 광고를 불러오고, 채울 광고가 없으면 카드를 통째로 뺍니다.
//
// ★ PC 화면(761px 이상)에서는 아예 그리지 않습니다(PC는 예전 속보 화면 그대로).
// ★ 비용: 가격 그림은 지금 보고 있는 카드의 종목만 받아 옵니다(/api/candles, 공용 저장). 나머지는 추가 비용 0.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Star, TrendingUp, Share2, ExternalLink, ArrowUp, ChevronUp, AlertTriangle, X } from "lucide-react";
import { openStockChart } from "../lib/openStockChart";
import { useWatchlist } from "../lib/watchlist";
import { AD_SLOTS } from "../lib/ads";
import AdSlot from "./AdSlot";
import {
  FRESH_MINUTES,
  HOT_TAGS,
  agoText,
  heatClass,
  isNum,
  minutesAgo,
  pct,
  shortTheme,
  splitTags,
  Spark,
  themeStats,
  todaysOf,
  tone,
  useNow,
} from "./MobileFeed";

const MAX_CARDS = 80; // 한 번에 넘겨 볼 수 있는 속보 수(휴대폰이 무거워지지 않게)
const RING_COUNT = 10; // 위쪽 테마 동그라미 수
const AD_FIRST = 4; // 이 수만큼 속보를 본 뒤 첫 광고
const AD_EVERY = 7; // 그다음 광고 간격(속보 수)
const AD_MAX = 4;
const HAS_AD = Boolean(AD_SLOTS.display);
const PEEK = 18; // 다음 카드가 아래로 살짝 보이는 높이(px)
const CARD_GAP = 10;
const SITE_URL = "https://newsmeme.co.kr/";

// 휴대폰 화면인지(761px 미만). 서버에서 그릴 땐 false → PC·검색엔진은 이 부품을 아예 안 봄
function useIsPhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return phone;
}

function filterLabel(f) {
  if (!f) return "";
  return f.kind === "theme" ? `${f.value} 테마` : f.kind === "stock" ? `${f.value} 관련` : f.value;
}

// ── 광고 카드 ──────────────────────────────────────────────────
function AdCard({ near, onGone, style }) {
  const ref = useRef(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (near) setMounted(true);
  }, [near]);
  // 채울 광고가 없다고 나오거나(unfilled), 요청하고 8초가 지나도 안 채워지면(광고 차단 등) 카드를 뺌
  useEffect(() => {
    if (!mounted) return;
    const card = ref.current;
    if (!card) return;
    let timer = null;
    const check = () => {
      const ins = card.querySelector("ins");
      if (!ins) return;
      const st = ins.getAttribute("data-ad-status");
      if (st === "unfilled") return onGone();
      if (st === "filled") {
        clearTimeout(timer);
        timer = null;
        return;
      }
      if (!timer && ins.classList.contains("adsbygoogle")) {
        timer = setTimeout(() => {
          if (ins.getAttribute("data-ad-status") !== "filled") onGone();
        }, 8000);
      }
    };
    const mo = new MutationObserver(check);
    mo.observe(card, { subtree: true, attributes: true, attributeFilter: ["class", "data-ad-status"] });
    check();
    return () => {
      mo.disconnect();
      clearTimeout(timer);
    };
  }, [mounted, onGone]);
  return (
    <div className="ms-card ms-adcard" ref={ref} style={style}>
      {mounted ? <AdSlot box eager className="ms-adslot" /> : <span className="ad-label">광고</span>}
    </div>
  );
}

// ── 속보 카드 하나 ─────────────────────────────────────────────
function NewsCard({ n, num, total, active, isNew, first, now, watched, onWatch, style }) {
  const [copied, setCopied] = useState(false);
  const m = minutesAgo(n.ts, now);
  const fresh = m !== null && m < FRESH_MINUTES;
  const { tags: rawTags, text } = splitTags(n.headline);
  const tags = fresh ? rawTags.filter((t) => t !== "속보") : rawTags;
  const hot = fresh || rawTags.some((t) => HOT_TAGS.has(t));
  const stocks = n.stocks || [];
  const s0 = stocks[0];
  const changes = stocks.map((s) => s.change).filter(isNum);
  const avg = changes.length ? changes.reduce((a, b) => a + b, 0) / changes.length : null;
  const accent = hot ? "hot" : tone(avg);

  async function share() {
    const names = stocks.slice(0, 3).map((s) => s.name).join(", ");
    const body = `${text}${names ? `\n관련주: ${names}` : ""}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "뉴스매매 속보", text: body, url: SITE_URL });
        return;
      }
      await navigator.clipboard?.writeText(`${body}\n${SITE_URL}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // 공유 창을 닫은 경우 등 — 조용히 넘어감
    }
  }

  return (
    <article className={`ms-card ms-accent-${accent} ${isNew ? "is-new" : ""}`} style={style} aria-label={`속보 ${num} / ${total}`}>
      <div className="ms-body">
        <div className="ms-meta">
          {isNew && <span className="ms-newtag">NEW</span>}
          {fresh && <span className="ms-brk">속보</span>}
          {tags.map((t) => (
            <span key={t} className={`ms-tag ${HOT_TAGS.has(t) ? "hot" : ""}`}>
              {t}
            </span>
          ))}
          {n.theme && <b>{n.theme}</b>}
          <span>· {agoText(m)}</span>
          <span className="ms-count mono">
            {num}/{total}
          </span>
        </div>
        <h2 className="ms-title">{text}</h2>
        {n.summary && n.summary !== n.headline && <p className="ms-sum">{n.summary}</p>}

        {stocks.length > 0 && (
          <div className="ms-stocks">
            <div className="ms-stocks-lb">관련주 · 누르면 차트</div>
            {stocks.slice(0, 4).map((s) => (
              <button
                type="button"
                key={s.code}
                className="ms-stock"
                onClick={() => openStockChart({ code: s.code, name: s.name, market: s.market })}
                title={`${s.name} 차트 보기`}
              >
                <span className="ms-stock-nm">
                  <b>
                    {s.catalyst && <AlertTriangle size={12} aria-label="악재" />}
                    {s.name}
                  </b>
                  {s.reason && <small>{s.reason}</small>}
                </span>
                <Spark code={s.code} market={s.market} active={active} />
                <span className={`ms-stock-pct mono ${tone(s.change)}`}>{pct(s.change)}</span>
              </button>
            ))}
            {stocks.length > 4 && <div className="ms-more">외 {stocks.length - 4}종목</div>}
          </div>
        )}
        {first && (
          <div className="ms-hint" aria-hidden="true">
            <ChevronUp size={14} /> 위로 밀면 다음 속보
          </div>
        )}
      </div>

      <div className="ms-rail">
        {s0 && (
          <button
            type="button"
            className={`ms-act ${watched ? "on" : ""}`}
            onClick={() => onWatch(s0)}
            aria-label={`${s0.name} 관심종목 ${watched ? "빼기" : "담기"}`}
            aria-pressed={watched}
          >
            <Star size={21} fill={watched ? "currentColor" : "none"} />
            <span>관심</span>
          </button>
        )}
        {s0 && (
          <button
            type="button"
            className="ms-act"
            onClick={() => openStockChart({ code: s0.code, name: s0.name, market: s0.market })}
            aria-label={`${s0.name} 차트 보기`}
          >
            <TrendingUp size={21} />
            <span>차트</span>
          </button>
        )}
        <button type="button" className="ms-act" onClick={share} aria-label="이 속보 공유하기">
          <Share2 size={20} />
          <span>{copied ? "복사됨" : "공유"}</span>
        </button>
        {n.link && (
          <a className="ms-act" href={n.link} target="_blank" rel="noopener noreferrer" aria-label="원문 기사 보기">
            <ExternalLink size={20} />
            <span>원문</span>
          </a>
        )}
      </div>
    </article>
  );
}

// ── 숏폼 속보 화면 ─────────────────────────────────────────────
// filter: null | { kind: "theme" | "stock", value }  (홈 화면이 가지고 있음 — 테마 탭에서 넘어올 때 정해 줌)
// focusId: 이 속보 카드로 바로 넘어가기(테마 탭의 "최근 속보"를 눌렀을 때)
export default function MobileShorts({ items, newIds, filter, onFilter, focusId, onFocused }) {
  const phone = useIsPhone();
  const now = useNow();
  const watch = useWatchlist();
  const scrollerRef = useRef(null);
  const [boxH, setBoxH] = useState(0);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  const viewedRef = useRef(null);
  const [pending, setPending] = useState(0);
  const [adGone, setAdGone] = useState(() => new Set());

  const rings = useMemo(() => themeStats(todaysOf(items)).slice(0, RING_COUNT), [items]);
  const list = useMemo(() => {
    let l = items;
    if (filter?.kind === "theme") l = items.filter((n) => n.themes?.includes(filter.value));
    else if (filter?.kind === "stock") l = items.filter((n) => n.stocks?.some((s) => s.name === filter.value));
    return l.slice(0, MAX_CARDS);
  }, [items, filter]);

  // 카드 + 광고 자리
  const slides = useMemo(() => {
    const out = [];
    let ads = 0;
    list.forEach((n, i) => {
      out.push({ key: n.id, n, num: i + 1 });
      const seen = i + 1;
      if (HAS_AD && ads < AD_MAX && seen >= AD_FIRST && (seen - AD_FIRST) % AD_EVERY === 0 && i < list.length - 1) {
        const key = `ad-${ads}`;
        ads += 1;
        if (!adGone.has(key)) out.push({ key, ad: true });
      }
    });
    return out;
  }, [list, adGone]);

  const cardH = Math.max(0, boxH - PEEK - CARD_GAP);
  const step = cardH + CARD_GAP;

  // 카드 높이 = 화면에서 테마 줄을 뺀 높이(다음 카드가 PEEK만큼 보이게)
  useEffect(() => {
    if (!phone) return;
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => setBoxH(el.clientHeight);
    update();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [phone]);

  const holdTopUntil = useRef(0);
  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el || !step) return;
    if (Date.now() < holdTopUntil.current && el.scrollTop > 0) {
      el.scrollTop = 0;
      return;
    }
    const i = Math.max(0, Math.min(slides.length - 1, Math.round(el.scrollTop / step)));
    if (i !== activeRef.current) {
      activeRef.current = i;
      setActive(i);
    }
    viewedRef.current = slides[i]?.key ?? null;
    if (i === 0) setPending(0);
  }, [slides, step]);

  // 카드 목록이 바뀌었을 때(새 속보·광고 빠짐): 읽던 카드를 그대로 화면에 둡니다.
  const slideKeys = slides.map((s) => s.key).join("|");
  const prevKeysRef = useRef(slideKeys);
  useLayoutEffect(() => {
    const prev = prevKeysRef.current;
    prevKeysRef.current = slideKeys;
    if (prev === slideKeys) return;
    const el = scrollerRef.current;
    if (!el || !step) return;
    const was = activeRef.current;
    const prevFirst = prev ? prev.split("|")[0] : "";
    if (was === 0 && (!prevFirst || prevFirst === slides[0]?.key)) {
      viewedRef.current = slides[0]?.key ?? null; // 처음 불러온 경우 등 — 맨 앞이 그대로면 할 일 없음
      return;
    }
    if (was === 0) {
      // 맨 위를 보고 있었으면 새 속보가 그 자리에 그대로 보이게.
      //   휴대폰 브라우저는 "보던 카드"를 따라 저절로 한 칸 내려가 버리는(다시 맞추기) 경우가 있어서,
      //   잠깐(0.6초) 동안은 맨 위로 붙잡아 둡니다.
      holdTopUntil.current = Date.now() + 600;
      el.scrollTop = 0;
      requestAnimationFrame(() => {
        if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
      });
      viewedRef.current = slides[0]?.key ?? null;
      return;
    }
    const j = slides.findIndex((s) => s.key === viewedRef.current);
    if (j < 0) return;
    if (j !== was) {
      el.scrollTop = j * step;
      activeRef.current = j;
      setActive(j);
      if (j > was) setPending((c) => c + (j - was));
    }
  }, [slideKeys]);

  // 테마·종목 거르기가 바뀌면 맨 위로
  const filterKey = filter ? `${filter.kind}:${filter.value}` : "";
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = 0;
    activeRef.current = 0;
    setActive(0);
    setPending(0);
  }, [filterKey]);

  // 테마 탭에서 특정 속보를 눌러 넘어온 경우 그 카드로
  useEffect(() => {
    if (!focusId || !step) return;
    const j = slides.findIndex((s) => s.key === focusId);
    const el = scrollerRef.current;
    if (el && j >= 0) {
      el.scrollTop = j * step;
      activeRef.current = j;
      setActive(j);
    }
    onFocused?.();
  }, [focusId, step, slideKeys]);

  // 아래 탭 줄의 "속보"를 다시 누르면 맨 위로
  useEffect(() => {
    const toTop = () => scrollerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    window.addEventListener("nm-shorts-top", toTop);
    return () => window.removeEventListener("nm-shorts-top", toTop);
  }, []);

  const dropAd = useCallback((key) => {
    setAdGone((cur) => {
      if (cur.has(key)) return cur;
      const next = new Set(cur);
      next.add(key);
      return next;
    });
  }, []);
  const goneHandlers = useRef({});
  const goneFor = (key) => (goneHandlers.current[key] ||= () => dropAd(key));

  if (!phone) return null;

  const cardStyle = cardH ? { height: cardH, marginBottom: CARD_GAP } : undefined;

  return (
    <div className="ms-layer" aria-label="속보 넘겨보기">
      <nav className="ms-rings" aria-label="테마별로 보기">
        <button
          type="button"
          className={`ms-ring all ${!filter ? "on" : ""}`}
          onClick={() => onFilter(null)}
          aria-pressed={!filter}
        >
          <span className="ms-ring-c">
            <span>
              <i className="ms-live" aria-hidden="true" />
              전체
            </span>
          </span>
          <small>지금</small>
        </button>
        {rings.map((t) => {
          const on = filter?.kind === "theme" && filter.value === t.theme;
          return (
            <button
              type="button"
              key={t.theme}
              className={`ms-ring ${heatClass(t.avg)} ${on ? "on" : ""}`}
              onClick={() => onFilter(on ? null : { kind: "theme", value: t.theme })}
              aria-pressed={on}
              aria-label={`${t.theme} 테마 속보 ${t.count}건만 보기`}
            >
              <span className="ms-ring-c">
                <span>{shortTheme(t.theme, 4)}</span>
              </span>
              <small className={`mono ${tone(t.avg)}`}>{isNum(t.avg) ? pct(t.avg) : `${t.count}건`}</small>
            </button>
          );
        })}
      </nav>

      {filter && filter.kind !== "theme" && (
        <button type="button" className="ms-filter" onClick={() => onFilter(null)}>
          {filterLabel(filter)} 속보만 보는 중 <X size={13} />
        </button>
      )}

      <div
        className="ms-scroller"
        ref={scrollerRef}
        onScroll={onScroll}
        onTouchStart={() => (holdTopUntil.current = 0)}
        onWheel={() => (holdTopUntil.current = 0)}
      >
        {slides.length === 0 && (
          <div className="ms-empty">
            {filter ? `${filterLabel(filter)} 속보가 아직 없습니다.` : "속보를 불러오는 중입니다…"}
          </div>
        )}
        {slides.map((sl, i) =>
          sl.ad ? (
            <AdCard key={sl.key} near={Math.abs(active - i) <= 1} onGone={goneFor(sl.key)} style={cardStyle} />
          ) : (
            <NewsCard
              key={sl.key}
              n={sl.n}
              num={sl.num}
              total={list.length}
              active={i === active}
              isNew={Boolean(newIds?.has?.(sl.n.id))}
              first={i === 0 && active === 0}
              now={now}
              watched={Boolean(sl.n.stocks?.[0] && watch.has(sl.n.stocks[0].code))}
              onWatch={watch.toggle}
              style={cardStyle}
            />
          )
        )}
      </div>

      {pending > 0 && active > 0 && (
        <button
          type="button"
          className="ms-newpill"
          onClick={() => {
            scrollerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
            setPending(0);
          }}
        >
          <ArrowUp size={14} /> 새 속보 {pending}건
        </button>
      )}
    </div>
  );
}
