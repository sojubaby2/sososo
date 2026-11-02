// app/api/news/route.js
//
// [2026-10-31 사용 중지] 예전 "네이버 뉴스 검색(NAVER API HUB)" 연결 주소입니다.
// 재성님: 네이버 클라우드에서 "크레딧 유효기간 만료 예정" 메일이 와서 확인 → 사이트는 이제 텔레그램 속보로만
// 뉴스를 받고, 이 주소는 어디에서도 쓰지 않습니다. 그런데 주소가 열려 있으면 누군가 직접 불러서
// 네이버 클라우드 호출(크레딧 소진 → 이후 요금)이 생길 수 있어서, 네이버를 부르는 코드를 통째로 뺐습니다.
// 이제 이 주소를 열면 "사용 중지" 안내만 돌려주고, 바깥으로 아무 요청도 보내지 않습니다(비용 0원).

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    { error: "이 기능은 사용 중지되었습니다. (뉴스는 텔레그램 속보로 받습니다)" },
    { status: 410, headers: { "Cache-Control": "no-store" } }
  );
}
