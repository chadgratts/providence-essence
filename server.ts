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

    console.log('Calling OpenAI to summarize session...');
    const summary = await summarizeSession(session);
    console.log(`OpenAI returned ${summary.length} chars`);
    const summaryPath = join(__dirname, 'summaries', `session-${Date.now()}.txt`);
    writeFileSync(summaryPath, summary);
    console.log(`Wrote summary to ${summaryPath}`);

    res.json({ message: `Done — ${events.length} events processed` });
  } catch (error) {
    console.error('Failed to capture request', error);
    res.status(500).json({ error: 'Failed to process session' });
  }
});

app.post('/multi-summary', async (req, res) => {
  try {
    const summariesDir = join(__dirname, 'summaries');
    const files = readdirSync(summariesDir);
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

app.listen(3000, () => {                                                                      
  console.log('Lab running at http://localhost:3000');
  console.log('Interact with the page, then click "Stop & Inspect"\n');                       
}); 
