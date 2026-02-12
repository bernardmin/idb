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
  summary: string;
  strengths: string[];
  improvements: string[];
  recommendations: string[];
  enhancedSection: string;
  score: number;
}

export interface PlanReviewRequest {
  content: string;
  planTitle?: string;
}

export interface PlanReviewResponse {
  planTitle: string;
  reviewedAt: string;
  originalContent: string;
  reviewers: ReviewerResult[];
  executiveSummary: string;
  overallScore: number;
}
