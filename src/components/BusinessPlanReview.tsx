import React, { useState, useRef } from 'react';
import {
  Upload,
  FileText,
  RefreshCw,
  Download,
  CheckCircle,
  AlertCircle,
  Star,
  ChevronDown,
  ChevronUp,
  Users,
  Loader2,
  ClipboardList,
} from 'lucide-react';
import type { PlanReviewResponse, ReviewerResult, ReviewerRole } from '../types';
import { submitPlanReview } from '../services/api';

// 검토자별 색상 및 아이콘 설정
const REVIEWER_META: Record<ReviewerRole, { color: string; bgColor: string; borderColor: string; emoji: string }> = {
  planner:     { color: 'text-violet-700',  bgColor: 'bg-violet-50',  borderColor: 'border-violet-300', emoji: '📋' },
  sales:       { color: 'text-blue-700',    bgColor: 'bg-blue-50',    borderColor: 'border-blue-300',   emoji: '💼' },
  marketing:   { color: 'text-pink-700',    bgColor: 'bg-pink-50',    borderColor: 'border-pink-300',   emoji: '📣' },
  strategy:    { color: 'text-emerald-700', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-300',emoji: '♟️' },
  partnership: { color: 'text-orange-700',  bgColor: 'bg-orange-50',  borderColor: 'border-orange-300', emoji: '🤝' },
  hr:          { color: 'text-teal-700',    bgColor: 'bg-teal-50',    borderColor: 'border-teal-300',   emoji: '👥' },
};

// HTML 보고서 생성
function generateReportHTML(data: PlanReviewResponse): string {
  const reviewerSections = data.reviewers
    .map((r) => {
      const meta = REVIEWER_META[r.role];
      return `
    <div class="reviewer-card">
      <div class="reviewer-header">
        <span class="reviewer-emoji">${meta.emoji}</span>
        <h2>${r.name} 검토 의견</h2>
        <span class="score">점수: ${r.score}/10</span>
      </div>
      <div class="section">
        <h3>핵심 평가</h3>
        <p>${r.summary}</p>
      </div>
      <div class="section two-col">
        <div>
          <h3>강점</h3>
          <ul>${r.strengths.map((s) => `<li>${s}</li>`).join('')}</ul>
        </div>
        <div>
          <h3>개선 사항</h3>
          <ul>${r.improvements.map((s) => `<li>${s}</li>`).join('')}</ul>
        </div>
      </div>
      <div class="section">
        <h3>구체적 제안</h3>
        <ul>${r.recommendations.map((s) => `<li>${s}</li>`).join('')}</ul>
      </div>
      <div class="section enhanced">
        <h3>보완 작성 내용</h3>
        <p>${r.enhancedSection.replace(/\n/g, '<br/>')}</p>
      </div>
    </div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${data.planTitle} - 검토 보고서</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Malgun Gothic', sans-serif; color: #1e293b; background: #f8fafc; padding: 40px; line-height: 1.7; }
    h1 { font-size: 26px; color: #0f172a; margin-bottom: 6px; }
    .meta { color: #64748b; font-size: 13px; margin-bottom: 32px; }
    .summary-card { background: #1e3a5f; color: white; border-radius: 12px; padding: 28px; margin-bottom: 36px; }
    .summary-card h2 { font-size: 16px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.7; margin-bottom: 12px; }
    .summary-card p { font-size: 15px; line-height: 1.8; }
    .overall-score { display: inline-block; background: rgba(255,255,255,0.15); border-radius: 8px; padding: 8px 20px; margin-top: 16px; font-size: 20px; font-weight: bold; }
    .reviewer-card { background: white; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 28px; overflow: hidden; page-break-inside: avoid; }
    .reviewer-header { display: flex; align-items: center; gap: 12px; padding: 18px 24px; background: #f1f5f9; border-bottom: 1px solid #e2e8f0; }
    .reviewer-emoji { font-size: 24px; }
    .reviewer-header h2 { font-size: 18px; flex: 1; }
    .score { background: #0f172a; color: white; border-radius: 20px; padding: 4px 14px; font-size: 13px; font-weight: bold; }
    .section { padding: 20px 24px; border-bottom: 1px solid #f1f5f9; }
    .section:last-child { border-bottom: none; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    h3 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin-bottom: 10px; }
    p { font-size: 14px; color: #334155; }
    ul { padding-left: 18px; }
    li { font-size: 14px; color: #334155; margin-bottom: 4px; }
    .enhanced { background: #f8fafc; }
    .enhanced p { color: #1e293b; white-space: pre-wrap; }
    @media print { body { padding: 20px; } .reviewer-card { break-inside: avoid; } }
  </style>
</head>
<body>
  <h1>${data.planTitle} - 전문가 검토 보고서</h1>
  <p class="meta">검토 일시: ${new Date(data.reviewedAt).toLocaleString('ko-KR')} | 검토자 수: ${data.reviewers.length}명</p>

  <div class="summary-card">
    <h2>종합 경영진 요약</h2>
    <p>${data.executiveSummary}</p>
    <div class="overall-score">종합 점수: ${data.overallScore}/10</div>
  </div>

  ${reviewerSections}

  <div style="margin-top:40px; padding: 20px; background:#f1f5f9; border-radius:8px; font-size:13px; color:#64748b;">
    본 보고서는 AI 기반 다중 검토자 시스템에 의해 자동 생성되었습니다.
  </div>
</body>
</html>`;
}

// 점수 색상
function scoreColor(score: number): string {
  if (score >= 8) return 'text-emerald-600';
  if (score >= 6) return 'text-blue-600';
  if (score >= 4) return 'text-amber-600';
  return 'text-red-600';
}

// 별점 렌더링
function ScoreStars({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`w-4 h-4 ${i <= Math.round(score / 2) ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}`}
        />
      ))}
      <span className={`ml-1 font-bold text-sm ${scoreColor(score)}`}>{score}/10</span>
    </div>
  );
}

