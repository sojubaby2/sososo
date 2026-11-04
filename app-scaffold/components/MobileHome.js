"use client";

// components/MobileHome.js
//
// [2026-11-03 신설] 휴대폰 홈 "속보" 탭 새 디자인 (PC에서는 보이지 않음 — .m-only)
//   재성님: "모바일 화면은 뭔가 메뉴들도 눈에 잘 안 들어오고 불편한 느낌이 많아 — 다시 디자인해서 진행해봐"
//
//   예전(숏폼): 속보 한 건이 화면 하나 → 위로 밀어야 다음 속보, 다른 메뉴는 "전체" 안에 숨어 있었음.
//   이제:
//     ① 바로가기 4칸 — 장전 브리핑 · 장 마감 정리 · 신고가 돌파 · 공모주/공시 (오늘 상태가 같이 보임)
//     ② 지금 뜨는 테마 — 가로로 넘기는 칩. 누르면 그 테마 속보만(다시 누르면 전체)
//     ③ 속보 목록 — 스크롤만 하면 계속 이어서 보임. 카드마다 관련주(누르면 차트)·관심·공유·원문
//   예전 숏폼 화면(components/MobileShorts.js)은 지우지 않았습니다 — lib/mobileLayout.js에서 "shorts"로 바꾸면 되돌아갑니다.

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { Sunrise, BarChart3, Crown, Ticket, ChevronRight, Star, Share2, ExternalLink, AlertTriangle, ChevronDown } from "lucide-react";
import { openStockChart } from "../lib/openStockChart";
import { useWatchlist } from "../lib/watchlist";
import { useNavBadges } from "./Header";
import LivePct from "./LivePct"; // [2026-11-04] 등락률 칸을 부드럽게
import { useAthBreakouts } from "./AthBreakoutPanel";
import { FRESH_MINUTES, HOT_TAGS, agoText, isNum, minutesAgo, pct, splitTags, themeStats, todaysOf, tone, useNow, kstParts, hhmm } from "./MobileFeed";

const PAGE = 25; // 처음에 보여 줄 속보 수(더 보기로 25개씩)
const AD_AFTER = [3, 12]; // 이 번째 카드 다음에 광고(최대 2개)
const CHIP_COUNT = 10;
const SITE_URL = "https://newsmeme.co.kr/";

// ① 바로가기 4칸
function QuickTiles({ onOpenMarket }) {
  const badges = useNavBadges();
  const ath = useAthBreakouts();
  const athN = ath?.items?.length || 0;
  const brief = badges["/briefing"];
  const mk = badges["/market"];
  const ipo = badges["/ipo"];
  const tiles = [
    {
      key: "brief",
      href: "/briefing",
      Icon: Sunrise,
      title: "장전 브리핑",
      sub: brief?.text === "오늘" ? "오늘 나왔어요" : "매일 07:40",
      on: brief?.text === "오늘",
    },
    {
      key: "market",
      href: "/market",
      Icon: BarChart3,
      title: "장 마감 정리",
      sub: mk?.text === "오늘" ? "오늘 나왔어요" : "매일 장 마감 뒤",
      on: mk?.text === "오늘",
    },
    {
      key: "ath",
      Icon: Crown,
      title: "신고가 돌파",
      sub: athN > 0 ? `${athN}종목 돌파 중` : ath?.status === "live" ? "장중 실시간" : "상장 이후 최고가",
      on: athN > 0,
      hot: athN > 0,
      onClick: onOpenMarket,
    },
    {
      key: "ipo",
      href: "/ipo",
      Icon: Ticket,
      title: "공모주 · 공시",
      sub: ipo?.text ? (ipo.hot ? `${ipo.text} 진행 중` : `청약 ${ipo.text}`) : "청약·공시 일정",
      on: Boolean(ipo?.text),
      hot: Boolean(ipo?.hot),
    },
  ];
  return (
    <nav className="mh-quick" aria-label="바로가기">
      {tiles.map((t) => {
        const inner = (
          <>
            <span className={`mh-q-ico ${t.hot ? "hot" : ""}`}>
              <t.Icon size={20} strokeWidth={2} />
            </span>
            <span className="mh-q-txt">
              <b>{t.title}</b>
              <small className={t.on ? "on" : ""}>{t.sub}</small>
            </span>
            <ChevronRight size={16} className="mh-q-go" aria-hidden="true" />
          </>
        );
        return t.href ? (
          <Link key={t.key} href={t.href} className="mh-q">
            {inner}
          </Link>
        ) : (
          <button key={t.key} type="button" className="mh-q" onClick={t.onClick}>
            {inner}
          </button>
        );
      })}
    </nav>
  );
}

