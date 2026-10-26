"use client";

// components/ThemeToggle.js
//
// [2026-10-26 신설] 어두운 화면 ↔ 밝은 화면 전환 단추 (머리띠 오른쪽).
// 재성님 요청: "지금 다크모드 같은 화면이잖아? 반대 모드도 만들어서 전환 가능하게"
//
// 동작:
//   · 누르면 <html>에 data-theme="light"를 붙이거나 뗍니다.
//     색은 전부 app/globals.css 맨 아래 ":root[data-theme="light"]"에 있습니다.
//   · 고른 화면은 이 브라우저에 기억합니다(localStorage "nm-theme").
//     다음에 와도, 다른 페이지로 가도 그대로입니다.
//   · [2026-10-26 변경] 처음 오는 사람은 밝은 화면으로 시작합니다(재성님 결정). 어두운 화면을 고른 사람은 계속 어둡게.
//   · 페이지가 뜨는 순간 화면이 깜빡이며 바뀌지 않도록, 기억된 값을 먼저 읽는
//     짧은 코드가 app/layout.js <head>에 따로 있습니다.
//   · 휴대폰 주소창 색(theme-color)도 같이 바꿉니다.
//
// 비용: 서버를 전혀 부르지 않습니다(브라우저 안에서만 바뀜).

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

const STORAGE_KEY = "nm-theme";
const BAR_COLOR = { dark: "#0b0b0d", light: "#fbfbf9" };

function currentTheme() {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "light") root.setAttribute("data-theme", "light");
  else root.removeAttribute("data-theme");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", BAR_COLOR[theme]);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // 개인정보 보호 모드 등 저장이 막힌 브라우저 — 이번 방문 동안만 바뀜
  }
}

export default function ThemeToggle() {
  // 첫 그림은 서버와 똑같이 "light"(기본)로 그리고, 화면이 뜬 직후 실제 값으로 맞춥니다.
  const [theme, setTheme] = useState("light");
  useEffect(() => {
    const t = currentTheme();
    setTheme(t);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", BAR_COLOR[t]);
  }, []);

  const next = theme === "light" ? "dark" : "light";
  const label = next === "light" ? "밝은 화면으로 바꾸기" : "어두운 화면으로 바꾸기";

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => {
        applyTheme(next);
        setTheme(next);
      }}
      aria-label={label}
      title={label}
    >
      {next === "light" ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
      <span className="theme-toggle-text">{next === "light" ? "밝게" : "어둡게"}</span>
    </button>
  );
}
