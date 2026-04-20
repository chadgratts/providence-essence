import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { SessionPreprocessor } from '../session-replay-project/backend/src/preprocessor/SessionPreprocessor.js';
import { embed, summarizeSession } from './ai.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const summariesDir = join(__dirname, 'summaries');

const wrapSummary = (text: string) => `---SUMMARY START---\n${text}\n---SUMMARY END---`;

export async function processAndSaveSession(events: any[]) {
  writeFileSync(join(__dirname, 'captured-events.json'), JSON.stringify(events, null, 2));

  const preprocessor = new SessionPreprocessor();
  const session = preprocessor.process('lab-session', events);
  writeFileSync(join(__dirname, 'processed-session.json'), JSON.stringify(session, null, 2));

  const summary = await summarizeSession(session);
  const sessionId = `session-${Date.now()}`;
  writeFileSync(join(summariesDir, `${sessionId}.txt`), summary);

  const embedding = await embed(summary);
  writeFileSync(join(summariesDir, `${sessionId}.embedding.json`), JSON.stringify(embedding));

  return sessionId;
}

export function loadAllSummaries(): string {
  return readdirSync(summariesDir)
    .filter(file => file.endsWith('.txt'))
    .map(file => wrapSummary(readFileSync(join(summariesDir, file), 'utf-8')))
    .join('\n');
}

export function saveMultiSummary(text: string) {
  writeFileSync(join(__dirname, 'multi-summary.txt'), text);
}

export function loadSummariesWithEmbeddings(): { summary: string; embedding: number[] }[] {
  return readdirSync(summariesDir)
    .filter(f => f.endsWith('.embedding.json'))
    .map(embeddingFile => ({
      embedding: JSON.parse(readFileSync(join(summariesDir, embeddingFile), 'utf-8')) as number[],
      summary: readFileSync(join(summariesDir, embeddingFile.replace('.embedding.json', '.txt')), 'utf-8'),
    }));
}

export function wrapSummaries(summaries: string[]): string {
  return summaries.map(wrapSummary).join('\n');
}
