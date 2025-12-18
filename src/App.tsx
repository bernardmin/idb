import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';
import Guide from './components/Guide';
import { INITIAL_SETTINGS } from './constants';
import { UserSettings } from './types';
import { fetchSettings } from './services/api';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState('dashboard');
  const [settings, setSettings] = useState<UserSettings>(INITIAL_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 서버에서 설정 로드
    fetchSettings()
      .then((serverSettings) => {
        setSettings(serverSettings);
        setLoading(false);
      })
      .catch((error) => {
        console.error('설정 로드 실패:', error);
        setLoading(false);
      });
  }, []);

  const handleSettingsUpdate = async (newSettings: UserSettings) => {
    try {
      const { saveSettings } = await import('./services/api');
      await saveSettings(newSettings);
      setSettings(newSettings);
    } catch (error) {
      console.error('설정 저장 실패:', error);
      throw error;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-slate-600">로딩 중...</p>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (currentView) {
      case 'dashboard': return <Dashboard settings={settings} />;
      case 'settings': return <Settings settings={settings} onUpdate={handleSettingsUpdate} />;
      case 'guide': return <Guide />;
      default: return <Dashboard settings={settings} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar currentView={currentView} onChangeView={setCurrentView} />
      <main className="ml-64 p-8">
        <div className="max-w-6xl mx-auto">{renderContent()}</div>
      </main>
    </div>
  );
};
export default App;

