export interface Model {
  id: string
  name: string
  provider: string
  providerId: string
}

export const models: Model[] = [

  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o mini',
    provider: 'OpenAI',
    providerId: 'openai'
  },

]
