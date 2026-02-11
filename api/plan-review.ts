import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import type { ReviewerRole, ReviewerResult, PlanReviewResponse } from '../src/types';

const CORS_HEADERS = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

interface ReviewerConfig {
  id: ReviewerRole;
  name: string;
  systemPrompt: string;
}

const REVIEWERS: ReviewerConfig[] = [
  {
    id: 'planner',
    name: '기획자',
    systemPrompt: `당신은 10년 경력의 전문 사업기획자입니다. 사업계획서를 검토하여 전체 구조, 목표, 실행 계획의 완성도를 평가합니다.
검토 관점:
- 사업의 전체 구조와 논리적 일관성
- 핵심 목표와 KPI 명확성
- 실행 타임라인과 마일스톤
- 리스크 식별 및 대응 방안
- 필요 리소스와 예산 계획`,
  },
  {
    id: 'sales',
    name: '영업',
    systemPrompt: `당신은 B2B/B2C 영업 전략 전문가입니다. 사업계획서의 영업 전략과 수익 모델을 심층 분석합니다.
검토 관점:
- 목표 고객 세그먼트와 고객 확보 전략
- 영업 채널 및 파이프라인 설계
- 수익 모델과 매출 목표의 현실성
- 영업 프로세스 및 영업 조직
- 가격 전략과 경쟁력`,
  },
  {
    id: 'marketing',
    name: '마케팅',
    systemPrompt: `당신은 디지털 마케팅과 브랜드 전략 전문가입니다. 사업계획서의 마케팅 전략을 평가하고 보완합니다.
검토 관점:
- 시장 포지셔닝과 차별화 메시지
- 타겟 고객 페르소나 및 고객 여정
- 마케팅 채널 믹스 (디지털/오프라인)
- 브랜드 아이덴티티와 콘텐츠 전략
- 마케팅 예산 배분과 ROI 목표`,
  },
  {
    id: 'strategy',
    name: '사업전략',
    systemPrompt: `당신은 기업 전략 컨설턴트입니다. 사업의 경쟁우위와 지속 성장 전략을 분석합니다.
검토 관점:
- 시장 기회와 경쟁 환경 분석
- 비즈니스 모델의 확장성과 지속가능성
- 핵심 경쟁우위(Core Competency)
- 성장 전략 및 시장 확장 계획
- 산업 트렌드 대응 전략`,
  },
  {
    id: 'partnership',
    name: '파트너십',
    systemPrompt: `당신은 전략적 제휴 및 파트너십 전문가입니다. 사업의 파트너십 전략과 생태계 구축 방안을 검토합니다.
검토 관점:
- 전략적 파트너십 기회 발굴
- 채널 파트너 및 유통 전략
- 기술/사업 제휴 가능 기업 식별
- 파트너십 구조와 수익 배분 모델
- 생태계 구축 로드맵`,
  },
  {
    id: 'hr',
    name: '인사',
    systemPrompt: `당신은 인사/조직 전문가입니다. 사업의 조직 구조와 인재 전략을 평가하고 보완합니다.
검토 관점:
- 조직 구조와 역할 분담 체계
- 핵심 인재 채용 계획
- 역량 개발 및 교육 훈련 계획
- 보상 체계와 성과 관리
- 조직 문화와 내부 커뮤니케이션`,
  },
];

const REVIEW_PROMPT_TEMPLATE = (systemPrompt: string, planContent: string): string => `
${systemPrompt}

다음 사업계획서를 검토하고, 아래 JSON 형식으로 응답하세요. 모든 내용은 한국어로 작성하세요.

사업계획서:
---
${planContent}
---

반드시 아래 JSON 형식만 응답하세요 (다른 텍스트 없이):
{
  "summary": "핵심 평가 요약 (2-3문장)",
  "strengths": ["강점1", "강점2", "강점3"],
  "improvements": ["개선사항1", "개선사항2", "개선사항3"],
  "recommendations": ["구체적 제안1", "구체적 제안2", "구체적 제안3"],
  "enhancedSection": "당신의 전문 관점에서 사업계획서에 추가/보완한 내용을 상세히 작성하세요 (300-500자)",
  "score": 7
}
`;

async function reviewWithClaude(
  client: Anthropic,
  reviewer: ReviewerConfig,
  planContent: string,
): Promise<ReviewerResult> {
  const message = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1500,
    messages: [
      {
        role: 'user',
        content: REVIEW_PROMPT_TEMPLATE(reviewer.systemPrompt, planContent),
      },
    ],
  });

  const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

  // JSON 파싱 (마크다운 코드블록 제거 포함)
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`${reviewer.name} 검토 결과 파싱 실패`);
  }

  const parsed = JSON.parse(jsonMatch[0]);

  return {
    role: reviewer.id,
    name: reviewer.name,
    summary: parsed.summary || '',
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
    improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
    recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
    enhancedSection: parsed.enhancedSection || '',
    score: typeof parsed.score === 'number' ? Math.min(10, Math.max(1, parsed.score)) : 5,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { content, planTitle } = req.body || {};

  if (!content || typeof content !== 'string' || content.trim().length < 50) {
    res.status(400).json({ error: '사업계획서 내용이 너무 짧습니다. 최소 50자 이상 입력하세요.' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY 환경 변수가 설정되지 않았습니다.' });
    return;
  }

  const client = new Anthropic({ apiKey });

  try {
    // 6명의 검토자가 병렬로 사업계획서를 분석
    const reviewResults = await Promise.all(
      REVIEWERS.map((reviewer) => reviewWithClaude(client, reviewer, content.trim())),
    );

    // 종합 요약 생성
    const avgScore = reviewResults.reduce((sum, r) => sum + r.score, 0) / reviewResults.length;
    const allStrengths = reviewResults.flatMap((r) => r.strengths).slice(0, 5);
    const allImprovements = reviewResults.flatMap((r) => r.improvements).slice(0, 5);

    const summaryMessage = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 800,
      messages: [
        {
          role: 'user',
          content: `다음은 사업계획서에 대한 6명의 전문가 검토 요약입니다.

주요 강점: ${allStrengths.join(', ')}
주요 개선사항: ${allImprovements.join(', ')}
평균 점수: ${avgScore.toFixed(1)}/10

이를 바탕으로 경영진 보고용 종합 평가 요약을 3-4문장으로 한국어로 작성하세요.`,
        },
      ],
    });

    const executiveSummary =
      summaryMessage.content[0].type === 'text'
        ? summaryMessage.content[0].text
        : '종합 평가를 생성하지 못했습니다.';

    const response: PlanReviewResponse = {
      planTitle: planTitle || '사업계획서',
      reviewedAt: new Date().toISOString(),
      originalContent: content.trim(),
      reviewers: reviewResults,
      executiveSummary,
      overallScore: Math.round(avgScore * 10) / 10,
    };

    res.json(response);
  } catch (error) {
    console.error('사업계획서 검토 오류:', error);
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    res.status(500).json({ error: `검토 중 오류가 발생했습니다: ${message}` });
  }
}
