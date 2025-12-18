# Vercel 서버리스 함수

이 폴더에는 Vercel 서버리스 함수가 포함되어 있습니다.

## 파일 구조

- `health.ts` - 서버 상태 확인
- `bids.ts` - 공고 목록 조회 (GET)
- `stats.ts` - 통계 조회 (GET)
- `settings.ts` - 설정 조회/저장 (GET, POST)
- `scrape.ts` - 스크래핑 실행 (POST)

## 환경 변수

Vercel 대시보드에서 다음 환경 변수를 설정해야 합니다:

- `VITE_DATA_GO_KR_API_KEY`: 나라장터 OpenAPI 키

## 로컬 테스트

로컬에서 테스트하려면 Vercel CLI를 사용하세요:

```bash
npm i -g vercel
vercel dev
```

