import { useState } from 'react';
import {
  FileText, Send, ChevronDown, ChevronUp, Star,
  AlertCircle, CheckCircle, Lightbulb, TrendingUp,
  Users, Target, BarChart3, Handshake, Brain, Loader2,
  Download, RotateCcw, Sparkles
} from 'lucide-react';
import type { PlanReviewResponse, ReviewerResult, ReviewerConfig, ReviewerRole } from './types';

const REVIEWER_CONFIGS: ReviewerConfig[] = [
  { id: 'planner',     name: '사업기획 전문가',  emoji: '🧠', description: '사업 타당성 및 구조 분석',  color: '#3b82f6' },
  { id: 'sales',       name: '영업 전문가',       emoji: '💼', description: '시장 침투 및 수익 전략',    color: '#10b981' },
  { id: 'marketing',   name: '마케팅 전문가',     emoji: '📣', description: '브랜드 및 고객 획득 전략', color: '#f59e0b' },
  { id: 'strategy',    name: '경영전략 전문가',   emoji: '♟️', description: '경쟁 우위 및 성장 전략',   color: '#8b5cf6' },
  { id: 'partnership', name: '파트너십 전문가',   emoji: '🤝', description: '생태계 구축 및 협력 전략', color: '#ec4899' },
  { id: 'hr',          name: '인사조직 전문가',   emoji: '👥', description: '조직 설계 및 인재 전략',   color: '#14b8a6' },
];

type Screen = 'landing' | 'reviewing' | 'results';

function ScoreRing({ score, color, size = 80 }: { score: number; color: string; size?: number }) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 10) * circumference;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#1e293b" strokeWidth="6" />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference - progress}
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-white font-bold" style={{ fontSize: size * 0.22 }}>{score.toFixed(1)}</span>
      </div>
    </div>
  );
}

