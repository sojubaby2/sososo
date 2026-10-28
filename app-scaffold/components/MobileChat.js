"use client";

// components/MobileChat.js
//
// [2026-10-28 신설] 휴대폰 "속보" 탭 — C. 속보 채널(텔레그램 채팅방처럼).
//   재성님: "c형으로 한번적용 해봐도돼? 맘에안들면 다시 a+b로 올게"
//   → 되돌리려면 lib/mobileLayout.js의 MOBILE_FEED를 "shorts"로 바꾸면 됩니다(숏폼 코드도 그대로 남아 있음).
//
// 화면(위에서부터):
//   · 채널 머리: 뉴스매매 속보 · 실시간(장중/장 마감) · 알림음 단추
//   · 고정 공지: 오늘 장 예측(누르면 펼침)
//   · 대화창: 오래된 속보가 위, 새 속보가 맨 아래에 메시지처럼 쌓임. 시간이 바뀔 때마다 "오전 10시" 구분선,
//       한 시간이 끝나면 "오전 10시 요약" 메시지(많이 나온 테마·분위기·가장 크게 움직인 종목).
//       메시지 제목을 누르면 요약·관련 근거·원문 링크가 펼쳐지고, 종목 단추를 누르면 차트.
//   · 새 속보: 맨 아래를 보고 있으면 저절로 내려가서 보여 줌. 위쪽 옛 속보를 읽는 중이면 "새 속보 N건 ↓" 단추만.
//   · 맨 아래 거르기 단추: 전체 · 내 관심종목 · 단독·속보 · 많이 나온 테마들
//   · 광고: 메시지 10개마다 1칸(맨 아래 가까운 쪽 3칸까지), "광고" 표시. 채울 광고가 없으면 칸이 사라짐.
//
// ★ PC 화면(761px 이상)에서는 아예 그리지 않습니다.
// ★ 비용: 오늘 장 예측은 원래 쓰던 /api/daily-outlook(공용 저장)을 한 번 읽는 것뿐. 나머지는 추가 비용 0.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Bell, BellOff, ChevronDown, ExternalLink, Pin, AlertTriangle, ListChecks } from "lucide-react";
import { openStockChart } from "../lib/openStockChart";
import { useWatchlist } from "../lib/watchlist";
import AdSlot from "./AdSlot";
import {
  FRESH_MINUTES,
  HOT_TAGS,
  dayKey,
  groupSummary,
  hhmm,
  hourLabel,
  isNum,
  kstParts,
  minutesAgo,
  pct,
  splitTags,
  themeStats,
  todaysOf,
  tone,
  useNow,
} from "./MobileFeed";

const PAGE = 50; // 처음 보여 줄 속보 수, "이전 속보 더 보기" 한 번에 더할 수
const MAX = 200;
const AD_EVERY = 10; // 메시지 몇 개마다 광고 1칸
const AD_MAX = 3;
const CHIP_THEMES = 6;
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

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

// 한국 시간 평일 09:00~15:30이면 장중
function marketOpen(now) {
  const k = new Date(now + 9 * 3600 * 1000);
  const wd = k.getUTCDay();
  const m = k.getUTCHours() * 60 + k.getUTCMinutes();
  return wd >= 1 && wd <= 5 && m >= 540 && m < 930;
}

function isHot(n, now) {
  const m = minutesAgo(n.ts, now);
  if (m !== null && m < FRESH_MINUTES) return true;
  return splitTags(n.headline).tags.some((t) => HOT_TAGS.has(t));
}

