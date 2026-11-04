"use client";

// components/MotionFX.js
//
// [2026-11-04 신설] 사이트 전체 "움직임 효과" 담당 — 재성님: "효과가 들어가면 좋을법한 곳에 전부 적용해,
//   혁신적이고 진취적인 디자인으로" (배치는 그대로 두고 움직임·색감만 강화하기로 결정)
//
// app/layout.js에 한 번만 달아 두면 모든 페이지에 적용됩니다. 화면에는 아무것도 직접 그리지 않고,
// 이미 있는 화면 조각에 움직임만 입힙니다.
//
// 쓰는 도구 두 가지:
//   · Motion   — 스크롤하면 카드가 아래에서 떠오르며 나타남, 새 속보가 미끄러져 들어옴,
//                맨 위 읽은 만큼 차오르는 진행 막대, 메뉴 단추가 마우스 쪽으로 살짝 끌려옴(자석 효과)
//   · Anime.js — 로고 "뉴" 글자가 통통 튀며 등장, 브리핑 띠 세계지도의 시장 위치 점이 레이더처럼 퍼져 나감
//
// 안전장치:
//   · 컴퓨터/휴대폰 설정에서 "움직임 줄이기"를 켠 사람에게는 효과를 하나도 안 줍니다.
//   · 첫 화면(스크롤 안 해도 보이는 부분)은 숨기지 않습니다 — 깜빡임 없이 바로 보이고, 검색엔진도 그대로 읽음.
//   · 효과가 실패해도 글·숫자는 항상 그대로 보이게(숨김 표시가 지워지면 그냥 보임) 만들었습니다.
//   · 화면 글자(숫자)는 절대 직접 고치지 않습니다 — 실시간 시세 갱신이 멈추는 일을 막기 위해서.

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { animate, inView, scroll } from "motion";
import { animate as animeAnimate, stagger } from "animejs";

// 스크롤하면 떠오르며 나타날 조각들(카드·패널·글 덩어리). 페이지가 달라도 이 이름이면 다 적용됩니다.
const REVEAL_SELECTORS = [
  ".trending-panel",
  ".home-right > *",
  ".home-left > *",
  ".nb-lead",
  ".nb-second",
  ".nb > ul > li",
  ".mf-row",
  ".mk2-idx",
  ".blog-card",
  ".post-card",
  ".card",
  ".section-card",
  "main article > h2",
  "main article > p",
  "main section > h2",
  ".home-about > *",
  "table",
].join(",");

// 마우스를 올리면 빛이 따라다니는 카드
const SPOT_SELECTORS = ".trending-panel, .nb-lead, .nb-second, .home-right > *, .card, .blog-card, .post-card, .mk2-idx";

