import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line, Legend
} from 'recharts';
import { Bell, Search, AlertCircle, CheckCircle2, RefreshCw, Info, Calendar, Filter, X } from 'lucide-react';
import { UserSettings, Bid } from '../types';
import { CHART_DATA } from '../constants';
import { fetchBids, fetchStats, checkNewBids, checkServerHealth } from '../services/api';

interface DashboardProps {
  settings: UserSettings;
}

const Dashboard: React.FC<DashboardProps> = ({ settings }) => {
  const [bids, setBids] = useState<Bid[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>(new Date().toLocaleTimeString());
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [lastRefreshTime, setLastRefreshTime] = useState<number>(0);
  const REFRESH_COOLDOWN = 10000; // 10초 (밀리초)

  // 서버 상태 확인 (10초마다)
  useEffect(() => {
    const checkServer = async () => {
      const health = await checkServerHealth();
      setServerStatus(health.status === 'ok' ? 'online' : 'offline');
    };
    
    checkServer();
    const interval = setInterval(checkServer, 10000); // 10초마다 확인
    return () => clearInterval(interval);
  }, []);

  // 초기 데이터 로드 (당일 기준으로 필터링)
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setStartDate(today);
    setEndDate(today);
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 30분마다 자동 새로고침
  useEffect(() => {
    if (!autoRefreshEnabled) return;

    const interval = setInterval(() => {
      handleRefresh(true);
    }, 30 * 60 * 1000); // 30분

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefreshEnabled]);

  const loadDataWithDate = async (start: string, end: string): Promise<number> => {
    try {
      setLoading(true);
      const [bidsData, statsData] = await Promise.all([
        fetchBids(start, end),
        fetchStats(),
      ]);
      setBids(bidsData);
      setStats(statsData);
      setLastUpdated(new Date().toLocaleTimeString());
      return bidsData.length; // 조회된 공고 개수 반환
    } catch (error) {
      console.error('데이터 로드 실패:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const loadData = async () => {
    // 기간 필터가 없으면 당일 기준으로 조회
    const today = new Date().toISOString().split('T')[0];
    const filterStartDate = startDate || today;
    const filterEndDate = endDate || today;
    await loadDataWithDate(filterStartDate, filterEndDate);
  };

  // 필터링된 공고 목록
  const filteredBids = useMemo(() => {
    return bids;
  }, [bids]);

  // 일일 현황 데이터 생성
  const dailyStats = useMemo(() => {
    const stats: { [key: string]: { date: string; count: number; urgent: number } } = {};
    
    filteredBids.forEach(bid => {
      if (!stats[bid.date]) {
        stats[bid.date] = { date: bid.date, count: 0, urgent: 0 };
      }
      stats[bid.date].count++;
      if (bid.status === 'Urgent') {
        stats[bid.date].urgent++;
      }
    });

    return Object.values(stats)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-30); // 최근 30일
  }, [filteredBids]);

  // 통계 계산
  const [stats, setStats] = useState({
    todayNew: 0,
    total: 0,
    urgent: 0,
    open: 0,
    keywordsCount: 0,
  });

  useEffect(() => {
    fetchStats().then(setStats);
  }, [filteredBids]);

  // 키워드별 통계
  const keywordStats = useMemo(() => {
    const keywordCounts: { [key: string]: number } = {};
    
    filteredBids.forEach(bid => {
      bid.keywordsMatched.forEach(keyword => {
        keywordCounts[keyword] = (keywordCounts[keyword] || 0) + 1;
      });
    });

    return settings.keywords.map(keyword => ({
      name: keyword,
      value: keywordCounts[keyword] || 0,
    })).filter(item => item.value > 0);
  }, [filteredBids, settings.keywords]);

  const handleRefresh = async (silent = false) => {
    // 쿨타임 체크
    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshTime;
    
    if (timeSinceLastRefresh < REFRESH_COOLDOWN) {
      const remainingSeconds = Math.ceil((REFRESH_COOLDOWN - timeSinceLastRefresh) / 1000);
      alert(`새로고침은 ${remainingSeconds}초 후에 가능합니다.`);
      return;
    }

    setIsRefreshing(true);
    setLastRefreshTime(now);
    
    try {
      const result = await checkNewBids();
      await loadData();
      setRefreshCount(prev => prev + 1);
      if (!silent) {
        alert(`나라장터 최신 공고 조회를 완료했습니다.\n새 공고: ${result.new}개, 전체: ${result.total}개`);
      }
    } catch (error: unknown) {
      console.error('공고 확인 실패:', error);
      if (!silent) {
        const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
        alert(`오류: ${errorMessage}\n\n백엔드 서버를 실행해주세요:\n터미널에서 "npm run server" 실행`);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const clearDateFilter = () => {
    setStartDate('');
    setEndDate('');
    loadData(); // 필터 초기화 시 전체 데이터 로드
  };

  const handlePeriodSearch = async () => {
    setIsSearching(true);
    try {
      // 기간 조회 시 선택한 기간의 데이터만 표시
      let searchStartDate = startDate;
      let searchEndDate = endDate;
      
      if (!searchStartDate && !searchEndDate) {
        // 기간이 없으면 당일 기준
        const today = new Date().toISOString().split('T')[0];
        searchStartDate = today;
        searchEndDate = today;
        setStartDate(today);
        setEndDate(today);
      } else if (searchStartDate && !searchEndDate) {
        searchEndDate = searchStartDate;
        setEndDate(searchStartDate);
      } else if (!searchStartDate && searchEndDate) {
        searchStartDate = searchEndDate;
        setStartDate(searchEndDate);
      }
      
      const resultCount = await loadDataWithDate(searchStartDate, searchEndDate);
      
      // 조회 완료 알림
      alert(`기간 조회가 완료되었습니다.\n\n기간: ${searchStartDate} ~ ${searchEndDate}\n발견된 공고: ${resultCount}개`);
    } catch (error) {
      console.error('기간 조회 실패:', error);
      alert('기간 조회 중 오류가 발생했습니다.');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      {/* 서버 상태 배너 */}
      <div className={`border-l-4 p-4 rounded-r-lg shadow-sm flex items-start ${
        serverStatus === 'online' 
          ? 'bg-green-50 border-green-400' 
          : serverStatus === 'offline'
          ? 'bg-red-50 border-red-400'
          : 'bg-yellow-50 border-yellow-400'
      }`}>
        {serverStatus === 'online' ? (
          <CheckCircle2 className="w-5 h-5 text-green-600 mr-3 mt-0.5 flex-shrink-0" />
        ) : serverStatus === 'offline' ? (
          <AlertCircle className="w-5 h-5 text-red-600 mr-3 mt-0.5 flex-shrink-0" />
        ) : (
          <Info className="w-5 h-5 text-yellow-600 mr-3 mt-0.5 flex-shrink-0" />
        )}
        <div className="flex-1">
          <h4 className={`text-sm font-bold ${
            serverStatus === 'online' ? 'text-green-800' : 
            serverStatus === 'offline' ? 'text-red-800' : 
            'text-yellow-800'
          }`}>
            {serverStatus === 'online' ? '✓ 백엔드 서버 연결됨' : 
             serverStatus === 'offline' ? '✗ 백엔드 서버 연결 안 됨' : 
             '서버 상태 확인 중...'}
          </h4>
          <p className={`text-sm mt-1 ${
            serverStatus === 'online' ? 'text-green-700' : 
            serverStatus === 'offline' ? 'text-red-700' : 
            'text-yellow-700'
          }`}>
            {serverStatus === 'online' ? (
              <>
                시스템이 <strong>30분마다</strong> 자동으로 나라장터 공고를 스크래핑합니다.
                {autoRefreshEnabled ? (
                  <span className="text-green-700 font-semibold"> 자동 새로고침 활성화됨</span>
                ) : (
                  <span className="text-amber-700 font-semibold"> 자동 새로고침 비활성화됨</span>
                )}
              </>
            ) : serverStatus === 'offline' ? (
              <>
                백엔드 서버가 실행되지 않았습니다. 서버를 실행해주세요: <code className="bg-red-100 px-1 rounded">npm run server</code>
                <br />
                현재는 Mock 데이터를 사용합니다.
              </>
            ) : (
              '서버 상태를 확인하는 중입니다...'
            )}
          </p>
        </div>
        {serverStatus === 'online' && (
          <div className="flex items-center space-x-2">
            <label className="flex items-center text-sm text-green-700">
              <input
                type="checkbox"
                checked={autoRefreshEnabled}
                onChange={(e) => setAutoRefreshEnabled(e.target.checked)}
                className="mr-2 w-4 h-4 text-green-600 border-slate-300 rounded focus:ring-green-500"
              />
              자동 새로고침
            </label>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">오늘의 새 공고</p>
            <p className="text-3xl font-bold text-slate-900">
              {stats.todayNew}
              {stats.todayNew > 0 && <span className="text-sm font-normal text-emerald-500 ml-1">+{stats.todayNew}</span>}
            </p>
          </div>
          <div className="p-3 bg-blue-50 rounded-lg"><Bell className="w-6 h-6 text-blue-600" /></div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">모니터링 키워드</p>
            <p className="text-3xl font-bold text-slate-900">{stats.keywordsCount}</p>
          </div>
          <div className="p-3 bg-indigo-50 rounded-lg"><Search className="w-6 h-6 text-indigo-600" /></div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">전체 공고</p>
            <p className="text-3xl font-bold text-slate-900">{stats.total}</p>
          </div>
          <div className="p-3 bg-emerald-50 rounded-lg"><CheckCircle2 className="w-6 h-6 text-emerald-600" /></div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">마감 임박</p>
            <p className="text-3xl font-bold text-slate-900">{stats.urgent}</p>
          </div>
          <div className="p-3 bg-amber-50 rounded-lg"><AlertCircle className="w-6 h-6 text-amber-600" /></div>
        </div>
      </div>

      {/* 기간 조회 필터 */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <Filter className="w-5 h-5 text-slate-600" />
            <h3 className="text-lg font-bold text-slate-900">기간 조회</h3>
          </div>
          {(startDate || endDate) && (
            <button
              onClick={clearDateFilter}
              className="flex items-center px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-4 h-4 mr-1" />
              필터 초기화
            </button>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2 flex-1">
            <Calendar className="w-5 h-5 text-slate-500 flex-shrink-0" />
            <div className="relative flex-1">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="시작일"
              />
            </div>
            <span className="text-slate-400 font-medium">~</span>
            <div className="relative flex-1">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handlePeriodSearch()}
                className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="종료일"
              />
            </div>
          </div>
          <button
            onClick={handlePeriodSearch}
            disabled={isSearching}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {isSearching ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>조회 중...</span>
              </>
            ) : (
              <span>조회</span>
            )}
          </button>
          <div className="text-sm text-slate-600 min-w-[80px] text-right font-medium">
            {filteredBids.length}개 공고
          </div>
        </div>
      </div>

      {/* 차트 섹션 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 키워드별 공고 현황 */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900">키워드별 공고 현황</h3>
              {(startDate || endDate) && (
                <p className="text-xs text-slate-500 mt-1">
                  기간: {startDate || '전체'} ~ {endDate || '전체'}
                </p>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-xs text-slate-400">마지막 업데이트: {lastUpdated}</span>
              <button 
                onClick={() => handleRefresh(false)} 
                disabled={isRefreshing} 
                className="p-2 text-slate-500 hover:text-blue-600 rounded-lg transition-colors"
                title="수동 새로고침"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={keywordStats.length > 0 ? keywordStats : CHART_DATA} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} angle={-45} textAnchor="end" height={80} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={40}>
                  {(keywordStats.length > 0 ? keywordStats : CHART_DATA).map((_, index) => (
                    <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#4f46e5' : '#818cf8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 일일 현황 차트 */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-slate-900">일일 공고 현황</h3>
            {(startDate || endDate) ? (
              <p className="text-xs text-slate-500 mt-1">
                기간: {startDate || '전체'} ~ {endDate || '전체'}
              </p>
            ) : (
              <p className="text-xs text-slate-500 mt-1">최근 30일</p>
            )}
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyStats} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#64748b' }} 
                  angle={-45} 
                  textAnchor="end" 
                  height={80}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return `${date.getMonth() + 1}/${date.getDate()}`;
                  }}
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip 
                  cursor={{ fill: '#f1f5f9' }}
                  labelFormatter={(value) => {
                    const date = new Date(value);
                    return date.toLocaleDateString('ko-KR');
                  }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="count" 
                  stroke="#4f46e5" 
                  strokeWidth={2} 
                  name="전체 공고"
                  dot={{ fill: '#4f46e5', r: 3 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="urgent" 
                  stroke="#f59e0b" 
                  strokeWidth={2} 
                  name="마감임박"
                  dot={{ fill: '#f59e0b', r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      
      {/* 공고 목록 테이블 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-lg font-bold text-slate-900">
            발견된 공고 목록 {startDate || endDate ? `(${filteredBids.length}개)` : ''}
          </h3>
          <div className="text-sm text-slate-500">
            {autoRefreshEnabled && `다음 자동 새로고침: 약 ${30 - (refreshCount % 2) * 15}분 후`}
          </div>
        </div>
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500 sticky top-0">
              <tr>
                <th className="px-6 py-4">상태</th>
                <th className="px-6 py-4">입찰공고 번호</th>
                <th className="px-6 py-4">공고명 / 발주처</th>
                <th className="px-6 py-4">매칭 키워드</th>
                <th className="px-6 py-4">등록일</th>
                <th className="px-6 py-4">마감일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-2"></div>
                      로딩 중...
                    </div>
                  </td>
                </tr>
              ) : filteredBids.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    {startDate || endDate 
                      ? '선택한 기간에 해당하는 공고가 없습니다.' 
                      : '아직 발견된 공고가 없습니다. 새로고침 버튼을 눌러 공고를 확인하세요.'}
                  </td>
                </tr>
              ) : (
                filteredBids.map((bid) => (
                  <tr key={bid.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        bid.status === 'Urgent' 
                          ? 'bg-amber-100 text-amber-800' 
                          : bid.status === 'Closed'
                          ? 'bg-gray-100 text-gray-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {bid.status === 'Urgent' ? '마감임박' : bid.status === 'Closed' ? '마감' : '진행중'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <a 
                        href={bid.link} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="font-mono text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                        title="나라장터 검색 페이지로 이동 (입찰공고번호가 검색 조건에 포함됨)"
                        onClick={(e) => {
                          // 새 창에서 열기 (현재 창은 유지)
                          window.open(bid.link, '_blank', 'noopener,noreferrer');
                          e.preventDefault();
                        }}
                      >
                        {bid.id}
                      </a>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-900 mb-1">{bid.title}</span>
                        <span className="text-xs text-slate-500">{bid.agency}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-2">
                        {bid.keywordsMatched.map((k) => (
                          <span key={k} className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs border border-blue-100">
                            {k}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{bid.date}</td>
                    <td className="px-6 py-4 font-medium">{bid.deadline}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
export default Dashboard;
