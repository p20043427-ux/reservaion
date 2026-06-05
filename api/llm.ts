// Vercel 서버리스 함수: OpenRouter 프록시
// 브라우저는 이 엔드포인트(/api/llm)만 호출하고, 실제 API 키는 서버 환경변수에만 존재한다.
// 환경변수: OPENROUTER_API_KEY (Vercel 프로젝트 Settings → Environment Variables)

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'openrouter/auto'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    res
      .status(500)
      .json({ error: '서버에 OPENROUTER_API_KEY 환경변수가 설정되지 않았습니다. Vercel 환경변수를 확인하세요.' })
    return
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body
  const messages: ChatMessage[] = body?.messages
  const temperature: number = typeof body?.temperature === 'number' ? body.temperature : 0.2

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages 배열이 필요합니다.' })
    return
  }

  try {
    const r = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': req.headers?.origin ?? 'https://vercel.app',
        'X-Title': 'Smart Clinic Reservation',
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature,
        response_format: { type: 'json_object' },
      }),
    })

    const data = await r.json()
    if (!r.ok) {
      res.status(r.status).json({ error: data?.error?.message || `OpenRouter 오류 (${r.status})` })
      return
    }

    const content: string = data?.choices?.[0]?.message?.content ?? ''
    if (!content) {
      res.status(502).json({ error: 'LLM 응답이 비어 있습니다.' })
      return
    }
    res.status(200).json({ content })
  } catch (e: any) {
    res.status(502).json({ error: e?.message || 'LLM 호출에 실패했습니다.' })
  }
}

function safeParse(s: string): any {
  try {
    return JSON.parse(s)
  } catch {
    return undefined
  }
}
