import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'

const exampleMessages = [
  {
    heading: '오늘의 주요 뉴스 헤드라인이 궁금해요',
    message: '오늘의 주요 뉴스 헤드라인이 궁금해요'
  },
  {
    heading: '삼성전자 최신 실적 분석해줘',
    message: '삼성전자 최신 실적 분석해줘'
  },
  {
    heading: '현대차 vs 테슬라 비교',
    message: '현대차 vs 테슬라 비교'
  },
  {
    heading: '한국의 인공지능 산업 현황 설명해줘',
    message: '한국의 인공지능 산업 현황 설명해줘'
  }
]

export function EmptyScreen({
  submitMessage,
  className
}: {
  submitMessage: (message: string) => void
  className?: string
}) {
  return (
    <div className={`mx-auto w-full transition-all ${className}`}>
      <div className="bg-background p-2">
        <div className="mt-4 flex flex-col items-start space-y-2 mb-4">
          {exampleMessages.map((message, index) => (
            <Button
              key={index}
              variant="link"
              className="h-auto p-0 text-base"
              name={message.message}
              onClick={async () => {
                submitMessage(message.message)
              }}
            >
              <ArrowRight size={16} className="mr-2 text-muted-foreground" />
              {message.heading}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
