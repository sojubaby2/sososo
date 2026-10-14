// lib/allBlogPosts.js
//
// [2026-09-14 추가] 칼럼 글 목록을 한곳으로 모아주는 파일.
//
// 예전에는 화면(app/blog)이 lib/blogPosts.js를 직접 읽었는데, 그 파일이
// 커지면서 글을 계속 추가하기가 부담스러워졌습니다. 그래서 글 묶음을
// 여러 파일로 나누고, 화면은 이 파일이 합쳐준 목록만 보도록 했습니다.
//
// [2026-10-14 변경] 세 번째 파일(lib/blogPostsRecent.js)을 추가했습니다.
// 지금 구성은 이렇습니다.
//   · lib/blogPosts.js        — 초기 23편 (2026-10-04에 전부 다시 써서 분량을 맞춤)
//   · lib/blogPostsModern.js  — 현대·근현대편 65편
//   · lib/blogPostsRecent.js  — 최근 사건편 8편 (편당 9,500자 이상)
// 합치면 96편입니다.
//
// 앞으로 글을 더 추가할 때는 세 파일 중 아무 데나 넣어도 되고, 새 파일을
// 만들어 아래 import에 한 줄 추가해도 됩니다 — 목록 정렬(최신순)과
// 주소(/blog/슬러그)는 app/blog 쪽에서 알아서 처리하므로 여기서 순서를
// 맞출 필요는 없습니다. 사이트맵(app/sitemap.js)도 이 목록을 그대로 읽어가니
// 새 글이 검색엔진에 자동으로 등록됩니다.
//
// 다만 slug는 전체에서 겹치면 안 됩니다(겹치면 /blog/슬러그 주소가 어느
// 글을 가리키는지 알 수 없게 됩니다).
//
// 새 글을 추가한 뒤에는 components/BlogThumbnail.js의 THUMBNAILS 목록에도
// 그 slug를 넣어주세요. 안 넣으면 기본 아이콘이 붙습니다(동작은 정상).

import { blogPosts as classicBlogPosts } from "./blogPosts";
import { modernBlogPosts } from "./blogPostsModern";
import { recentBlogPosts } from "./blogPostsRecent";

export const blogPosts = [...classicBlogPosts, ...modernBlogPosts, ...recentBlogPosts];