function ReviewerCard({ reviewer }: { reviewer: ReviewerResult }) {
  const [expanded, setExpanded] = useState(false);
  const config = REVIEWER_CONFIGS.find(c => c.id === reviewer.role as ReviewerRole);
  const color = config?.color ?? '#3b82f6';

  return (
    <div className="glass-card overflow-hidden transition-all duration-300">
      {/* Header */}
      <div
        className="p-5 flex items-center gap-4 cursor-pointer hover:bg-[#1e293b]/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
          style={{ backgroundColor: `${color}20`, border: `1px solid ${color}40` }}>
          {config?.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-white text-sm">{reviewer.name}</h3>
            <span className="text-xs text-slate-500">{config?.description}</span>
          </div>
          <p className="text-slate-400 text-xs mt-0.5 truncate">{reviewer.summary}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <ScoreRing score={reviewer.score} color={color} size={52} />
          {expanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-[#1e293b] pt-4 space-y-4">
          {/* Strengths */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4" style={{ color: '#10b981' }} />
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">강점</span>
            </div>
            <ul className="space-y-1">
              {reviewer.strengths.map((s, i) => (
                <li key={i} className="text-sm text-slate-400 flex items-start gap-2">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-emerald-500 flex-shrink-0" />
                  {s}
                </li>
              ))}
            </ul>
          </div>

          {/* Improvements */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4" style={{ color: '#f59e0b' }} />
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">개선 필요</span>
            </div>
            <ul className="space-y-1">
              {reviewer.improvements.map((s, i) => (
                <li key={i} className="text-sm text-slate-400 flex items-start gap-2">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-amber-500 flex-shrink-0" />
                  {s}
                </li>
              ))}
            </ul>
          </div>

          {/* Recommendations */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="w-4 h-4" style={{ color: color }} />
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">구체적 제안</span>
            </div>
            <ul className="space-y-1">
              {reviewer.recommendations.map((s, i) => (
                <li key={i} className="text-sm text-slate-400 flex items-start gap-2">
                  <span className="mt-1.5 w-1 h-1 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  {s}
                </li>
              ))}
            </ul>
          </div>

          {/* Enhanced Section */}
          {reviewer.enhancedSection && (
            <div className="mt-3 p-4 rounded-xl" style={{ backgroundColor: `${color}10`, border: `1px solid ${color}25` }}>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4" style={{ color }} />
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color }}>AI 보완 작성</span>
              </div>
              <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{reviewer.enhancedSection}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResultsView({ result, onReset }: { result: PlanReviewResponse; onReset: () => void }) {
  const handleDownload = () => {
    const lines: string[] = [
      `# ${result.planTitle} — AI 전문가 검토 보고서`,
      `검토일시: ${new Date(result.reviewedAt).toLocaleString('ko-KR')}`,
      `종합 점수: ${result.overallScore.toFixed(1)} / 10`,
      '',
      '## 종합 요약',
      result.executiveSummary,
      '',
    ];
    result.reviewers.forEach(r => {
      const cfg = REVIEWER_CONFIGS.find(c => c.id === r.role as ReviewerRole);
      lines.push(`## ${cfg?.emoji} ${r.name} (${r.score}/10)`);
      lines.push(`**요약:** ${r.summary}`);
      lines.push('', '**강점**');
      r.strengths.forEach(s => lines.push(`- ${s}`));
      lines.push('', '**개선 필요**');
      r.improvements.forEach(s => lines.push(`- ${s}`));
      lines.push('', '**제안사항**');
      r.recommendations.forEach(s => lines.push(`- ${s}`));
      if (r.enhancedSection) {
        lines.push('', '**AI 보완 작성**');
        lines.push(r.enhancedSection);
      }
      lines.push('');
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${result.planTitle}_검토보고서.md`; a.click();
    URL.revokeObjectURL(url);
  };

  const avgScore = result.overallScore;
  const scoreColor = avgScore >= 8 ? '#10b981' : avgScore >= 6 ? '#f59e0b' : '#ef4444';

  return (
    <div className="min-h-screen bg-[#030712]">
      {/* Navbar */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-[#1e293b] bg-[#030712]/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white">PlanReview <span className="gradient-text">AI</span></span>
          </div>
          <div className="flex gap-3">
            <button onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#1e293b] text-slate-300 hover:bg-[#1e293b] text-sm transition-colors">
              <Download className="w-4 h-4" /> 보고서 다운로드
            </button>
            <button onClick={onReset}
              className="flex items-center gap-2 px-4 py-2 rounded-lg btn-primary text-sm">
              <RotateCcw className="w-4 h-4" /> 새 검토
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 pt-28 pb-20">
        {/* Overall Score Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-white mb-2">{result.planTitle}</h1>
          <p className="text-slate-500 text-sm mb-8">
            {new Date(result.reviewedAt).toLocaleString('ko-KR')} 검토 완료
          </p>
          <div className="flex justify-center mb-6">
            <ScoreRing score={avgScore} color={scoreColor} size={120} />
          </div>
          <p className="text-slate-400 text-sm">종합 점수 / 10</p>
        </div>

        {/* Executive Summary */}
        <div className="glass-card p-6 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-blue-400" />
            </div>
            <h2 className="font-semibold text-white">종합 평가 요약</h2>
          </div>
          <p className="text-slate-300 leading-relaxed">{result.executiveSummary}</p>
        </div>

        {/* Score Grid */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-8">
          {result.reviewers.map(r => {
            const cfg = REVIEWER_CONFIGS.find(c => c.id === r.role as ReviewerRole);
            return (
              <div key={r.role} className="glass-card p-3 text-center">
                <div className="text-2xl mb-1">{cfg?.emoji}</div>
                <div className="text-xs text-slate-500 mb-2 truncate">{cfg?.name.replace(' 전문가','')}</div>
                <div className="font-bold text-lg" style={{ color: cfg?.color }}>{r.score.toFixed(1)}</div>
              </div>
            );
          })}
        </div>

        {/* Reviewer Cards */}
        <h2 className="text-lg font-semibold text-white mb-4">전문가별 세부 검토</h2>
        <div className="space-y-3">
          {result.reviewers.map(r => <ReviewerCard key={r.role} reviewer={r} />)}
        </div>
      </div>
    </div>
  );
}

function ReviewingScreen({ planTitle }: { planTitle: string }) {
  return (
    <div className="min-h-screen bg-[#030712] flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <div className="relative w-20 h-20 mx-auto mb-8">
          <div className="w-20 h-20 rounded-full border-4 border-blue-900 border-t-blue-500 animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Brain className="w-8 h-8 text-blue-400 animate-pulse" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-white mb-3">
          {planTitle ? `"${planTitle}"` : '사업계획서'} 검토 중
        </h2>
        <p className="text-slate-400 mb-8">
          6명의 AI 전문가가 병렬로 분석 중입니다.<br/>
          약 1~2분 소요됩니다.
        </p>
        <div className="space-y-3">
          {REVIEWER_CONFIGS.map((cfg, i) => (
            <div key={cfg.id} className="flex items-center gap-3 glass-card px-4 py-3">
              <span className="text-lg">{cfg.emoji}</span>
              <div className="flex-1 text-left">
                <div className="text-sm font-medium text-white">{cfg.name}</div>
                <div className="text-xs text-slate-500">{cfg.description}</div>
              </div>
              <Loader2 className="w-4 h-4 text-slate-500 animate-spin"
                style={{ animationDelay: `${i * 0.2}s` }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LandingScreen({ onSubmit }: { onSubmit: (content: string, title: string) => void }) {
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (content.trim().length < 100) {
      setError('사업계획서 내용을 100자 이상 입력해주세요.');
      return;
    }
    setError('');
    onSubmit(content.trim(), title.trim());
  };

  return (
    <div className="min-h-screen bg-[#030712]">
      {/* Navbar */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-[#1e293b] bg-[#030712]/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white">PlanReview <span className="gradient-text">AI</span></span>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div className="pt-32 pb-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 text-sm font-medium mb-8">
            <Sparkles className="w-3.5 h-3.5" />
            AI 기반 멀티 전문가 검토 시스템
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold text-white mb-6 leading-tight">
            사업계획서를<br />
            <span className="gradient-text">전문가처럼</span> 검토하세요
          </h1>
          <p className="text-xl text-slate-400 mb-12 leading-relaxed max-w-2xl mx-auto">
            6개 부서 AI 전문가가 사업기획·영업·마케팅·경영전략·파트너십·인사조직 관점에서
            동시에 심층 분석하고 보완 방향을 제시합니다.
          </p>

          {/* Reviewer Icons */}
          <div className="flex flex-wrap justify-center gap-3 mb-16">
            {REVIEWER_CONFIGS.map(cfg => (
              <div key={cfg.id} className="flex items-center gap-2 px-4 py-2 rounded-full glass-card text-sm">
                <span>{cfg.emoji}</span>
                <span className="text-slate-300">{cfg.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-3xl mx-auto px-6 pb-24">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { icon: Users, label: '전문가', value: '6명' },
            { icon: Target, label: '분석 관점', value: '30+' },
            { icon: TrendingUp, label: '검토 시간', value: '~2분' },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="glass-card p-4 text-center">
              <Icon className="w-5 h-5 text-blue-400 mx-auto mb-2" />
              <div className="text-2xl font-bold text-white">{value}</div>
              <div className="text-xs text-slate-500">{label}</div>
            </div>
          ))}
        </div>

        <div className="glass-card p-8">
          <div className="flex items-center gap-3 mb-6">
            <FileText className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-white">사업계획서 입력</h2>
          </div>

          {/* Title */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-400 mb-2">
              사업 제목 <span className="text-slate-600">(선택)</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="예: AI 기반 스마트팩토리 예지보전 솔루션"
              className="w-full bg-[#0a0f1e] border border-[#1e293b] rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-colors text-sm"
            />
          </div>

          {/* Content */}
          <div className="mb-2">
            <label className="block text-sm font-medium text-slate-400 mb-2">
              사업계획서 내용 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={content}
              onChange={e => { setContent(e.target.value); if (error) setError(''); }}
              placeholder="사업계획서 전문을 붙여넣기 하세요.&#10;&#10;검토 대상: 사업 개요, 시장 분석, 경쟁사 분석, 수익 모델, 실행 계획, 팀 구성 등"
              rows={14}
              className="w-full bg-[#0a0f1e] border border-[#1e293b] rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-colors text-sm resize-none leading-relaxed"
            />
          </div>
          <div className="flex items-center justify-between mb-6">
            <span className={`text-xs ${content.length < 100 ? 'text-slate-600' : 'text-emerald-500'}`}>
              {content.length.toLocaleString()}자
              {content.length >= 100 && ' ✓'}
            </span>
            {error && (
              <span className="text-xs text-red-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {error}
              </span>
            )}
          </div>

          <button
            onClick={handleSubmit}
            disabled={content.trim().length < 100}
            className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed text-base py-4"
          >
            <Send className="w-5 h-5" />
            전문가 검토 시작
          </button>
          <p className="text-center text-xs text-slate-600 mt-3">
            최소 100자 이상 입력 필요 · 평균 소요시간 1~2분
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-[#1e293b] py-6 px-6 text-center">
        <p className="text-slate-600 text-sm">
          Powered by <span className="text-slate-400">Claude AI</span> · PlanReview AI by IDB
        </p>
      </footer>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('landing');
  const [planTitle, setPlanTitle] = useState('');
  const [result, setResult] = useState<PlanReviewResponse | null>(null);
  const [apiError, setApiError] = useState('');

  const handleSubmit = async (content: string, title: string) => {
    setPlanTitle(title || '사업계획서');
    setScreen('reviewing');
    setApiError('');
    try {
      const res = await fetch('/api/plan-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, planTitle: title }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || `오류 (HTTP ${res.status})`);
      }
      const data: PlanReviewResponse = await res.json();
      setResult(data);
      setScreen('results');
    } catch (e: unknown) {
      setApiError(e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.');
      setScreen('landing');
    }
  };

  const handleReset = () => {
    setResult(null);
    setPlanTitle('');
    setScreen('landing');
  };

  if (screen === 'reviewing') return <ReviewingScreen planTitle={planTitle} />;
  if (screen === 'results' && result) return <ResultsView result={result} onReset={handleReset} />;

  return (
    <>
      {apiError && (
        <div className="fixed top-4 right-4 z-50 bg-red-900/90 border border-red-700 rounded-xl px-5 py-4 max-w-sm shadow-xl">
          <div className="flex items-center gap-2 text-red-300 font-semibold text-sm mb-1">
            <AlertCircle className="w-4 h-4" /> 검토 실패
          </div>
          <p className="text-red-400 text-xs">{apiError}</p>
          <button onClick={() => setApiError('')} className="mt-2 text-red-500 text-xs hover:text-red-300">닫기</button>
        </div>
      )}
      <LandingScreen onSubmit={handleSubmit} />
    </>
  );
}
