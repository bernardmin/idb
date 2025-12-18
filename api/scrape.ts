import type { VercelRequest, VercelResponse } from '@vercel/node';
import { scrapeG2B } from '../server/services/scraper.js';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const result = await scrapeG2B();
    res.json(result);
  } catch (error) {
    console.error('스크래핑 오류:', error);
    res.status(500).json({ error: '스크래핑 실패' });
  }
}
