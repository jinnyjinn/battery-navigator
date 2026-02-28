// Vercel Serverless Function — 헬스체크
export default function handler(req, res) {
  res.json({
    status: 'ok',
    hasAnthropicKey: !!(process.env.ANTHROPIC_API_KEY),
    hasGeminiKey: !!(process.env.GEMINI_API_KEY),
    serverApiKey: !!(process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY),
    env: process.env.VERCEL ? 'vercel' : 'local',
  });
}
