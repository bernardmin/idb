import React from 'react';
import { LayoutDashboard, Settings, BookOpen, ShieldCheck, ClipboardList } from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onChangeView: (view: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onChangeView }) => {
  const menuItems = [
    { id: 'dashboard', label: '대시보드', icon: LayoutDashboard },
    { id: 'plan-review', label: '사업계획서 검토', icon: ClipboardList },
    { id: 'settings', label: '설정 (봇 구성)', icon: Settings },
    { id: 'guide', label: '나라장터 설정 가이드', icon: BookOpen },
  ];

  return (
    <div className="w-64 bg-slate-900 h-screen fixed left-0 top-0 text-white flex flex-col">
      <div className="p-6 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="w-8 h-8 text-blue-500" />
          <div>
            <h1 className="text-lg font-bold leading-none">Protect Go - 스카우터</h1>
            <p className="text-xs text-slate-400 mt-1">G2B Smart Monitor</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onChangeView(item.id)}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                isActive 
                  ? 'bg-blue-600 text-white shadow-md' 
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="p-4 border-t border-slate-800">
        <div className="bg-slate-800 rounded-lg p-3 border border-green-500/30">
          <p className="text-xs text-green-500 mb-1 font-bold">SYSTEM MODE</p>
          <div className="flex items-center">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
            <span className="text-xs font-semibold text-slate-300">실시간 모니터링 (웹 스크래핑)</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 leading-tight">
            * 백엔드 서버가 실행 중이면 실제 나라장터 데이터를 수집합니다.
            <br />
            * 서버 실행: <code className="text-green-400">npm run server</code>
          </p>
        </div>
      </div>
    </div>
  );
};
export default Sidebar;

