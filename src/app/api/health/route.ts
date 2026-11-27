// 배포 후 스모크 테스트용 (GitHub Actions 가 이 주소로 살아 있는지 확인)
export function GET(): Response {
  return Response.json({ ok: true })
}
