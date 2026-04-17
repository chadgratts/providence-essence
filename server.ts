import express from 'express';
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { SessionPreprocessor } from  '../session-replay-project/backend/src/preprocessor/SessionPreprocessor.js'; 

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

app.get('/', (_req, res) => {
  res.sendFile(join(__dirname, 'app.html'));
});

app.post('/capture', (req, res) => {
  const events = req.body;
  console.log(`\nReceived ${events.length} raw events\n`);

  writeFileSync('captured-events.json', JSON.stringify(events, null, 2));

  const preprocessor = new SessionPreprocessor();
  const processed = preprocessor.process('lab-session', events);

  writeFileSync('processed-session.json', JSON.stringify(processed, null, 2));                                                                                       
                                                                 
  res.json({ message: `Done — ${events.length} events processed` }); 
});

app.listen(3000, () => {                                                                      
  console.log('Lab running at http://localhost:3000');
  console.log('Interact with the page, then click "Stop & Inspect"\n');                       
}); 
