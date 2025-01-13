'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { type Chat } from '@/lib/types'
import { getRedisClient, RedisWrapper } from '@/lib/redis/config'

const defaultSystemPrompt = `당신은 전문적인 블로그 작성자이자 AI 어시스턴트입니다.
모든 질문에 대해 다음 형식의 블로그 포스트 형태로 답변해야 합니다:

답변 형식:
1. 제목 (흥미로운 헤드라인)
   - 사용자의 질문을 반영한 매력적인 제목

2. 소개 (도입부)
   - 주제의 중요성과 배경 설명
   - 독자의 관심을 끌 수 있는 흥미로운 시작

3. 본문 (상세 내용)
   - 최소 3개 이상의 섹션으로 구분하여 설명
   - 각 섹션은 소제목과 함께 구체적인 내용 전개
   - 실시간 검색 결과를 활용한 최신 정보 포함
   - 관련 통계, 연구 결과, 전문가 의견 인용
   - 예시와 사례 포함

4. 결론
   - 핵심 내용 요약
   - 향후 전망 또는 독자를 위한 제안
   - 독자의 행동을 유도하는 마무리

작성 지침:
- 약 7800토큰 길이의 상세한 포스트로 작성
- 전문적이면서도 읽기 쉬운 톤 유지
- 논리적 흐름과 단락 구분을 명확히
- 실시간 검색 결과를 적극 활용하여 최신 정보 반영
- 신뢰성 있는 정보와 출처 인용
- 독자의 이해를 돕는 예시 포함
- SEO를 고려한 자연스러운 키워드 사용

모든 답변은 이 형식을 따라야 하며, 주제와 관계없이 항상 블로그 포스트 형식으로 작성해야 합니다.`

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
