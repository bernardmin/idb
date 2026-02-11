export interface Bid {
  id: string;
  title: string;
  agency: string;
  date: string;
  deadline: string;
  status: 'Open' | 'Closed' | 'Urgent';
  keywordsMatched: string[];
  link: string;
}

export interface UserSettings {
  emails: string[];
  keywords: string[];
  excludeKeywords: string[];
  emailEnabled: boolean;
}

export interface StatData {
  name: string;
  value: number;
}

// 사업계획서 검토 관련 타입
export type ReviewerRole =
  | 'planner'
  | 'sales'
  | 'marketing'
  | 'strategy'
  | 'partnership'
  | 'hr';

export interface ReviewerConfig {
  id: ReviewerRole;
  name: string;
  emoji: string;
  description: string;
  color: string;
}

export interface ReviewerResult {
  role: ReviewerRole;
  name: string;
  summary: string;       // 핵심 평가 요약
  strengths: string[];   // 강점
  improvements: string[]; // 개선 사항
  recommendations: string[]; // 구체적 제안
  enhancedSection: string;   // 보완 작성된 섹션
  score: number;         // 1-10 점수
}

export interface PlanReviewRequest {
  content: string;       // 사업계획서 원문
  planTitle?: string;    // 제목 (선택)
}

export interface PlanReviewResponse {
  planTitle: string;
  reviewedAt: string;
  originalContent: string;
  reviewers: ReviewerResult[];
  executiveSummary: string;  // 종합 요약
  overallScore: number;      // 전체 점수
}

