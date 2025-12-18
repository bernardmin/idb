import { Bid, UserSettings } from './types';

export const INITIAL_SETTINGS: UserSettings = {
  emails: ['idbyun@idb.ai', 'bkmin@idb.ai'],
  keywords: [
    '예지보전', '고장예측', '설비안전', '재난안전', '스마트품질'
  ],
  excludeKeywords: ['청소', '제초', '단순교체', '폐기물'],
  emailEnabled: true,
};

// 더 많은 Mock 데이터 생성 (최근 30일치)
// 나라장터 입찰공고번호 실제 형식:
// - G로 시작: G012506273-00 (물품)
// - R로 시작: R25BK01227587-000 (용역)
// - 기타: 다양한 접두사와 형식
const generateMockBids = (): Bid[] => {
  const bids: Bid[] = [];
  const today = new Date();
  const agencies = ['서울특별시 강남구', '한국산업단지공단', '부산교통공사', '경기도시공사', '정보통신산업진흥원', '한국전력공사', '서울시청', '인천광역시'];
  const keywords = ['영상분석', '지능형 CCTV', '선별관제', '예지보전', '이상탐지', '스마트 안전', '중대재해 시스템', 'AI 실증'];
  
  // 입찰공고번호 접두사 (업무 유형별)
  const bidPrefixes = ['G', 'R25BK', 'R25', 'G01', 'R', 'G02'];
  
  // 최근 30일간의 데이터 생성
  for (let i = 0; i < 30; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    
    // 하루에 0-3개의 공고 생성
    const count = Math.floor(Math.random() * 4);
    for (let j = 0; j < count; j++) {
      const deadline = new Date(date);
      deadline.setDate(deadline.getDate() + Math.floor(Math.random() * 20) + 5);
      const deadlineStr = deadline.toISOString().split('T')[0];
      
      const matchedKeywords = [];
      const numKeywords = Math.floor(Math.random() * 3) + 1;
      const shuffled = [...keywords].sort(() => 0.5 - Math.random());
      for (let k = 0; k < numKeywords; k++) {
        matchedKeywords.push(shuffled[k]);
      }
      
      // 마감일 기준으로 상태 결정
      const deadlineDate = new Date(deadlineStr);
      const today = new Date();
      today.setHours(0, 0, 0, 0); // 시간을 0으로 설정하여 날짜만 비교
      deadlineDate.setHours(0, 0, 0, 0);
      
      const daysUntilDeadline = Math.floor((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      let bidStatus: 'Open' | 'Closed' | 'Urgent';
      if (daysUntilDeadline < 0) {
        // 마감일이 지난 경우
        bidStatus = 'Closed';
      } else if (daysUntilDeadline <= 7) {
        // 마감일이 7일 이내인 경우
        bidStatus = 'Urgent';
      } else {
        // 마감일이 7일 이후인 경우
        bidStatus = 'Open';
      }
      
      // 나라장터 실제 입찰공고번호 형식 생성
      const prefix = bidPrefixes[Math.floor(Math.random() * bidPrefixes.length)];
      let bidNumber = '';
      
      if (prefix.startsWith('G')) {
        // G 형식: G012506273-00
        const num = String(Math.floor(Math.random() * 999999999)).padStart(9, '0');
        const suffix = String(Math.floor(Math.random() * 100)).padStart(2, '0');
        bidNumber = `${prefix}${num}-${suffix}`;
      } else if (prefix.startsWith('R25BK')) {
        // R25BK 형식: R25BK01227587-000
        const num = String(Math.floor(Math.random() * 99999999)).padStart(8, '0');
        const suffix = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
        bidNumber = `${prefix}${num}-${suffix}`;
      } else if (prefix.startsWith('R25')) {
        // R25 형식: R25XX01227587-000
        const letters = ['BK', 'IT', 'SM', 'AI', 'CV', 'DT'][Math.floor(Math.random() * 6)];
        const num = String(Math.floor(Math.random() * 99999999)).padStart(8, '0');
        const suffix = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
        bidNumber = `R25${letters}${num}-${suffix}`;
      } else {
        // 기타 형식
        const num = String(Math.floor(Math.random() * 999999999)).padStart(9, '0');
        const suffix = String(Math.floor(Math.random() * 100)).padStart(2, '0');
        bidNumber = `${prefix}${num}-${suffix}`;
      }
      
      // 나라장터 입찰공고 검색 페이지로 이동 (입찰공고번호를 검색 조건에 포함)
      // 실제로는 Mock 데이터이므로 존재하지 않는 번호입니다
      // 검색 페이지로 이동하여 사용자가 직접 검색할 수 있도록 합니다
      // 형식: https://www.g2b.go.kr/ep/co/co/co/coList.do?taskClCd=5&bidno={입찰공고번호}&searchType=1
      const g2bSearchUrl = `https://www.g2b.go.kr/ep/co/co/co/coList.do?taskClCd=5&bidno=${encodeURIComponent(bidNumber)}&searchType=1`;
      
      bids.push({
        id: bidNumber,
        title: `${matchedKeywords[0]} 관련 ${i === 0 ? '신규' : ''}입찰 공고`,
        agency: agencies[Math.floor(Math.random() * agencies.length)],
        date: dateStr,
        deadline: deadlineStr,
        status: bidStatus,
        keywordsMatched: matchedKeywords,
        link: g2bSearchUrl,
      });
    }
  }
  
  return bids.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

export const MOCK_BIDS: Bid[] = generateMockBids();

export const CHART_DATA = [
  { name: '영상분석', value: 12 },
  { name: '지능형 CCTV', value: 19 },
  { name: '예지보전', value: 8 },
  { name: '이상탐지', value: 5 },
  { name: '스마트 안전', value: 10 },
  { name: 'AI 실증', value: 7 },
];
