import OpenAI from 'openai';
import {
  SessionSystemPrompt,
  SessionUserPrompt,
  MultiSessionSystemPrompt,
  MultiSessionUserPrompt,
  ChatbotSystemPrompt,
  ChatbotUserPrompt,
} from './prompts.js';

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function embed(text: string) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}

export function cosineSimilarity(a: number[], b: number[]) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function summarizeSession(session: object) {
  const completion = await openai.chat.completions.create({
    model: 'gpt-5-nano',
    messages: [
      { role: 'system', content: SessionSystemPrompt },
      { role: 'user', content: SessionUserPrompt + JSON.stringify(session) },
    ],
  });
  return completion.choices[0]?.message?.content?.trim() ?? '';
}

export async function summarizeMultipleSessions(sessions: string) {
  const completion = await openai.chat.completions.create({
    model: 'gpt-5-nano',
    messages: [
      { role: 'system', content: MultiSessionSystemPrompt },
      { role: 'user', content: MultiSessionUserPrompt + sessions },
    ],
  });
  return completion.choices[0]?.message?.content?.trim() ?? '';
}

export async function answerChatbotQuery(query: string, wrappedSummaries: string) {
  const completion = await openai.chat.completions.create({
    model: 'gpt-5-nano',
    messages: [
      ChatbotSystemPrompt,
      { role: 'user', content: ChatbotUserPrompt.content + wrappedSummaries + `\n\nQuestion: ${query}` },
    ],
  });
  return completion.choices[0]?.message?.content?.trim() ?? '';
}
