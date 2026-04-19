import 'dotenv/config';
import express from 'express';
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { SessionPreprocessor } from  '../session-replay-project/backend/src/preprocessor/SessionPreprocessor.js'; 

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Prompts copied from Providence backend: src/utils/aiModelsConfig.ts
const SessionSystemPrompt = `You are Providence, a session replay analysis assistant.
    Your role is to analyze user session recordings and provide clear,
    concise narratives focused on user behaviors, technical issues, and significant interactions.

The session data you'll receive contains:
- Session metadata (timestamps, device info, location)
- Event counts and types
- Technical data (errors, network requests, performance metrics)
- DOM snapshots and incremental changes
- Significant user interactions

Keep all summaries factual and derived from the provided data.
Format responses in plain text, 1-3 paragraphs maximum, with
allowed paragraph breaks but no special formatting.`;

const SessionUserPrompt = `Analyze this JSON string of a session containing events, metadata, and technical metrics. Focus on:
- User behaviors and patterns
- Technical issues or errors
- Key interactions and state changes
- DOM modifications and their significance

Session:
`;

const MultiSessionSystemPrompt = `You are Providence, a session replay analysis assistant. Your role is to analyze patterns across multiple user sessions, identifying trends and outliers in user behavior.

Each session summary contains:
- Narrative description of user journey
- Technical issues encountered
- Interaction patterns and behaviors
- Session outcomes
- Device and location information
- Duration and timestamp data

Ground all observations in the provided session summaries and cite specific sessions when discussing examples. Focus on identifying patterns and anomalies across sessions. Format responses in plain text, 1-3 paragraphs maximum, with allowed paragraph breaks but no special formatting.`;

const MultiSessionUserPrompt = `Analyze these delimited session summaries. Each summary is marked with SESSION START/END tags and includes:
- Complete session narrative

Focus on identifying:
- Common behavioral patterns
- Technical issues affecting multiple users
- Outlier sessions and why they stand out
- Overall user experience trends

Session summaries:
`;

const ChatbotSystemPrompt = {
  role: 'system' as const,
  content: `You are Providence, a session replay analysis assistant chatbot. Your role is to answer questions about user sessions based on session summaries from our database.

Each summary contains:
- Narrative description of user journey
- Technical issues encountered
- Interaction patterns and behaviors
- Session outcomes
- Device and location information

Ground all answers in the provided summaries. Be concise (1-2 paragraphs) and specific. When relevant, cite session details. If patterns exist across multiple sessions, highlight them. If the summaries don't contain enough information to fully answer the question, acknowledge this limitation.`,
};

const ChatbotUserPrompt = {
  role: 'user' as const,
  content: `Below are relevant session summaries from our database, ordered by relevance score. Each summary is delimited by markers.

Use these summaries to answer the following question but NEVER say that you are using provided summaries. Instead, refer to them as existing or known sessions.
`,
};

