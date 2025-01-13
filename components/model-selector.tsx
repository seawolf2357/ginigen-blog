'use client'

import { Model, models } from '@/lib/types/models'
import { createModelId } from '@/lib/utils'

interface ModelSelectorProps {
  selectedModelId: string
  onModelChange: (id: string) => void
}

export function ModelSelector({
  selectedModelId,
  onModelChange
}: ModelSelectorProps) {
  // 컴포넌트를 숨기고 기본값만 반환
  return null
}
