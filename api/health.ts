import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: '서버가 정상적으로 실행 중입니다.',
  });
}
