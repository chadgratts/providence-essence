import 'dotenv/config';
import express from 'express';
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { SessionPreprocessor } from  '../session-replay-project/backend/src/preprocessor/SessionPreprocessor.js'; 

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function summarizeSession(processed: unknown) {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are analyzing a processed user session. Provide an evidence-based analysis of the session. Clearly explain what can be inferred from the evidence, what remains uncertain or ambiguous, and what is likely noise or low-signal behavior. Do not overclaim, and ground your conclusions in the provided session data.', // i might change this to noto telling me what remains ambiguous/low-signal behavior
      },
      {
        role: 'user',
        content: `Analyze this processed user session:\n\n${JSON.stringify(processed, null, 2)}`,
      },
    ],
  });
  return completion.choices[0]?.message?.content?.trim() ?? '';
};

app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

app.get('/', (_req, res) => {
  res.sendFile(join(__dirname, 'app.html'));
});

app.post('/capture', async (req, res) => {
  const events = req.body;
  console.log(`\nReceived ${events.length} raw events\n`);

  writeFileSync('captured-events.json', JSON.stringify(events, null, 2));

  const preprocessor = new SessionPreprocessor();
  const processed = preprocessor.process('lab-session', events);

  writeFileSync('processed-session.json', JSON.stringify(processed, null, 2));                                                                                       
                             
  const summary = await summarizeSession(processed);
  writeFileSync('summary.txt', summary);
  
  res.json({ message: `Done — ${events.length} events processed` }); 
});

app.listen(3000, () => {                                                                      
  console.log('Lab running at http://localhost:3000');
  console.log('Interact with the page, then click "Stop & Inspect"\n');                       
}); 
