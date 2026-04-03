import express from 'express';
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { SessionPreprocessor } from  '../session-replay-project/backend/src/preprocessor/SessionPreprocessor.js'; 

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '50mb' }));

app.get('/', (_req, res) => {
  res.sendFile(join(__dirname, 'app.html'));
});

app.post('/capture', (req, res) => {
  const events = req.body;
  console.log(`\nReceived ${events.length} raw events\n`);

  // Save raw events so I can inspect them later
  writeFileSync('captured-events.json', JSON.stringify(events, null, 2));
  console.log('Saved to captured-events.json');

  // Run the preprocessor
  const preprocessor = new SessionPreprocessor();
  const processed = preprocessor.process('lab-session', events);

  // Save processed output
  writeFileSync('processed-session.json', JSON.stringify(processed, null, 2));
  console.log('Saved to processed-session.json\n');

  console.log('\n--- event counts ---');
  console.log('  total:', processed.events.total);                                            
  console.log('  byType:', processed.events.byType);             
  console.log('  bySource:', processed.events.bySource);
  
  console.log('\n── significant events ──');                     
  for (const evt of processed.events.significant) {                                           
    console.log(`  [${evt.when}] ${evt.type}: ${evt.details}`);                               
  }                                                                                           
                                                                                              
  console.log('\n── errors ──');                                                              
  for (const err of processed.technical.errors) {
    console.log(`  ${err.type}: ${err.message}`);                                             
  }                                    
                                                                                              
  if (processed.events.significant.length === 0 && processed.technical.errors.length === 0) {
    console.log('  (none — try clicking "Throw Error" or rage-clicking next time)');
  }                                                                                           
                                                                 
  res.json({ message: `Done — ${events.length} events processed` }); 
});

app.listen(3000, () => {                                                                      
  console.log('Lab running at http://localhost:3000');
  console.log('Interact with the page, then click "Stop & Inspect"\n');                       
}); 
