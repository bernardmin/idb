import React from 'react';
import { Server, Database, RefreshCw } from 'lucide-react';

const Guide: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-10">
      <div className="bg-blue-600 text-white p-8 rounded-2xl shadow-lg">
        <h1 className="text-3xl font-bold mb-4">시스템 사용 가이드</h1>
        <p className="text-blue-100 text-lg">나라장터(G2B) 공고를 실시간으로 모니터링하는 시스템입니다.</p>
      </div>

      {/* Backend Server Guide */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center space-x-2 mb-6">
          <Server className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-bold text-slate-900">백엔드 서버 실행</h2>
        </div>
        <div className="space-y-4 text-slate-600">
          <p>실제 나라장터 데이터를 수집하려면 백엔드 서버를 실행해야 합니다.</p>
          <div className="bg-slate-50 p-4 rounded-lg">
            <p className="text-sm font-mono text-slate-800 mb-2">터미널에서 다음 명령어를 실행하세요:</p>
            <code className="block bg-slate-900 text-green-400 p-3 rounded text-sm">
              npm run server
            </code>
          </div>
          <div className="flex items-start space-x-3 mt-4">
            <Database className="w-5 h-5 text-green-500 flex-shrink-0 mt-1" />
            <div>
              <p className="font-semibold text-slate-900">데이터 저장 위치</p>
              <p className="text-sm">수집된 공고 데이터는 <code className="bg-slate-100 px-1 rounded">server/data/bids.json</code>에 저장됩니다.</p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <RefreshCw className="w-5 h-5 text-blue-500 flex-shrink-0 mt-1" />
            <div>
              <p className="font-semibold text-slate-900">자동 스크래핑</p>
              <p className="text-sm">서버가 실행되면 30분마다 자동으로 나라장터를 조회하여 새 공고를 수집합니다.</p>
            </div>
          </div>
        </div>
      </div>

      {/* How to Use */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
        <h2 className="text-xl font-bold text-slate-900 mb-4">사용 방법</h2>
        <div className="space-y-3 text-slate-600">
          <div className="flex items-start space-x-3">
            <span className="font-bold text-blue-600">1.</span>
            <p>백엔드 서버를 실행합니다 (<code className="bg-slate-100 px-1 rounded">npm run server</code>)</p>
          </div>
          <div className="flex items-start space-x-3">
            <span className="font-bold text-blue-600">2.</span>
            <p>대시보드에서 "새로고침" 버튼을 클릭하여 수동으로 공고를 조회할 수 있습니다.</p>
          </div>
          <div className="flex items-start space-x-3">
            <span className="font-bold text-blue-600">3.</span>
            <p>설정 페이지에서 모니터링할 키워드를 추가/수정할 수 있습니다.</p>
          </div>
          <div className="flex items-start space-x-3">
            <span className="font-bold text-blue-600">4.</span>
            <p>기간 조회 기능을 사용하여 특정 기간의 공고를 필터링할 수 있습니다.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Guide;