// ② 지금 뜨는 테마 칩
function ThemeChips({ items, active, onPick }) {
  const chips = useMemo(() => themeStats(todaysOf(items)).slice(0, CHIP_COUNT), [items]);
  if (!chips.length) return null;
  return (
    <div className="mh-chips-wrap">
      <div className="mh-sec-head">
        <h2>지금 뜨는 테마</h2>
        <span>누르면 그 테마 속보만</span>
      </div>
      <div className="mh-chips" role="tablist" aria-label="테마로 거르기">
        <button type="button" role="tab" aria-selected={!active} className={`mh-chip ${!active ? "on" : ""}`} onClick={() => onPick(null)}>
          전체
        </button>
        {chips.map((c) => {
          const on = active === c.theme;
          return (
            <button
              key={c.theme}
              type="button"
              role="tab"
              aria-selected={on}
              className={`mh-chip ${on ? "on" : ""}`}
              onClick={() => onPick(on ? null : c.theme)}
            >
              <span className="mh-chip-nm">{c.theme}</span>
              {isNum(c.avg) && <span className={`mono ${tone(c.avg)}`}>{pct(c.avg)}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ③ 속보 카드 하나
function FeedCard({ n, now, isNew, watched, onWatch }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const m = minutesAgo(n.ts, now);
  const fresh = m !== null && m < FRESH_MINUTES;
  const { tags: rawTags, text } = splitTags(n.headline);
  const tags = fresh ? rawTags.filter((t) => t !== "속보") : rawTags;
  const hot = fresh || rawTags.some((t) => HOT_TAGS.has(t));
  const stocks = n.stocks || [];
  const s0 = stocks[0];
  const p = kstParts(n.ts);
  const hasSum = n.summary && n.summary !== n.headline;

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
      // 공유 창을 닫은 경우 등
    }
  }

  return (
    <article className={`mh-card ${hot ? "hot" : ""} ${isNew ? "is-new" : ""}`}>
      <div className="mh-meta">
        {isNew && <span className="mh-new">NEW</span>}
        {fresh && <span className="mh-brk">속보</span>}
        {tags.map((t) => (
          <span key={t} className={`mh-tag ${HOT_TAGS.has(t) ? "hot" : ""}`}>
            {t}
          </span>
        ))}
        {n.theme && <span className="mh-theme">{n.theme}</span>}
        <span className="mh-time">
          {agoText(m)}
          {p ? ` · ${hhmm(p)}` : ""}
        </span>
      </div>

      <h3 className="mh-title" onClick={() => hasSum && setOpen((v) => !v)}>
        {text}
      </h3>
      {hasSum && (
        <button type="button" className={`mh-sum ${open ? "open" : ""}`} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <span>{n.summary}</span>
          {!open && <ChevronDown size={14} aria-hidden="true" />}
        </button>
      )}

      {stocks.length > 0 && (
        <div className="mh-stocks" aria-label="관련주 — 누르면 차트">
          {stocks.slice(0, 6).map((s) => (
            <button
              key={s.code}
              type="button"
              className={`mh-stock ${tone(s.change)}`}
              onClick={() => openStockChart({ code: s.code, name: s.name, market: s.market })}
              title={`${s.name} 차트 보기`}
            >
              {s.catalyst && <AlertTriangle size={12} aria-label="악재" />}
              <b>{s.name}</b>
              <LivePct value={s.change} pending={s.pending} empty="—" />
            </button>
          ))}
        </div>
      )}
      {s0?.reason && <p className="mh-why">왜 이 종목? {s0.reason}</p>}

      <div className="mh-acts">
        {s0 && (
          <button type="button" className={`mh-act ${watched ? "on" : ""}`} onClick={() => onWatch(s0)} aria-pressed={watched}>
            <Star size={15} fill={watched ? "currentColor" : "none"} /> {watched ? "관심 담김" : `${s0.name} 관심`}
          </button>
        )}
        <span className="mh-act-gap" />
        <button type="button" className="mh-act icon" onClick={share} aria-label="이 속보 공유하기">
          <Share2 size={15} />
          {copied && <span>복사됨</span>}
        </button>
        {n.link && (
          <a className="mh-act icon" href={n.link} target="_blank" rel="noopener noreferrer" aria-label="원문 기사 보기">
            <ExternalLink size={15} /> 원문
          </a>
        )}
      </div>
    </article>
  );
}

// 휴대폰 속보 탭 전체
//   filter / onFilter: 홈 화면(app/HomeClient.js)이 가진 테마 거르기 상태(시장 탭 테마 레이더에서 넘어올 때도 씀)
export default function MobileHome({ items, newIds, filter, onFilter, onOpenMarket, ad = null }) {
  const now = useNow();
  const watch = useWatchlist();
  const [limit, setLimit] = useState(PAGE);
  const activeTheme = filter?.kind === "theme" ? filter.value : null;
  const list = useMemo(() => {
    if (!filter) return items;
    if (filter.kind === "theme") return items.filter((n) => n.themes?.includes(filter.value) || n.theme === filter.value);
    return items.filter((n) => n.stocks?.some((s) => s.name === filter.value));
  }, [items, filter]);
  const watchedCodes = useMemo(() => new Set(watch.list.map((s) => s.code)), [watch.list]);

  function pick(theme) {
    onFilter(theme ? { kind: "theme", value: theme } : null);
    setLimit(PAGE);
  }

  return (
    <div className="mh m-only">
      <QuickTiles onOpenMarket={onOpenMarket} />
      <ThemeChips items={items} active={activeTheme} onPick={pick} />

      <div className="mh-sec-head mh-feed-head">
        <h2>
          <span className="live-dot" /> {activeTheme ? `${activeTheme} 속보` : filter ? `${filter.value} 속보` : "실시간 속보"}
        </h2>
        <span className="mono">{list.length}건</span>
        {filter && (
          <button type="button" className="mh-clear" onClick={() => pick(null)}>
            전체 보기 ✕
          </button>
        )}
      </div>

      {list.length === 0 ? (
        <p className="mh-empty">{filter ? "이 테마의 속보가 아직 없어요." : "아직 들어온 속보가 없어요. 새 속보가 오면 여기에 바로 쌓여요."}</p>
      ) : (
        <div className="mh-list">
          {list.slice(0, limit).map((n, i) => (
            <Fragment key={n.id}>
              <FeedCard
                n={n}
                now={now}
                isNew={newIds?.has(n.id)}
                watched={n.stocks?.[0] ? watchedCodes.has(n.stocks[0].code) : false}
                onWatch={(s) => watch.toggle({ code: s.code, name: s.name, market: s.market })}
              />
              {ad && AD_AFTER.includes(i) && <div className="mh-ad">{ad}</div>}
            </Fragment>
          ))}
          {list.length > limit && (
            <button type="button" className="mh-more" onClick={() => setLimit((v) => v + PAGE)}>
              속보 더 보기 ({list.length - limit}건 남음)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
