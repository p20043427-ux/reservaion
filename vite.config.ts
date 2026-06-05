import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

/**
 * 로컬 개발용 /api/llm 미들웨어.
 * Vercel 의 서버리스 함수(api/llm.ts)와 동일한 역할을 dev 서버에서 재현하여,
 * `npm run dev` 시에도 키가 브라우저에 노출되지 않게 한다.
 * 키는 .env 의 OPENROUTER_API_KEY 에서 읽는다.
 */
function devLlmProxy(apiKey: string): Plugin {
  return {
    name: 'dev-llm-proxy',
    configureServer(server) {
      server.middlewares.use('/api/llm', async (req, res) => {
        const send = (status: number, obj: unknown) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(obj))
        }

        if (req.method !== 'POST') return send(405, { error: 'Method not allowed' })
        if (!apiKey)
          return send(500, {
            error: '로컬 .env 에 OPENROUTER_API_KEY 가 없습니다. .env 파일을 만들고 키를 넣은 뒤 dev 서버를 재시작하세요.',
          })

        let raw = ''
        for await (const chunk of req) raw += chunk
        let messages: unknown
        let temperature = 0.2
        try {
          const parsed = JSON.parse(raw || '{}')
          messages = parsed.messages
          if (typeof parsed.temperature === 'number') temperature = parsed.temperature
        } catch {
          return send(400, { error: '잘못된 요청 본문' })
        }
        if (!Array.isArray(messages) || messages.length === 0)
          return send(400, { error: 'messages 배열이 필요합니다.' })

        try {
          const r = await fetch(OPENROUTER_URL, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'X-Title': 'Smart Clinic Reservation (dev)',
            },
            body: JSON.stringify({
              model: 'openrouter/auto',
              messages,
              temperature,
              response_format: { type: 'json_object' },
            }),
          })
          const data: any = await r.json()
          if (!r.ok) return send(r.status, { error: data?.error?.message || `OpenRouter 오류 (${r.status})` })
          const content = data?.choices?.[0]?.message?.content ?? ''
          if (!content) return send(502, { error: 'LLM 응답이 비어 있습니다.' })
          return send(200, { content })
        } catch (e: any) {
          return send(502, { error: e?.message || 'LLM 호출 실패' })
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // '' prefix → VITE_ 접두사 없는 변수까지 모두 로드(서버 측에서만 사용, 클라이언트 번들에는 포함되지 않음)
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), devLlmProxy(env.OPENROUTER_API_KEY ?? '')],
  }
})
