import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSettings, saveSettings } from '../server/services/database.js';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    try {
      const settings = await getSettings();
      res.json(settings);
    } catch (error) {
      console.error('설정 조회 오류:', error);
      res.status(500).json({ error: '설정 조회 실패' });
    }
  } else if (req.method === 'POST') {
    try {
      const settings = req.body;
      await saveSettings(settings);
      res.json({ success: true });
    } catch (error) {
      console.error('설정 저장 오류:', error);
      res.status(500).json({ error: '설정 저장 실패' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