// 개별 검토자 카드
function ReviewerCard({ result }: { result: ReviewerResult }) {
  const [expanded, setExpanded] = useState(false);
  const meta = REVIEWER_META[result.role];

  return (
    <div className={`rounded-xl border-2 ${meta.borderColor} ${meta.bgColor} overflow-hidden transition-all`}>
      <button
        className="w-full flex items-center justify-between p-5 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">{meta.emoji}</span>
          <div>
            <p className={`font-bold text-base ${meta.color}`}>{result.name}</p>
            <ScoreStars score={result.score} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-slate-600 max-w-xs hidden lg:block truncate">{result.summary}</p>
          {expanded ? <ChevronUp className="w-5 h-5 text-slate-400 flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />}
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-white/60">
          <p className="text-sm text-slate-700 pt-4">{result.summary}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white/70 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                <span className="font-semibold text-sm text-emerald-700">강점</span>
              </div>
              <ul className="space-y-1">
                {result.strengths.map((s, i) => (
                  <li key={i} className="text-sm text-slate-600 flex items-start gap-1">
                    <span className="text-emerald-400 mt-0.5">•</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-white/70 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-amber-500" />
                <span className="font-semibold text-sm text-amber-700">개선 사항</span>
              </div>
              <ul className="space-y-1">
                {result.improvements.map((s, i) => (
                  <li key={i} className="text-sm text-slate-600 flex items-start gap-1">
                    <span className="text-amber-400 mt-0.5">•</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="bg-white/70 rounded-lg p-4">
            <p className="font-semibold text-sm text-slate-700 mb-2">구체적 제안</p>
            <ul className="space-y-1">
              {result.recommendations.map((s, i) => (
                <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                  <span className={`font-bold ${meta.color} flex-shrink-0`}>{i + 1}.</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-white rounded-lg p-4 border border-slate-200">
            <p className="font-semibold text-sm text-slate-700 mb-2">보완 작성 내용</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
              {result.enhancedSection}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// 로딩 상태 표시
function ReviewingProgress() {
  const steps = ['기획자', '영업', '마케팅', '사업전략', '파트너십', '인사'];
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
      <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
      <h3 className="text-lg font-bold text-slate-800 mb-2">전문가 팀이 검토 중입니다</h3>
      <p className="text-sm text-slate-500 mb-6">AI 기반 6명의 전문가가 사업계획서를 동시에 분석하고 있습니다.</p>
      <div className="flex flex-wrap justify-center gap-2">
        {steps.map((name, i) => (
          <div key={i} className="flex items-center gap-2 bg-blue-50 rounded-full px-4 py-2">
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
            <span className="text-sm font-medium text-blue-700">{name}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400 mt-6">분석에는 30~60초가 소요됩니다. 잠시 기다려 주세요.</p>
    </div>
  );
}

const BusinessPlanReview: React.FC = () => {
  const [planTitle, setPlanTitle] = useState('');
  const [planContent, setPlanContent] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewResult, setReviewResult] = useState<PlanReviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setPlanContent(text);
      if (!planTitle) setPlanTitle(file.name.replace(/\.[^/.]+$/, ''));
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleSubmit = async () => {
    if (!planContent.trim() || planContent.trim().length < 50) {
      setError('사업계획서 내용이 너무 짧습니다. 최소 50자 이상 입력하세요.');
      return;
    }
    setError(null);
    setIsReviewing(true);
    setReviewResult(null);
    try {
      const result = await submitPlanReview({ content: planContent, planTitle: planTitle || undefined });
      setReviewResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '검토 중 오류가 발생했습니다.');
    } finally {
      setIsReviewing(false);
    }
  };

  const handleDownload = () => {
    if (!reviewResult) return;
    const html = generateReportHTML(reviewResult);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reviewResult.planTitle}_검토보고서_${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setReviewResult(null);
    setError(null);
    setPlanContent('');
    setPlanTitle('');
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <ClipboardList className="w-7 h-7 text-blue-600" />
            <h1 className="text-2xl font-bold text-slate-900">사업계획서 전문가 검토</h1>
          </div>
          <p className="text-slate-500 text-sm">
            AI 기반 6개 부서 전문가가 사업계획서를 자동으로 검토하고 보완합니다.
          </p>
        </div>
        {reviewResult && (
          <div className="flex gap-2">
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 text-sm font-medium"
            >
              <RefreshCw className="w-4 h-4" />
              새로 검토
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              보고서 다운로드
            </button>
          </div>
        )}
      </div>

      {/* 검토자 팀 소개 */}
      {!reviewResult && !isReviewing && (
        <div className="bg-slate-800 rounded-2xl p-6 text-white">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-blue-400" />
            <span className="font-semibold">전문가 검토팀 구성</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {(Object.entries(REVIEWER_META) as [ReviewerRole, typeof REVIEWER_META[ReviewerRole]][]).map(([role, meta]) => (
              <div key={role} className="bg-slate-700/60 rounded-xl p-3 text-center">
                <div className="text-2xl mb-1">{meta.emoji}</div>
                <p className="text-xs font-semibold text-slate-200">
                  {role === 'planner' && '기획자'}
                  {role === 'sales' && '영업'}
                  {role === 'marketing' && '마케팅'}
                  {role === 'strategy' && '사업전략'}
                  {role === 'partnership' && '파트너십'}
                  {role === 'hr' && '인사'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 입력 폼 */}
      {!reviewResult && !isReviewing && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">사업계획서 제목</label>
            <input
              type="text"
              value={planTitle}
              onChange={(e) => setPlanTitle(e.target.value)}
              placeholder="예: 2025년 AI 솔루션 사업계획서"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-semibold text-slate-700">사업계획서 내용</label>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                <Upload className="w-3.5 h-3.5" />
                파일 업로드 (.txt)
              </button>
            </div>
            <input ref={fileInputRef} type="file" accept=".txt,.md" className="hidden" onChange={handleFileUpload} />
            <textarea
              value={planContent}
              onChange={(e) => setPlanContent(e.target.value)}
              placeholder="사업계획서 내용을 여기에 붙여넣거나 직접 작성하세요.

예시:
1. 사업 개요
   - 회사명: ...
   - 사업 목적: ...

2. 시장 분석
   - 목표 시장: ...
   ...

또는 .txt 파일을 업로드하세요."
              rows={14}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono resize-none"
            />
            <p className="text-xs text-slate-400 mt-1">{planContent.length}자 입력됨 (최소 50자)</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={planContent.trim().length < 50}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <FileText className="w-5 h-5" />
            6개 부서 전문가 검토 시작
          </button>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-700">
            <strong>참고:</strong> 검토에는 30~60초가 소요됩니다. 서버에 ANTHROPIC_API_KEY 환경 변수가 설정되어 있어야 합니다.
          </div>
        </div>
      )}

      {/* 검토 진행 중 */}
      {isReviewing && <ReviewingProgress />}

      {/* 검토 결과 */}
      {reviewResult && (
        <div className="space-y-5">
          {/* 종합 요약 카드 */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 text-white">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-xs text-slate-400 uppercase tracking-widest mb-2">종합 경영진 요약</p>
                <p className="text-sm leading-relaxed text-slate-200">{reviewResult.executiveSummary}</p>
              </div>
              <div className="ml-6 text-center flex-shrink-0">
                <p className="text-xs text-slate-400 mb-1">종합 점수</p>
                <p className="text-4xl font-bold text-white">{reviewResult.overallScore}</p>
                <p className="text-xs text-slate-400">/ 10</p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-700 flex items-center justify-between text-xs text-slate-400">
              <span>검토 완료: {new Date(reviewResult.reviewedAt).toLocaleString('ko-KR')}</span>
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 font-medium"
              >
                <Download className="w-3.5 h-3.5" />
                HTML 보고서 다운로드
              </button>
            </div>
          </div>

          {/* 검토자별 점수 요약 */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {reviewResult.reviewers.map((r) => {
              const meta = REVIEWER_META[r.role];
              return (
                <div key={r.role} className={`${meta.bgColor} border ${meta.borderColor} rounded-xl p-3 text-center`}>
                  <div className="text-xl mb-1">{meta.emoji}</div>
                  <p className={`text-xs font-semibold ${meta.color}`}>{r.name}</p>
                  <p className={`text-lg font-bold mt-1 ${scoreColor(r.score)}`}>{r.score}/10</p>
                </div>
              );
            })}
          </div>

          {/* 개별 검토자 상세 */}
          <div className="space-y-3">
            <h2 className="text-base font-bold text-slate-700 flex items-center gap-2">
              <Users className="w-4 h-4" />
              부서별 상세 검토 의견 (클릭하여 펼치기)
            </h2>
            {reviewResult.reviewers.map((r) => (
              <ReviewerCard key={r.role} result={r} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default BusinessPlanReview;