async function embed(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function summarizeSession(session: object) {
  const completion = await openai.chat.completions.create({
    model: 'gpt-5-nano',
    messages: [
      { role: 'system', content: SessionSystemPrompt },
      { role: 'user', content: SessionUserPrompt + JSON.stringify(session) },
    ],
  });
  return completion.choices[0]?.message?.content?.trim() ?? '';
}

async function summarizeMultipleSessions(sessions: string) {
  const completion = await openai.chat.completions.create({
    model: 'gpt-5-nano',
    messages: [
      { role: 'system', content: MultiSessionSystemPrompt },
      { role: 'user', content: MultiSessionUserPrompt + sessions },
    ],
  });
  return completion.choices[0]?.message?.content?.trim() ?? '';
}

app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

app.get('/', (_req, res) => {
  res.sendFile(join(__dirname, 'app.html'));
});

app.post('/capture', async (req, res) => {
  try {
    const events = req.body;
    console.log(`\nReceived ${events.length} raw events\n`);

    writeFileSync(join(__dirname, 'captured-events.json'), JSON.stringify(events, null, 2));

    const preprocessor = new SessionPreprocessor();
    const session = preprocessor.process('lab-session', events);

    writeFileSync(join(__dirname, 'processed-session.json'), JSON.stringify(session, null, 2));

    const summary = await summarizeSession(session);
    const sessionId = `session-${Date.now()}`;
    const summaryPath = join(__dirname, 'summaries', `${sessionId}.txt`);
    writeFileSync(summaryPath, summary);
    console.log(`Wrote summary to ${summaryPath}`);

    try {
      const embedding = await embed(summary);
      const embeddingPath = join(__dirname, 'summaries', `${sessionId}.embedding.json`);
      writeFileSync(embeddingPath, JSON.stringify(embedding));
      console.log(`Wrote embedding to ${embeddingPath}`);
    } catch (embedErr) {
      console.error('Failed to generate summary embedding', embedErr);
    }

    res.json({ message: `Done — ${events.length} events processed` });
  } catch (error) {
    console.error('Failed to capture request', error);
    res.status(500).json({ error: 'Failed to process session' });
  }
});

app.post('/multi-summary', async (req, res) => {
  try {
    const summariesDir = join(__dirname, 'summaries');
    const files = readdirSync(summariesDir).filter(f => f.endsWith('.txt'));
    const summaries = files
      .map(file => {
        const content = readFileSync(join(summariesDir, file), 'utf-8');
        return `---SUMMARY START---\n${content}\n---SUMMARY END---`;
      })
      .join('\n');

    const result = await summarizeMultipleSessions(summaries);
    writeFileSync(join(__dirname, 'multi-summary.txt'), result);
    res.sendStatus(200);
  } catch (error) {
    console.error('Failed to generate multi-summary', error);
    res.status(500).json({ error: 'Failed to generate multi-summary' });
  }
});

app.post('/chatbot', async (req, res) => {
  try {
    const { query } = req.body ?? {};
    if (typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ error: 'Request body must include a non-empty "query" string' });
    }

    const queryEmbedding = await embed(query);

    const summariesDir = join(__dirname, 'summaries');
    const files = readdirSync(summariesDir).filter(f => f.endsWith('.embedding.json'));

    const scored: { file: string; score: number; content: string }[] = [];
    for (const embeddingFile of files) {
      const base = embeddingFile.replace(/\.embedding\.json$/, '');
      const summaryFile = `${base}.txt`;
      const summaryPath = join(summariesDir, summaryFile);
      try {
        const content = readFileSync(summaryPath, 'utf-8');
        const embedding = JSON.parse(readFileSync(join(summariesDir, embeddingFile), 'utf-8')) as number[];
        const score = cosineSimilarity(queryEmbedding, embedding);
        scored.push({ file: summaryFile, score, content });
      } catch (err) {
        console.warn(`Skipping ${embeddingFile}:`, err);
      }
    }

    const top = scored
      .filter(s => s.score >= 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    if (top.length === 0) {
      return res.json({
        answer: "I couldn't find any relevant sessions to answer that question.",
        sources: [],
      });
    }

    const delimited = top
      .map(
        s =>
          `---SUMMARY START (score=${s.score.toFixed(3)}, file=${s.file})---\n${s.content}\n---SUMMARY END---`,
      )
      .join('\n\n');

    const userContent = `${ChatbotUserPrompt.content}\n${delimited}\n\nQuestion: ${query}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-5-nano',
      messages: [
        ChatbotSystemPrompt,
        { role: 'user', content: userContent },
      ],
    });

    const answer = completion.choices[0]?.message?.content?.trim() ?? '';
    res.json({
      answer,
      sources: top.map(s => ({ file: s.file, score: s.score })),
    });
  } catch (error) {
    console.error('Failed to handle chatbot request', error);
    res.status(500).json({ error: 'Failed to handle chatbot request' });
  }
});

app.listen(3000, () => {                                                                      
  console.log('Lab running at http://localhost:3000');
  console.log('Interact with the page, then click "Stop & Inspect"\n');                       
}); 