// 오늘 장 예측(고정 공지)
function PinnedOutlook() {
  const [outlook, setOutlook] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/daily-outlook")
      .then((r) => r.json())
      .then((d) => {
        if (alive && Array.isArray(d?.outlook?.picks) && d.outlook.picks.length) setOutlook(d.outlook);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  if (!outlook) return null;
  const [first, ...rest] = outlook.picks;
  const word = (p) => (p.direction === "up" ? "강세 예상" : p.direction === "down" ? "약세 예상" : "주목");
  return (
    <button type="button" className={`mc-pin ${open ? "open" : ""}`} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
      <Pin size={15} aria-hidden="true" />
      <span className="mc-pin-body">
        <span className="mc-pin-line">
          <b>{outlook.heading || "오늘 장 예측"}</b> · {first.theme} <em className={first.direction}>{word(first)}</em>
        </span>
        {open && (
          <span className="mc-pin-more">
            {outlook.picks.map((p) => (
              <span key={p.theme}>
                <b>{p.theme}</b> <em className={p.direction}>{word(p)}</em> — {p.reason}
              </span>
            ))}
          </span>
        )}
        {!open && first.reason && <span className="mc-pin-sub">{first.reason}</span>}
      </span>
      {rest.length > 0 && <ChevronDown size={15} className="mc-pin-arrow" aria-hidden="true" />}
    </button>
  );
}

// 속보 메시지 하나
function Message({ n, now, isNew, latest, focused }) {
  const [open, setOpen] = useState(false);
  const m = minutesAgo(n.ts, now);
  const fresh = m !== null && m < FRESH_MINUTES;
  const { tags: rawTags, text } = splitTags(n.headline);
  const tags = fresh ? rawTags.filter((t) => t !== "속보") : rawTags;
  const stocks = n.stocks || [];
  return (
    <article
      className={`mc-msg ${isNew ? "is-new" : ""} ${latest ? "is-latest" : ""} ${focused ? "is-focus" : ""}`}
      data-id={n.id}
    >
      {(isNew || fresh || tags.length > 0 || n.theme) && (
        <div className="mc-msg-top">
          {isNew && <span className="mc-newtag">NEW</span>}
          {fresh && <span className="mc-brk">속보</span>}
          {tags.map((t) => (
            <span key={t} className={`mc-tag ${HOT_TAGS.has(t) ? "hot" : ""}`}>
              {t}
            </span>
          ))}
          {n.theme && <span className="mc-theme">{n.theme}</span>}
        </div>
      )}
      <button type="button" className="mc-msg-title" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {text}
      </button>
      {open && (
        <div className="mc-more">
          {n.summary && n.summary !== n.headline && <p>{n.summary}</p>}
          {n.reasons?.length > 0 && <p className="mc-why">관련 근거: {n.reasons.join(" / ")}</p>}
          {n.link && (
            <a href={n.link} target="_blank" rel="noopener noreferrer">
              원문 기사 <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}
      {stocks.length > 0 && (
        <div className="mc-chips">
          {stocks.slice(0, 3).map((s) => (
            <button
              type="button"
              key={s.code}
              className="mc-chip"
              onClick={() => openStockChart({ code: s.code, name: s.name, market: s.market })}
              title={`${s.name} 차트 보기`}
            >
              {s.catalyst && <AlertTriangle size={11} aria-label="악재" />}
              {s.name} <b className={`mono ${tone(s.change)}`}>{pct(s.change)}</b>
            </button>
          ))}
          {stocks.length > 3 && <span className="mc-chip-more">외 {stocks.length - 3}</span>}
        </div>
      )}
      <div className="mc-msg-foot">
        <span className="mono">{hhmm(kstParts(n.ts))}</span>
        {!open && (n.summary || n.link) && (
          <button type="button" className="mc-open" onClick={() => setOpen(true)}>
            자세히
          </button>
        )}
      </div>
    </article>
  );
}

export default function MobileChat({ items, newIds, filter, onFilter, focusId, onFocused, soundEnabled, onToggleSound }) {
  const phone = useIsPhone();
  const now = useNow();
  const watch = useWatchlist();
  const scrollerRef = useRef(null);
  const [limit, setLimit] = useState(PAGE);
  const [pending, setPending] = useState(0);
  const [focusFlash, setFocusFlash] = useState(null);
  const atBottomRef = useRef(true);
  const keepFromBottomRef = useRef(null); // "이전 속보 더 보기" 누를 때 화면 위치 지키기용

  const chipThemes = useMemo(() => themeStats(todaysOf(items)).slice(0, CHIP_THEMES), [items]);
  const watchCodes = useMemo(() => new Set(watch.list.map((s) => s.code)), [watch.list]);

  const filtered = useMemo(() => {
    if (!filter) return items;
    if (filter.kind === "theme") return items.filter((n) => n.themes?.includes(filter.value));
    if (filter.kind === "stock") return items.filter((n) => n.stocks?.some((s) => s.name === filter.value));
    if (filter.kind === "watch") return items.filter((n) => n.stocks?.some((s) => watchCodes.has(s.code)));
    if (filter.kind === "hot") return items.filter((n) => isHot(n, Date.now()));
    return items;
  }, [items, filter, watchCodes]);

  // 대화창에 그릴 줄들(오래된 것 → 새것): 날짜·시간 구분선, 속보, 시간 요약, 광고
  const { rows, hasMore, newestId } = useMemo(() => {
    const total = filtered.length;
    const shown = filtered.slice(0, Math.min(limit, MAX));
    const chrono = [...shown].reverse();
    const out = [];
    let lastDay = "";
    let lastHour = null;
    let group = [];
    const adAnchors = new Set();
    // 광고 자리: 전체 목록에서 "오래된 쪽부터 10번째마다" — 새 속보가 와도 광고 자리가 그대로라 광고를 다시 부르지 않음.
    //   그중 맨 아래(최신) 가까운 3칸만
    const anchors = [];
    shown.forEach((n, i) => {
      const abs = total - 1 - i;
      if (abs % AD_EVERY === AD_EVERY - 1 && i >= 3) anchors.push(n.id);
    });
    anchors.slice(0, AD_MAX).forEach((id) => adAnchors.add(id));

    const flushSummary = () => {
      if (group.length >= 3) {
        const s = groupSummary(group);
        out.push({ type: "sum", key: `sum-${group[0].id}`, hour: lastHour, ...s, count: group.length });
      }
      group = [];
    };
    for (const n of chrono) {
      const p = kstParts(n.ts);
      const dk = dayKey(p);
      const h = p ? p.h : null;
      if (dk !== lastDay || h !== lastHour) {
        if (lastHour !== null) flushSummary();
        const date = dk !== lastDay && p ? `${p.mo}월 ${p.d}일 (${WEEK[new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay()]}) ` : "";
        out.push({ type: "sep", key: `sep-${dk}-${h}-${n.id}`, label: `${date}${h !== null ? hourLabel(h) : ""}` });
        lastDay = dk;
        lastHour = h;
      }
      out.push({ type: "msg", key: n.id, n });
      group.push(n);
      if (adAnchors.has(n.id)) out.push({ type: "ad", key: `ad-${n.id}` });
    }
    return { rows: out, hasMore: total > shown.length && shown.length < MAX, newestId: shown[0]?.id };
  }, [filtered, limit]);

  const msgCount = rows.filter((r) => r.type === "msg").length;

  function isAtBottom() {
    const el = scrollerRef.current;
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 90;
  }
  function toBottom(smooth) {
    const el = scrollerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    setPending(0);
  }
  function onScroll() {
    atBottomRef.current = isAtBottom();
    if (atBottomRef.current) setPending(0);
  }

  // 줄이 바뀐 뒤(새 속보·더 보기·거르기): 화면 위치 맞추기
  const filterKey = filter ? `${filter.kind}:${filter.value || ""}` : "";
  const prevNewest = useRef(null);
  const prevCount = useRef(0);
  const prevFilter = useRef(filterKey);
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (prevFilter.current !== filterKey) {
      // 거르기를 바꾸면 맨 아래(최신)로
      prevFilter.current = filterKey;
      el.scrollTop = el.scrollHeight;
      atBottomRef.current = true;
      setPending(0);
    } else if (keepFromBottomRef.current !== null) {
      // 위에 옛 속보를 더 붙였을 때 — 보던 메시지가 그대로 보이게
      el.scrollTop = el.scrollHeight - keepFromBottomRef.current;
      keepFromBottomRef.current = null;
    } else if (prevNewest.current === null || atBottomRef.current) {
      el.scrollTop = el.scrollHeight; // 처음 열었거나 맨 아래를 보고 있었으면 새 속보까지 내려감
    } else if (newestId !== prevNewest.current) {
      const added = Math.max(1, msgCount - prevCount.current);
      setPending((c) => c + added);
    }
    prevNewest.current = newestId ?? null;
    prevCount.current = msgCount;
  }, [rows, phone]);

  // 거르기를 바꾸면 처음 개수로
  useEffect(() => {
    setLimit(PAGE);
  }, [filterKey]);

  // 테마 탭에서 특정 속보를 눌러 넘어온 경우 그 메시지로
  useEffect(() => {
    if (!focusId || !phone) return;
    const el = scrollerRef.current;
    const t = setTimeout(() => {
      const target = el?.querySelector(`[data-id="${CSS.escape(focusId)}"]`);
      if (target && el) {
        el.scrollTop = target.offsetTop - el.clientHeight / 3;
        atBottomRef.current = isAtBottom();
        setFocusFlash(focusId);
        setTimeout(() => setFocusFlash(null), 2200);
      }
      onFocused?.();
    }, 60);
    return () => clearTimeout(t);
  }, [focusId, phone]);

  // 맨 아래를 보던 중에 창 크기·글꼴·고정 공지 때문에 높이가 바뀌면 계속 맨 아래에 붙어 있게
  useEffect(() => {
    if (!phone) return;
    const el = scrollerRef.current;
    if (!el) return;
    const stick = () => {
      if (atBottomRef.current) el.scrollTop = el.scrollHeight;
    };
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(stick) : null;
    ro?.observe(el);
    document.fonts?.ready?.then(stick).catch(() => {});
    return () => ro?.disconnect();
  }, [phone]);

  // 아래 탭 줄의 "속보"를 다시 누르면 맨 아래(최신)로
  useEffect(() => {
    const go = () => toBottom(true);
    window.addEventListener("nm-shorts-top", go);
    return () => window.removeEventListener("nm-shorts-top", go);
  }, []);

  if (!phone) return null;

  const open = marketOpen(now);
  const chips = [
    { key: "all", label: "전체", on: !filter, pick: () => onFilter(null) },
    {
      key: "watch",
      label: `내 관심종목${watch.list.length ? ` ${watch.list.length}` : ""}`,
      on: filter?.kind === "watch",
      pick: () => onFilter(filter?.kind === "watch" ? null : { kind: "watch", value: "관심종목" }),
    },
    { key: "hot", label: "단독·속보", on: filter?.kind === "hot", pick: () => onFilter(filter?.kind === "hot" ? null : { kind: "hot", value: "단독·속보" }) },
    ...chipThemes.map((t) => ({
      key: `t-${t.theme}`,
      label: t.theme,
      on: filter?.kind === "theme" && filter.value === t.theme,
      pick: () => onFilter(filter?.kind === "theme" && filter.value === t.theme ? null : { kind: "theme", value: t.theme }),
    })),
  ];
  // 테마 탭·대표 종목에서 넘어온 거르기가 단추 목록에 없으면 앞에 붙여서 켜진 걸 보이게
  if (filter && (filter.kind === "stock" || (filter.kind === "theme" && !chipThemes.some((t) => t.theme === filter.value)))) {
    chips.splice(1, 0, { key: "cur", label: filter.value, on: true, pick: () => onFilter(null) });
  }

  return (
    <div className="mc-layer" aria-label="속보 채널">
      <header className="mc-head">
        <span className="mc-avatar" aria-hidden="true">
          뉴
        </span>
        <div className="mc-head-t">
          <b>뉴스매매 속보</b>
          <span className={open ? "on" : ""}>
            <i aria-hidden="true" />
            {open ? "실시간 · 장중" : "실시간 · 장 마감"}
          </span>
        </div>
        <button
          type="button"
          className={`mc-bell ${soundEnabled ? "on" : ""}`}
          onClick={onToggleSound}
          aria-label={`새 속보 알림음 ${soundEnabled ? "끄기" : "켜기"}`}
          aria-pressed={soundEnabled}
        >
          {soundEnabled ? <Bell size={20} /> : <BellOff size={20} />}
        </button>
      </header>
      <PinnedOutlook />

      <div className="mc-scroller" ref={scrollerRef} onScroll={onScroll}>
        {hasMore && (
          <button
            type="button"
            className="mc-older"
            onClick={() => {
              const el = scrollerRef.current;
              keepFromBottomRef.current = el ? el.scrollHeight - el.scrollTop : null;
              setLimit((l) => l + PAGE);
            }}
          >
            이전 속보 더 보기
          </button>
        )}
        {msgCount === 0 && (
          <div className="mc-empty">
            {filter?.kind === "watch" && watch.list.length === 0
              ? "아직 담은 관심종목이 없어요. 종목을 눌러 차트 창의 ☆로 담아 보세요."
              : filter
              ? `${filter.value} 속보가 아직 없습니다.`
              : "속보를 불러오는 중입니다…"}
          </div>
        )}
        {rows.map((r) => {
          if (r.type === "sep") {
            return (
              <div key={r.key} className="mc-sep">
                <span>{r.label}</span>
              </div>
            );
          }
          if (r.type === "sum") {
            return (
              <div key={r.key} className="mc-sum">
                <div className="mc-sum-h">
                  <ListChecks size={14} aria-hidden="true" />
                  {hourLabel(r.hour)} 요약 · 속보 {r.count}건
                </div>
                <p>
                  {r.themes.length > 0 ? `${r.themes.join("·")} 쪽 속보가 많았어요.` : "여러 테마 속보가 고르게 나왔어요."}
                  {r.word && (
                    <>
                      {" "}
                      관련주 분위기 <b className={r.wordTone}>{r.word}</b>.
                    </>
                  )}
                  {r.mover && isNum(r.mover.s.change) && (
                    <>
                      {" "}
                      가장 크게 움직인 종목은 {r.mover.s.name} <b className={`mono ${tone(r.mover.s.change)}`}>{pct(r.mover.s.change)}</b>.
                    </>
                  )}
                </p>
              </div>
            );
          }
          if (r.type === "ad") {
            return (
              <div key={r.key} className="mc-ad">
                <AdSlot kind="inFeed" />
              </div>
            );
          }
          return (
            <Message
              key={r.key}
              n={r.n}
              now={now}
              isNew={Boolean(newIds?.has?.(r.n.id))}
              latest={r.n.id === newestId}
              focused={focusFlash === r.n.id}
            />
          );
        })}
        <div className="mc-endpad" aria-hidden="true" />
      </div>

      {pending > 0 && (
        <button type="button" className="mc-newpill" onClick={() => toBottom(true)}>
          새 속보 {pending}건 <ArrowDown size={14} />
        </button>
      )}

      <div className="mc-filters" role="group" aria-label="속보 거르기">
        {chips.map((c) => (
          <button type="button" key={c.key} className={`mc-filter ${c.on ? "on" : ""}`} aria-pressed={c.on} onClick={c.pick}>
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
