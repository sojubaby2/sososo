"use client";

// components/AdSlot.js
//
// [2026-10-27 신설] 광고 한 칸 — 구글 애드센스 "광고 단위"를 사이트 안 정해진 자리에 넣습니다.
//
// 쓰는 법: <AdSlot kind="display" />  또는  <AdSlot kind="inArticle" />
//   광고 단위 번호는 lib/ads.js의 AD_SLOTS에서 가져옵니다. 번호가 비어 있으면 아무것도 그리지 않습니다.
//
// 지키는 것들(애드센스 정책·사용성):
//   · 광고 위에 작은 "광고" 표시 — 내용과 광고가 헷갈리지 않게
//   · 따라다니는(고정) 칸에는 넣지 않음 — 정책상 떠 있는 광고는 안 됨
//   · 채울 광고가 없으면(unfilled) 칸을 숨김 — 빈 네모가 남지 않게(globals.css .ad-wrap)
//   · 페이지를 옮길 때마다 새 광고를 요청 — 사이트 안에서 이동해도 광고가 다시 채워짐

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { AD_CLIENT, AD_SLOTS } from "../lib/ads";

function AdBox({ slot, kind }) {
  const insRef = useRef(null);
  useEffect(() => {
    const ins = insRef.current;
    if (!ins) return;
    // 화면에 실제로 보이는(폭이 있는) 칸만 광고를 요청합니다.
    //   홈은 PC용·휴대폰용 화면이 둘 다 들어 있고 하나는 숨겨져 있어서, 숨은 칸에 요청하면 오류가 납니다.
    //   휴대폰 "시장" 탭처럼 처음엔 숨어 있다가 나중에 보이는 칸은, 보이는 순간 요청합니다.
    const request = () => {
      // 이미 광고를 요청한 칸이면 다시 요청하지 않음(같은 칸에 두 번 요청하면 오류)
      if (ins.getAttribute("data-adsbygoogle-status") || ins.offsetWidth === 0) return false;
      // 보이는 순간에 "adsbygoogle" 이름표를 붙입니다. 광고 코드는 이 이름표가 붙은 칸 중 아직 안 채운 칸을
      // 차례로 채우기 때문에, 숨은 칸에는 처음부터 이름표를 붙이지 않아야 엉뚱한 칸을 집지 않습니다.
      ins.classList.add("adsbygoogle");
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch {
        // 광고 차단기 등으로 막힌 경우 — 조용히 넘어감(칸은 CSS가 숨김)
      }
      return true;
    };
    if (request() || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (request()) ro.disconnect();
    });
    ro.observe(ins);
    return () => ro.disconnect();
  }, []);

  const inArticle = kind === "inArticle";
  return (
    <ins
      ref={insRef}
      className="ad-ins"
      style={{ display: "block", textAlign: inArticle ? "center" : undefined }}
      data-ad-client={AD_CLIENT}
      data-ad-slot={slot}
      {...(inArticle
        ? { "data-ad-layout": "in-article", "data-ad-format": "fluid" }
        : { "data-ad-format": "auto", "data-full-width-responsive": "true" })}
    />
  );
}

export default function AdSlot({ kind = "display", className = "" }) {
  const pathname = usePathname();
  const slot = AD_SLOTS[kind];
  if (!slot) return null;
  return (
    <aside className={`ad-wrap ad-${kind} ${className}`} aria-label="광고">
      <span className="ad-label">광고</span>
      {/* key: 페이지가 바뀌면 칸을 새로 만들어 새 광고를 받음 */}
      <AdBox key={`${pathname}-${slot}`} slot={slot} kind={kind} />
    </aside>
  );
}
