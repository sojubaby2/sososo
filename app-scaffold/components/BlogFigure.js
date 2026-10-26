// components/BlogFigure.js
//
// [2026-10-26 신설] 칼럼 본문 속 사진 한 장 — 사진, 짧은 설명, 출처 한 줄.
// 출처(작가·라이선스·원본 링크)는 무료 사진을 쓰는 조건이라 빠뜨리면 안 됩니다.

export default function BlogFigure({ img }) {
  if (!img?.src) return null;
  return (
    <figure className="blog-figure">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img.src} alt={img.alt || img.caption || ""} loading="lazy" decoding="async" />
      {(img.caption || img.credit) && (
        <figcaption>
          {img.caption && <span className="blog-figure-cap">{img.caption}</span>}
          <span className="blog-figure-credit">
            {img.credit ? `${img.credit} · ` : ""}
            {img.licenseUrl ? (
              <a href={img.licenseUrl} target="_blank" rel="noopener noreferrer">
                {img.license}
              </a>
            ) : (
              img.license
            )}
            {img.page && (
              <>
                {" · "}
                <a href={img.page} target="_blank" rel="noopener noreferrer">
                  위키미디어 공용
                </a>
              </>
            )}
          </span>
        </figcaption>
      )}
    </figure>
  );
}
