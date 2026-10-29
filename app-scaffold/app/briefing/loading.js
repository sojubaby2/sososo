// [2026-10-29 신설] 이 화면을 여는 동안 바로 보여 줄 "불러오는 중" 화면 — 설명은 components/PageSkeleton.js
import PageSkeleton from "../../components/PageSkeleton";

export default function Loading() {
  return <PageSkeleton title="장전 브리핑" />;
}
