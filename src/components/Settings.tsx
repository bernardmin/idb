import React, { useState } from 'react';
import { Plus, X, Save, Mail, Filter, Ban } from 'lucide-react';
import { UserSettings } from '../types';

interface SettingsProps {
  settings: UserSettings;
  onUpdate: (newSettings: UserSettings) => void;
}

const Settings: React.FC<SettingsProps> = ({ settings, onUpdate }) => {
  const [localSettings, setLocalSettings] = useState<UserSettings>(settings);
  const [newKeyword, setNewKeyword] = useState('');
  const [newExcludeKeyword, setNewExcludeKeyword] = useState('');
  const [newEmail, setNewEmail] = useState('');

  const handleSave = () => { 
    onUpdate(localSettings); 
    alert('설정이 저장되었습니다.'); 
  };
  
  const addKeyword = () => { 
    if (newKeyword && !localSettings.keywords.includes(newKeyword)) { 
      setLocalSettings({...localSettings, keywords: [...localSettings.keywords, newKeyword]}); 
      setNewKeyword(''); 
    } 
  };
  
  const removeKeyword = (k: string) => { 
    setLocalSettings({...localSettings, keywords: localSettings.keywords.filter(item => item !== k)}); 
  };

  const addExcludeKeyword = () => {
    if (newExcludeKeyword && !localSettings.excludeKeywords.includes(newExcludeKeyword)) {
      setLocalSettings({...localSettings, excludeKeywords: [...localSettings.excludeKeywords, newExcludeKeyword]});
      setNewExcludeKeyword('');
    }
  };

  const removeExcludeKeyword = (k: string) => {
    setLocalSettings({...localSettings, excludeKeywords: localSettings.excludeKeywords.filter(item => item !== k)});
  };

  const addEmail = () => {
    if (newEmail && !localSettings.emails.includes(newEmail)) {
      setLocalSettings({...localSettings, emails: [...localSettings.emails, newEmail]});
      setNewEmail('');
    }
  };

  const removeEmail = (email: string) => {
    setLocalSettings({...localSettings, emails: localSettings.emails.filter(item => item !== email)});
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-10">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-900">설정 (Configuration)</h2>
        <button onClick={handleSave} className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          <Save className="w-4 h-4 mr-2" />변경사항 저장
        </button>
      </div>
      
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center mb-6"><div className="p-2 bg-blue-50 rounded-lg mr-3"><Mail className="w-5 h-5 text-blue-600" /></div><h3 className="text-lg font-bold text-slate-900">수신 이메일 주소</h3></div>
        <div className="flex gap-2 mb-4">
          <input 
            type="email" 
            value={newEmail} 
            onChange={(e) => setNewEmail(e.target.value)} 
            onKeyDown={(e) => e.key === 'Enter' && addEmail()} 
            placeholder="예: user@example.com" 
            className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
          />
          <button onClick={addEmail} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors">
            <Plus className="w-5 h-5" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">{localSettings.emails.map(email => (<span key={email} className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-blue-50 text-blue-700 border border-blue-100">{email}<button onClick={() => removeEmail(email)} className="ml-2 text-blue-400 hover:text-blue-600"><X className="w-3.5 h-3.5" /></button></span>))}</div>
        <div className="mt-4 flex items-center">
          <input 
            type="checkbox" 
            id="emailEnabled"
            checked={localSettings.emailEnabled}
            onChange={(e) => setLocalSettings({...localSettings, emailEnabled: e.target.checked})}
            className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
          />
          <label htmlFor="emailEnabled" className="ml-2 text-sm text-slate-700">이메일 알림 활성화</label>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center mb-6"><div className="p-2 bg-blue-50 rounded-lg mr-3"><Filter className="w-5 h-5 text-blue-600" /></div><h3 className="text-lg font-bold text-slate-900">수집 키워드 (Include)</h3></div>
        <div className="flex gap-2 mb-4">
          <input 
            type="text" 
            value={newKeyword} 
            onChange={(e) => setNewKeyword(e.target.value)} 
            onKeyDown={(e) => e.key === 'Enter' && addKeyword()} 
            placeholder="예: 지능형 선별관제" 
            className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
          />
          <button onClick={addKeyword} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors">
            <Plus className="w-5 h-5" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">{localSettings.keywords.map(k => (<span key={k} className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-blue-50 text-blue-700 border border-blue-100">{k}<button onClick={() => removeKeyword(k)} className="ml-2 text-blue-400 hover:text-blue-600"><X className="w-3.5 h-3.5" /></button></span>))}</div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center mb-6"><div className="p-2 bg-red-50 rounded-lg mr-3"><Ban className="w-5 h-5 text-red-600" /></div><h3 className="text-lg font-bold text-slate-900">제외 키워드 (Exclude)</h3></div>
        <div className="flex gap-2 mb-4">
          <input 
            type="text" 
            value={newExcludeKeyword} 
            onChange={(e) => setNewExcludeKeyword(e.target.value)} 
            onKeyDown={(e) => e.key === 'Enter' && addExcludeKeyword()} 
            placeholder="예: 청소, 제초" 
            className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
          />
          <button onClick={addExcludeKeyword} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors">
            <Plus className="w-5 h-5" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">{localSettings.excludeKeywords.map(k => (<span key={k} className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-red-50 text-red-700 border border-red-100">{k}<button onClick={() => removeExcludeKeyword(k)} className="ml-2 text-red-400 hover:text-red-600"><X className="w-3.5 h-3.5" /></button></span>))}</div>
      </div>
    </div>
  );
};
export default Settings;

