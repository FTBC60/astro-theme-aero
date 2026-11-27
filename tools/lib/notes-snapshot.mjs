import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { inside, removeWithin } from './paths.mjs';
import { copyNotes, fingerprint } from './publish-files.mjs';

/**
 * Capture verified notes in an exclusively owned build stage, without changing the source.
 * A mismatch retries up to three attempts; I/O failures and cancellation do not retry.
 * The copy dependency operates on a whole tree, allowing controlled concurrent edits in tests.
 * Metadata fingerprints detect source edits during copying without hashing file contents.
 */
export async function createNotesSnapshot({ source, stage, signal = new AbortController().signal, onRetry = () => {} }, copy = copyNotes) {
  source = await realpath(source);
  stage = await realpath(stage);
  const directory = join(stage, '.notes');
  if (inside(source, stage) || inside(stage, source)) throw new Error('Notes snapshot must not overlap its source');
  try {
    for (let attempt = 1; attempt <= 3; attempt++) {
      signal.throwIfAborted();
      await removeWithin(stage, directory);
      const digest = await fingerprint(source);
      await copy(source, directory);
      signal.throwIfAborted();
      if (digest === await fingerprint(source)) return { directory, digest };
      if (attempt === 3) throw new Error('Notes changed repeatedly during snapshot creation; no deployment was attempted');
      onRetry();
    }
  } catch (error) {
    try { await removeWithin(stage, directory); }
    catch (cleanupError) {
      throw new AggregateError([error, cleanupError], `Notes snapshot failed: ${error.message}; cleanup failed: ${cleanupError.message}`, { cause: error });
    }
    throw error;
  }
}
