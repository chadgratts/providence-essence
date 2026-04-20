import 'dotenv/config';
import express from 'express';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { embed, cosineSimilarity, summarizeMultipleSessions, answerChatbotQuery } from './ai.js';
import {
  processAndSaveSession,
  loadAllSummaries,
  saveMultiSummary,
  loadSummariesWithEmbeddings,
  wrapSummaries,
} from './summaries.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname, { index: 'app.html' }));

app.post('/capture', async (req, res) => {
  try {
    const events = req.body;
    console.log(`\nReceived ${events.length} raw events\n`);
    const sessionId = await processAndSaveSession(events);
    console.log(`Wrote summary and embedding for ${sessionId}`);
    res.json({ message: `Done — ${events.length} events processed` });
  } catch (error) {
    console.error('Failed to capture request', error);
    res.status(500).json({ error: 'Failed to process session' });
  }
});

app.post('/multi-summary', async (_req, res) => {
  try {
    const result = await summarizeMultipleSessions(loadAllSummaries());
    saveMultiSummary(result);
    res.sendStatus(200);
  } catch (error) {
    console.error('Failed to generate multi-summary', error);
    res.status(500).json({ error: 'Failed to generate multi-summary' });
  }
});

app.post('/chatbot', async (req, res) => {
  try {
    const { query } = req.body;
    const queryEmbedding = await embed(query);
    const topMatches = loadSummariesWithEmbeddings()
      .map(({ summary, embedding }) => ({ summary, score: cosineSimilarity(queryEmbedding, embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    const answer = await answerChatbotQuery(query, wrapSummaries(topMatches.map(match => match.summary)));
    res.json({ answer });
  } catch (error) {
    console.error('Failed to handle chatbot request', error);
    res.status(500).json({ error: 'Failed to handle chatbot request' });
  }
});

app.listen(3000, () => {
  console.log('Lab running at http://localhost:3000');
  console.log('Interact with the page, then click "Stop & Inspect"\n');
});
