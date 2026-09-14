// lib/allBlogPosts.js
//
// [2026-09-14 추가] 칼럼 글 목록을 한곳으로 모아주는 파일.
//
// 예전에는 화면(app/blog)이 lib/blogPosts.js를 직접 읽었는데, 그 파일이
// 이미 128KB라 글을 계속 추가하기가 부담스러웠습니다. 그래서 새로 쓴
// "현대편" 10편은 lib/blogPostsModern.js에 따로 두고, 화면은 이 파일이
// 합쳐준 목록만 보도록 했습니다.
//
// 앞으로 글을 더 추가할 때는 두 파일 중 아무 데나 넣어도 됩니다 — 목록
// 정렬(최신순)과 주소(/blog/슬러그)는 app/blog 쪽에서 알아서 처리하므로
// 여기서 순서를 맞출 필요는 없습니다. 다만 slug는 전체에서 겹치면 안 됩니다
// (겹치면 /blog/슬러그 주소가 어느 글을 가리키는지 알 수 없게 됩니다).
//
// 새 글을 추가한 뒤에는 components/BlogThumbnail.js의 THUMBNAILS 목록에도
// 그 slug를 넣어주세요. 안 넣으면 기본 아이콘이 붙습니다(동작은 정상).

import { blogPosts as classicBlogPosts } from "./blogPosts";
import { modernBlogPosts } from "./blogPostsModern";

export const blogPosts = [...classicBlogPosts, ...modernBlogPosts];
