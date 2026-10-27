// app/disclosure/opengraph-image.js
//
// [2026-10-27 신설] "공시 일정" 링크를 카카오톡 등에 올렸을 때 뜨는 미리보기 그림.
// 재성님 요청: "공시일정 링크 카톡공유시 누르고싶게끔 바꿔줘"
//
// 그림에 들어가는 것(그림을 만든 시점 기준 — 30분 저장본 lib/disclosures.js):
//   · 큰 제목: "이번 주 놓치면 안 되는 공시 일정"
//   · 왼쪽: 앞으로 7일 안의 일정 4개(날짜·종목·무상증자 권리락 같은 내용)
//   · 오른쪽: 오늘 나온 주요 공시 건수(실적·수주·자사주·증자 …)
// 카카오톡은 한 번 받아 간 그림을 한동안 다시 쓰므로, 그림 안에 날짜를 같이 적어 둡니다.

import { ImageResponse } from "next/og";
import { getDisclosureData, kstTodayIso, categoryLabel } from "../../lib/disclosures";
import { OgFrame, OG_SIZE, OG_COLORS as C, ogFonts, clip } from "../../lib/ogImage";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "뉴스매매 공시 일정";
export const revalidate = 1800;

const DAY = ["일", "월", "화", "수", "목", "금", "토"];
const md = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}(${DAY[new Date(`${iso}T00:00:00Z`).getUTCDay()]})`;
function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const SHORT = {
  "free-record": "무상증자 기준일",
  "free-ex": "무상증자 권리락",
  "free-list": "무상증자 신주 상장",
  "cut-halt": "감자 거래정지",
  "cut-halt-end": "감자 정지 끝",
  "cut-list": "감자 신주 상장",
  "buyback-start": "자사주 매입 시작",
  "buyback-end": "자사주 매입 끝",
};

export default async function Image() {
  const data = await getDisclosureData().catch(() => null);
  const today = data?.today || kstTodayIso();
  // 사람들이 눈여겨보는 일정(권리락·상장·거래정지·매입 시작)을 앞으로 7일 안에서 먼저
  const prio = ["free-ex", "free-list", "cut-halt", "cut-list", "buyback-start", "free-record"];
  const upcoming = (data?.events || [])
    .filter((e) => e.code && e.date >= today && e.date <= addDays(today, 7))
    .sort((a, b) => prio.indexOf(a.type) - prio.indexOf(b.type) || (a.date < b.date ? -1 : 1))
    .slice(0, 4)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  // 오늘(없으면 가장 최근 날) 주요 공시 건수
  const lastDay = data?.recent?.[0]?.date || today;
  const counts = {};
  for (const r of data?.recent || []) if (r.date === lastDay) counts[r.cat] = (counts[r.cat] || 0) + 1;
  const top = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const dayWord = lastDay === today ? "오늘" : md(lastDay);

  return new ImageResponse(
    (
      <OgFrame tag="공시 일정">
        <div style={{ display: "flex", fontSize: 58, letterSpacing: -2 }}>이번 주 놓치면 안 되는 공시 일정</div>
        <div style={{ display: "flex", gap: 40, marginTop: 30 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, flexGrow: 1 }}>
            {upcoming.length === 0 ? (
              <div style={{ display: "flex", fontSize: 32, color: C.muted }}>무상증자 권리락 · 감자 · 자사주 매입 일정을 한눈에</div>
            ) : (
              upcoming.map((e, i) => (
                <div key={i} style={{ display: "flex", fontSize: 32, gap: 16, alignItems: "baseline" }}>
                  <span style={{ color: C.amber, width: 170, whiteSpace: "nowrap" }}>{md(e.date)}</span>
                  <span>{clip(e.name, 9)}</span>
                  <span style={{ color: C.muted, fontSize: 28 }}>{SHORT[e.type] || e.label}</span>
                </div>
              ))
            )}
          </div>
          {top.length > 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                background: C.panel,
                borderRadius: 20,
                padding: "20px 28px",
                minWidth: 300,
              }}
            >
              <div style={{ display: "flex", fontSize: 24, color: C.muted }}>{dayWord} 나온 주요 공시</div>
              {top.map(([k, n]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 32, gap: 20 }}>
                  <span>{categoryLabel(k)}</span>
                  <span style={{ color: C.amber }}>{n}건</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </OgFrame>
    ),
    { ...size, fonts: await ogFonts() }
  );
}
