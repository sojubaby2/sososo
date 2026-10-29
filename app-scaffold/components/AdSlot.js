"use client";

// components/AdSlot.js
//
// [2026-10-27 신설] 광고 한 칸 — 구글 애드센스 "광고 단위"를 사이트 안 정해진 자리에 넣습니다.
// [2026-10-28 개편] 광고 종류 4가지 + 화면 가까이 왔을 때만 불러오기(지연 불러오기).
//
// 쓰는 법: <AdSlot kind="display" />  /  "inFeed"  /  "inArticle"  /  "multiplex"
//   eager: 화면 가까이 왔는지 따지지 않고 보이는 즉시 요청(휴대폰 숏폼 광고 카드처럼, 부르는 쪽이 이미 "곧 볼 자리"일 때만 켜서 씀)
//   box: 정해진 크기 칸에 꼭 맞는 광고(예: 휴대폰 속보 카드 사이 광고). 칸 크기는 CSS(.ad-box ins)가 정합니다.
//        [2026-10-28 추가] 구글 안내: 반응형 광고에서 data-ad-format을 빼고 칸 너비·높이를 정해 주면 그 크기에 맞춰 나옴
//   banner: [2026-10-29 추가] 가로로 납작한 띠 광고(높이 약 90px) — 재성님: "본문 중간중간 있는 광고들 … 좀 거슬리는거같은데"
//        PC 속보 목록 사이 광고가 반응형(auto)이라 화면 반을 덮는 큰 상품 광고로 나와서, 구글 공식 옵션
//        data-ad-format="horizontal"(가로형)로 바꿈. 광고 단위 번호는 display와 같은 것을 씀.
//   광고 단위 번호는 lib/ads.js의 AD_SLOTS에서 가져옵니다.
//   그 종류 번호가 비어 있으면 display 번호로 대신 나오고, display도 비어 있으면 아무것도 그리지 않습니다.
//
// 지키는 것들(애드센스 정책·사용성):
//   · 광고 위에 작은 "광고" 표시 — 내용과 광고가 헷갈리지 않게
//   · 따라다니는(고정) 칸에는 넣지 않음 — 정책상 떠 있는 광고는 안 됨(떠 있는 광고는 구글 자동 "앵커 광고"만 사용)
//   · 채울 광고가 없으면(unfilled) 칸을 숨김 — 빈 네모가 남지 않게(globals.css .ad-wrap)
//   · 화면에 가까워졌을 때만 광고를 요청 — 안 보는 광고를 부르지 않아 가시성↑(단가↑), 첫 화면도 빨라짐
//   · 페이지를 옮길 때마다 새 광고를 요청 — 사이트 안에서 이동해도 광고가 다시 채워짐

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { AD_CLIENT, AD_SLOTS, AD_LAZY_MARGIN } from "../lib/ads";

// 종류별 애드센스 표시 방식
function adAttrs(kind, box, banner) {
  if (box) return {}; // 칸 크기에 맞춤(CSS로 너비·높이 지정)
  if (banner) return { "data-ad-format": "horizontal", "data-full-width-responsive": "false" }; // 가로 띠
  if (kind === "inArticle") return { "data-ad-layout": "in-article", "data-ad-format": "fluid" };
  if (kind === "inFeed") return { "data-ad-format": "fluid", "data-ad-layout-key": AD_SLOTS.inFeedLayoutKey };
  if (kind === "multiplex") return { "data-ad-format": "autorelaxed" };
  return { "data-ad-format": "auto", "data-full-width-responsive": "true" };
}

// 그 종류를 실제로 쓸 수 있는지(번호가 있는지). 없으면 display로 대신.
function resolveKind(kind) {
  if (kind === "inFeed") return AD_SLOTS.inFeed && AD_SLOTS.inFeedLayoutKey ? "inFeed" : "display";
  if (kind !== "display" && AD_SLOTS[kind]) return kind;
  return "display";
}

function AdBox({ slot, kind, box, banner, eager }) {
  const insRef = useRef(null);
  useEffect(() => {
    const ins = insRef.current;
    if (!ins) return;
    let done = false;
    let near = Boolean(eager);
    // 광고 요청 조건: ① 화면에 실제로 보이는 칸(폭이 있음) ② 화면 가까이 내려왔음 ③ 아직 요청 안 함
    //   홈은 PC용·휴대폰용 화면이 둘 다 들어 있고 하나는 숨겨져 있어서, 숨은 칸에 요청하면 오류가 납니다.
    //   휴대폰 "시장" 탭처럼 처음엔 숨어 있다가 나중에 보이는 칸은, 보이는 순간 요청합니다.
    const request = () => {
      if (done || !near || ins.getAttribute("data-adsbygoogle-status") || ins.offsetWidth === 0) return;
      done = true;
      // 요청하는 순간에 "adsbygoogle" 이름표를 붙입니다. 광고 코드는 이 이름표가 붙은 칸 중 아직 안 채운 칸을
      // 차례로 채우기 때문에, 숨은 칸·먼 칸에는 미리 이름표를 붙이지 않아야 엉뚱한 칸을 집지 않습니다.
      ins.classList.add("adsbygoogle");
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch {
        // 광고 차단기 등으로 막힌 경우 — 조용히 넘어감(칸은 CSS가 숨김)
      }
      cleanup();
    };
    const io =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries) => {
              if (entries.some((e) => e.isIntersecting)) {
                near = true;
                request();
              }
            },
            { rootMargin: `${AD_LAZY_MARGIN}px 0px ${AD_LAZY_MARGIN}px 0px` }
          )
        : null;
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => request()) : null;
    function cleanup() {
      io?.disconnect();
      ro?.disconnect();
    }
    if (io) io.observe(ins);
    else near = true; // 아주 오래된 브라우저 — 바로 요청
    ro?.observe(ins);
    request();
    return cleanup;
  }, []);

  return (
    <ins
      ref={insRef}
      className="ad-ins"
      style={{ display: "block", textAlign: kind === "inArticle" ? "center" : undefined }}
      data-ad-client={AD_CLIENT}
      data-ad-slot={slot}
      {...adAttrs(kind, box, banner)}
    />
  );
}

export default function AdSlot({ kind = "display", className = "", box = false, banner = false, eager = false }) {
  const pathname = usePathname();
  const real = box ? "display" : resolveKind(kind);
  const slot = AD_SLOTS[real];
  if (!slot) return null;
  return (
    <aside className={`ad-wrap ad-${real} ${box ? "ad-box" : ""} ${banner ? "ad-banner" : ""} ${className}`} aria-label="광고">
      <span className="ad-label">광고</span>
      {/* key: 페이지가 바뀌면 칸을 새로 만들어 새 광고를 받음 */}
      <AdBox key={`${pathname}-${real}-${slot}-${box ? "b" : ""}${banner ? "h" : ""}`} slot={slot} kind={real} box={box} banner={banner} eager={eager} />
    </aside>
  );
}
