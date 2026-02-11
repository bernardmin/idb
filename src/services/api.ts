import { Bid, UserSettings, PlanReviewRequest, PlanReviewResponse } from '../types';

// Vercel 배포 시 자동으로 같은 도메인 사용, 로컬에서는 프록시 사용
const getApiBaseUrl = () => {
  // 브라우저 환경
  if (typeof window !== 'undefined') {
    // 프로덕션 환경 (Vercel 배포 시)
    if (import.meta.env.PROD) {
      // 같은 도메인 사용 (Vercel에서 자동으로 /api로 라우팅됨)
      return window.location.origin;
    }
    // 개발 환경: Vite 프록시 사용 (빈 문자열 = 상대 경로)
    return '';
  }
  // 서버 사이드 렌더링 환경 (사용되지 않지만 안전을 위해)
  return '';
};

const API_BASE_URL = getApiBaseUrl();

/**
 * 서버 상태 확인
 */
export async function checkServerHealth(): Promise<{ status: string; message: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/health`, {
      signal: AbortSignal.timeout(3000), // 3초 타임아웃
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    return { status: 'ok', message: data.message || '서버가 정상적으로 실행 중입니다.' };
  } catch (error: unknown) {
    return { 
      status: 'error', 
      message: '백엔드 서버에 연결할 수 없습니다. 서버를 실행해주세요: npm run server'
    };
  }
}

/**
 * 공고 목록 조회
 */
export async function fetchBids(startDate?: string, endDate?: string): Promise<Bid[]> {
  try {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    
    const response = await fetch(`${API_BASE_URL}/api/bids?${params.toString()}`, {
      signal: AbortSignal.timeout(5000), // 5초 타임아웃
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: 공고 조회 실패`);
    }
    const data = await response.json();
    // 실제 데이터인지 확인 (Mock 데이터는 반환하지 않음)
    if (Array.isArray(data) && data.length > 0) {
      // Mock 데이터는 보통 특정 패턴을 가지고 있음 - 실제 데이터인지 확인
      const isMockData = data.some((bid: Bid) => bid.id.includes('Mock') || bid.link.includes('Mock'));
      if (isMockData) {
        console.warn('Mock 데이터가 감지되었습니다. 백엔드 서버를 확인하세요.');
        return [];
      }
    }
    return data;
  } catch (error: unknown) {
    console.error('공고 조회 오류:', error);
    // 백엔드 서버가 없을 때는 Mock 데이터 반환 (개발 편의성)
    if (error instanceof Error && (error.name === 'AbortError' || error.message?.includes('fetch'))) {
      console.warn('백엔드 서버에 연결할 수 없습니다. Mock 데이터를 사용합니다.');
      const { MOCK_BIDS } = await import('../constants');
      let filtered = [...MOCK_BIDS];
      if (startDate) filtered = filtered.filter(bid => bid.date >= startDate);
      if (endDate) filtered = filtered.filter(bid => bid.date <= endDate);
      return filtered;
    }
    return [];
  }
}

/**
 * 통계 조회
 */
export async function fetchStats() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/stats`, {
      signal: AbortSignal.timeout(5000), // 5초 타임아웃
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: 통계 조회 실패`);
    }
    return await response.json();
  } catch (error: unknown) {
    console.error('통계 조회 오류:', error);
    // 백엔드 서버가 없을 때는 Mock 데이터 기반 통계 반환
    if (error instanceof Error && (error.name === 'AbortError' || error.message?.includes('fetch'))) {
      console.warn('백엔드 서버에 연결할 수 없습니다. Mock 데이터를 사용합니다.');
      const { MOCK_BIDS, INITIAL_SETTINGS } = await import('../constants');
      const today = new Date().toISOString().split('T')[0];
      const todayBids = MOCK_BIDS.filter(bid => bid.date === today);
      const urgentBids = MOCK_BIDS.filter(bid => bid.status === 'Urgent');
      return {
        todayNew: todayBids.length,
        total: MOCK_BIDS.length,
        urgent: urgentBids.length,
        open: MOCK_BIDS.filter(bid => bid.status === 'Open').length,
        keywordsCount: INITIAL_SETTINGS.keywords.length,
      };
    }
    return {
      todayNew: 0,
      total: 0,
      urgent: 0,
      open: 0,
      keywordsCount: 0,
    };
  }
}

/**
 * 설정 조회
 */
export async function fetchSettings(): Promise<UserSettings> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/settings`);
    if (!response.ok) {
      throw new Error('설정 조회 실패');
    }
    return await response.json();
  } catch (error) {
    console.error('설정 조회 오류:', error);
    // 기본 설정 반환
    const { INITIAL_SETTINGS } = await import('../constants');
    return INITIAL_SETTINGS;
  }
}

/**
 * 설정 저장
 */
export async function saveSettings(settings: UserSettings): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(settings),
    });
    
    if (!response.ok) {
      throw new Error('설정 저장 실패');
    }
  } catch (error) {
    console.error('설정 저장 오류:', error);
    throw error;
  }
}

/**
 * 사업계획서 전문가 검토 요청
 */
export async function submitPlanReview(request: PlanReviewRequest): Promise<PlanReviewResponse> {
  const response = await fetch(`${API_BASE_URL}/api/plan-review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(120000), // 120초 타임아웃 (6명 병렬 AI 호출)
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `검토 요청 실패 (HTTP ${response.status})`);
  }
  return response.json();
}

/**
 * 수동 스크래핑 실행
 */
export async function checkNewBids() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/scrape`, {
      method: 'POST',
      signal: AbortSignal.timeout(60000), // 60초 타임아웃 (스크래핑은 시간이 걸릴 수 있음)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: 스크래핑 실패`);
    }
    
    return await response.json();
  } catch (error: unknown) {
    console.error('스크래핑 오류:', error);
    // 백엔드 서버가 없을 때는 오류 반환
    if (error instanceof Error && (error.name === 'AbortError' || error.message?.includes('fetch'))) {
      throw new Error('백엔드 서버에 연결할 수 없습니다. 백엔드 서버를 실행해주세요: npm run server');
    }
    throw error;
  }
}
