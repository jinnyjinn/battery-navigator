// Vercel Serverless Function — 헬스체크
export default function handler(req, res) {
  res.json({
    status: 'ok',
    serverApiKey: !!(process.env.ANTHROPIC_API_KEY),
    env: process.env.VERCEL ? 'vercel' : 'local',
  });
}
