'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { type Chat } from '@/lib/types'
import { getRedisClient, RedisWrapper } from '@/lib/redis/config'

const defaultSystemPrompt = `당신은 이제부터 전문 블로그 작성 AI입니다.
사용자의 어떤 질문이나 요청이 들어와도 반드시 블로그 포스트 형식으로만 답변해야 합니다.
다른 형식의 답변은 절대 허용되지 않습니다.

### 필수 블로그 포스트 구조 ###

[제목]
{사용자 질문/주제를 반영한 SEO 최적화된 매력적인 제목}

[소제목]
{주제를 한 줄로 요약한 부제목}

[도입부]
- 주제 소개 및 배경
- 현재 이 주제가 중요한 이유
- 독자가 알아야 할 핵심 포인트 미리보기

[본문 섹션 1: {섹션 제목}]
- 주제의 첫 번째 중요 측면 상세 설명
- 관련 통계 및 연구 데이터 포함
- 실제 사례 또는 예시 제시

[본문 섹션 2: {섹션 제목}]
- 주제의 두 번째 중요 측면 분석
- 전문가 의견 및 업계 동향
- 구체적인 사례 연구

[본문 섹션 3: {섹션 제목}]
- 주제의 세 번째 측면 탐구
- 최신 트렌드 및 미래 전망
- 실용적인 적용 방안

[본문 섹션 4: {섹션 제목}]
- 주제의 네 번째 측면 심층 분석
- 잠재적 문제점과 해결방안
- 실행 전략 및 팁

[실용적 조언]
- 독자가 즉시 적용할 수 있는 구체적 방법
- 단계별 실천 가이드
- 주의사항 및 팁

[결론]
- 핵심 내용 정리
- 향후 전망
- 행동 촉구 (Call-to-Action)

### 필수 작성 규칙 ###

1. 형식
- 모든 섹션은 명확한 제목과 소제목 사용
- 각 섹션은 최소 3-4개의 단락으로 구성
- 글머리 기호와 번호 매기기 적극 활용
- 중요 문구는 강조 표시

2. 내용
- 정확한 데이터와 통계 인용
- 최신 연구 결과 및 전문가 의견 포함
- 실제 사례와 예시 필수 포함
- 실용적인 조언과 적용 방법 제시

3. 분량
- 반드시 15000토큰 이상의 상세한 내용
- 각 섹션별 균형잡힌 분량 배분
- 도입부와 결론은 전체의 각 10-15% 차지

4. 스타일
- 전문적이면서 읽기 쉬운 톤 유지
- SEO를 고려한 자연스러운 키워드 사용
- 논리적 흐름과 명확한 단락 구분
- 독자의 관심을 끄는 흥미로운 서술

이 형식을 절대적으로 준수하여 모든 답변을 작성하십시오.
어떤 질문이나 요청이 와도 반드시 이 블로그 포스트 형식을 사용해야 합니다.
다른 형식의 답변은 허용되지 않습니다.`

async function getRedis(): Promise<RedisWrapper> {
  return await getRedisClient()
}

export async function getChats(userId?: string | null) {
  if (!userId) {
    return []
  }

  try {
    const redis = await getRedis()
    const chats = await redis.zrange(`user:chat:${userId}`, 0, -1, {
      rev: true
    })

    if (chats.length === 0) {
      return []
    }

    const results = await Promise.all(
      chats.map(async chatKey => {
        const chat = await redis.hgetall(chatKey)
        return chat
      })
    )

    return results
      .filter((result): result is Record<string, any> => {
        if (result === null || Object.keys(result).length === 0) {
          return false
        }
        return true
      })
      .map(chat => {
        const plainChat = { ...chat }
        if (typeof plainChat.messages === 'string') {
          try {
            plainChat.messages = JSON.parse(plainChat.messages)
          } catch (error) {
            plainChat.messages = []
          }
        }
        if (plainChat.createdAt && !(plainChat.createdAt instanceof Date)) {
          plainChat.createdAt = new Date(plainChat.createdAt)
        }
        return plainChat as Chat
      })
  } catch (error) {
    return []
  }
}

export async function getChat(id: string, userId: string = 'anonymous') {
  const redis = await getRedis()
  const chat = await redis.hgetall<Chat>(`chat:${id}`)

  if (!chat) {
    return null
  }

  // Parse the messages if they're stored as a string
  if (typeof chat.messages === 'string') {
    try {
      chat.messages = JSON.parse(chat.messages)
    } catch (error) {
      chat.messages = []
    }
  }

  // Ensure messages is always an array
  if (!Array.isArray(chat.messages)) {
    chat.messages = []
  }

  return chat
}

export async function chat({
  messages,
  systemPrompt = '',
  userId = 'anonymous',
  id,
  query
}: {
  messages: any[]
  systemPrompt?: string
  userId?: string
  id?: string
  query?: string
}) {
  const redis = await getRedis()
  const chat = await redis.hgetall<Chat>(`chat:${id}`)

  if (!chat) {
    return null
  }

  if (typeof chat.messages === 'string') {
    try {
      chat.messages = JSON.parse(chat.messages)
    } catch (error) {
      chat.messages = []
    }
  }

  const prompt = systemPrompt || defaultSystemPrompt
  const updatedMessages = [
    { role: 'system', content: prompt },
    ...messages
  ]

  // API 호출 및 응답 처리 로직
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: updatedMessages,
      systemPrompt: prompt
    })
  })

  if (!response.ok) {
    throw new Error('Failed to fetch response')
  }

  await saveChat({
    ...chat,
    messages: updatedMessages
  }, userId)

  return response
}

export async function clearChats(
  userId: string = 'anonymous'
): Promise<{ error?: string }> {
  const redis = await getRedis()
  const chats = await redis.zrange(`user:chat:${userId}`, 0, -1)
  if (!chats.length) {
    return { error: 'No chats to clear' }
  }
  const pipeline = redis.pipeline()

  for (const chat of chats) {
    pipeline.del(chat)
    pipeline.zrem(`user:chat:${userId}`, chat)
  }

  await pipeline.exec()

  revalidatePath('/')
  redirect('/')
}

export async function saveChat(chat: Chat, userId: string = 'anonymous') {
  try {
    const redis = await getRedis()
    const pipeline = redis.pipeline()

    const chatToSave = {
      ...chat,
      messages: JSON.stringify(chat.messages)
    }

    pipeline.hmset(`chat:${chat.id}`, chatToSave)
    pipeline.zadd(`user:chat:${userId}`, Date.now(), `chat:${chat.id}`)

    const results = await pipeline.exec()

    return results
  } catch (error) {
    throw error
  }
}

export async function getSharedChat(id: string) {
  const redis = await getRedis()
  const chat = await redis.hgetall<Chat>(`chat:${id}`)

  if (!chat || !chat.sharePath) {
    return null
  }

  return chat
}

export async function shareChat(id: string, userId: string = 'anonymous') {
  const redis = await getRedis()
  const chat = await redis.hgetall<Chat>(`chat:${id}`)

  if (!chat || chat.userId !== userId) {
    return null
  }

  const payload = {
    ...chat,
    sharePath: `/share/${id}`
  }

  await redis.hmset(`chat:${id}`, payload)

  return payload
}
