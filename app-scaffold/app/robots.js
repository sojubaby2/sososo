// app/robots.js
//
// [2026-10-01 추가] 이 파일 하나가 https://newsmeme.co.kr/robots.txt 주소를
// 만들어 줍니다. 따로 robots.txt 파일을 만들 필요 없이, Next.js가 이 함수의
// 반환값을 보고 알아서 생성합니다.
//
// 왜 필요한가: robots.txt는 검색엔진(구글·네이버 등)이 사이트에 들어왔을 때
// 가장 먼저 읽는 안내문입니다. "이 사이트는 긁어가도 됩니다", "이 주소들은
// 긁지 마세요", "목차는 여기 있습니다" 세 가지를 알려줍니다. 2026-10-01
// 확인 당시 이 사이트에는 robots.txt도 sitemap.xml도 없어서, 검색엔진이
// 칼럼 88편을 스스로 하나씩 찾아다녀야 하는 상태였습니다.
//
// 중요 — 광고(애드센스) 심사와의 관계:
// 아래 규칙은 모든 크롤러에게 사이트 전체를 열어줍니다(allow: "/"). 구글
// 애드센스 심사용 크롤러(Mediapartners-Google)도 여기에 포함되므로 심사에
// 지장이 없습니다. 혹시 나중에 누가 "검색엔진 차단"을 넣으면 광고 심사까지
// 같이 막히니 주의해야 합니다.

const SITE_URL = "https://newsmeme.co.kr";

export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // 아래는 방문자에게 보여줄 내용이 아니라 검색 결과에 뜨면 곤란한
        // 주소들입니다.
        //  · /api/   = 데이터를 주고받는 통로(사람이 읽을 페이지가 아님)
        //  · /admin  = 관리용 화면
        //  · /health = 사이트 상태 점검 화면(내부용)
        disallow: ["/api/", "/admin", "/health"],
      },
    ],
    // 목차(사이트맵)가 어디 있는지 알려줍니다 — 아래 app/sitemap.js가 만듭니다.
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