// 마우스 쪽으로 살짝 끌려오는 단추(자석 효과)
const MAGNET_SELECTORS = ".site-header .nav a, .site-header .nav button, .range-toggle-btn";

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function MotionFX() {
  const pathname = usePathname();

  // ── 한 번만: 진행 막대, 로고 등장, 빛 따라다니기, 자석 단추, 누른 자리 물결 ──────────
  useEffect(() => {
    if (reduced()) return undefined;
    const cleanups = [];

    // 1) 맨 위 진행 막대 — 페이지를 읽은 만큼 빨강→호박색 막대가 차오름 (Motion scroll)
    try {
      let bar = document.getElementById("fx-progress");
      if (!bar) {
        bar = document.createElement("div");
        bar.id = "fx-progress";
        bar.setAttribute("aria-hidden", "true");
        document.body.appendChild(bar);
      }
      const stop = scroll(animate(bar, { scaleX: [0, 1] }, { ease: "linear" }));
      cleanups.push(() => stop?.());
    } catch {}

    // 2) 로고 등장 — "뉴" 글자가 통통 튀고, 옆 설명이 미끄러져 들어옴 (Anime.js, 방문마다 한 번)
    try {
      const first = document.querySelector(".site-header .brand-name > span");
      if (first && !sessionStorage.getItem("fx-brand")) {
        sessionStorage.setItem("fx-brand", "1");
        first.style.display = "inline-block";
        animeAnimate(first, { scale: [0.3, 1], rotate: [-25, 0], duration: 900, ease: "outElastic(1, .55)" });
        animeAnimate(".site-header .brand-tag", { opacity: [0, 1], translateX: [-8, 0], duration: 600, delay: 250, ease: "outExpo" });
      }
    } catch {}

    // 3) 빛 따라다니기 + 4) 자석 단추 — 마우스가 있는 컴퓨터에서만
    const finePointer = window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;
    if (finePointer) {
      let lastSpot = null;
      const onMove = (e) => {
        const t = e.target instanceof Element ? e.target : null;
        const spot = t?.closest(SPOT_SELECTORS);
        if (lastSpot && lastSpot !== spot) lastSpot.classList.remove("fx-hot");
        if (spot) {
          const r = spot.getBoundingClientRect();
          spot.style.setProperty("--mx", `${e.clientX - r.left}px`);
          spot.style.setProperty("--my", `${e.clientY - r.top}px`);
          spot.classList.add("fx-hot");
        }
        lastSpot = spot;

        const mag = t?.closest(MAGNET_SELECTORS);
        if (mag) {
          const r = mag.getBoundingClientRect();
          const dx = (e.clientX - (r.left + r.width / 2)) * 0.18;
          const dy = (e.clientY - (r.top + r.height / 2)) * 0.25;
          animate(mag, { x: dx, y: dy }, { type: "spring", stiffness: 300, damping: 18 });
          if (!mag.dataset.fxMag) {
            mag.dataset.fxMag = "1";
            mag.addEventListener(
              "pointerleave",
              () => {
                animate(mag, { x: 0, y: 0 }, { type: "spring", stiffness: 260, damping: 14 });
              },
              { passive: true }
            );
          }
        }
      };
      document.addEventListener("pointermove", onMove, { passive: true });
      cleanups.push(() => document.removeEventListener("pointermove", onMove));
    }

    // 5) 누른 자리 물결 — 단추·종목·속보 줄을 누르면 그 자리에서 동그란 물결이 퍼짐 (Motion)
    const onDown = (e) => {
      const t = e.target instanceof Element ? e.target : null;
      if (!t?.closest("button, a, [role='button']")) return;
      const dot = document.createElement("span");
      dot.className = "fx-ripple";
      dot.setAttribute("aria-hidden", "true");
      dot.style.left = `${e.clientX}px`;
      dot.style.top = `${e.clientY}px`;
      document.body.appendChild(dot);
      animate(dot, { scale: [0, 1], opacity: [0.45, 0] }, { duration: 0.6, ease: "easeOut" }).then(() => dot.remove());
    };
    document.addEventListener("pointerdown", onDown, { passive: true });
    cleanups.push(() => document.removeEventListener("pointerdown", onDown));

    return () => cleanups.forEach((f) => f());
  }, []);

  // ── 페이지마다: 스크롤 등장, 새 속보 들어오기, 지도 레이더 ──────────────────────
  useEffect(() => {
    if (reduced()) return undefined;
    const seen = new WeakSet();
    const stops = [];
    let groupQueue = [];
    let groupTimer = 0;

    // 화면에 들어오는 순간 여러 개가 동시에 들어오면 차례로(0.06초 간격) 떠오르게
    const flushGroup = () => {
      const els = groupQueue;
      groupQueue = [];
      els.forEach((el, i) => {
        animate(el, { opacity: [0, 1], y: [22, 0], filter: ["blur(4px)", "blur(0px)"] }, { duration: 0.6, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }).then(() => {
          el.classList.remove("fx-pre");
          el.style.removeProperty("opacity");
          el.style.removeProperty("transform");
          el.style.removeProperty("filter");
        });
      });
    };

    const prepare = (el) => {
      if (seen.has(el)) return;
      seen.add(el);
      const r = el.getBoundingClientRect();
      // 이미 보이는 자리(첫 화면)면 건드리지 않음 — 깜빡임 방지
      if (r.top < window.innerHeight * 0.92 || r.height === 0) return;
      el.classList.add("fx-pre");
      const stop = inView(
        el,
        () => {
          groupQueue.push(el);
          clearTimeout(groupTimer);
          groupTimer = setTimeout(flushGroup, 16);
        },
        { margin: "0px 0px -8% 0px" }
      );
      stops.push(stop);
    };

    const scan = () => {
      try {
        document.querySelectorAll(REVEAL_SELECTORS).forEach(prepare);
      } catch {}
    };

    // 새 속보(빨갛게 번쩍이는 줄)가 위에 끼어들 때 — 왼쪽에서 탄력 있게 미끄러져 들어옴
    const arrive = (node) => {
      if (!(node instanceof Element)) return;
      const targets = node.matches?.(".nb-arrive, .mf-new") ? [node] : [...node.querySelectorAll?.(".nb-arrive, .mf-new") || []];
      targets.forEach((el) => {
        if (el.dataset.fxArrived) return;
        el.dataset.fxArrived = "1";
        animate(el, { opacity: [0, 1], x: [-28, 0], scale: [0.98, 1] }, { type: "spring", stiffness: 240, damping: 22 }).then(() => {
          el.style.removeProperty("opacity");
          el.style.removeProperty("transform");
        });
      });
    };

    // 처음엔 화면이 다 그려진 뒤 한 번 훑고, 이후 바뀌는 부분만 다시 훑음
    const t0 = setTimeout(scan, 60);
    let pending = 0;
    const mo = new MutationObserver((list) => {
      list.forEach((m) => m.addedNodes.forEach(arrive));
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(scan);
    });
    mo.observe(document.body, { childList: true, subtree: true });

    // 세계지도 시장 위치 점 — 레이더처럼 동그라미가 퍼져 나감 (Anime.js)
    let radar = null;
    const t1 = setTimeout(() => {
      try {
        const rings = document.querySelectorAll(".brief-pins g > circle:first-child");
        if (rings.length) {
          radar = animeAnimate(rings, {
            r: [6, 30],
            opacity: [0.45, 0],
            duration: 2400,
            delay: stagger(220),
            loop: true,
            ease: "outQuad",
          });
        }
      } catch {}
    }, 400);

    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
      clearTimeout(groupTimer);
      cancelAnimationFrame(pending);
      mo.disconnect();
      stops.forEach((s) => s?.());
      try {
        radar?.revert?.();
      } catch {}
      document.querySelectorAll(".fx-pre").forEach((el) => el.classList.remove("fx-pre"));
    };
  }, [pathname]);

  return null;
}
