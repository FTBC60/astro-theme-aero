import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { inside, removeWithin } from './paths.mjs';
import { copyNotes, fingerprint } from './publish-files.mjs';

/**
 * Capture verified notes in an exclusively owned build stage, without changing the source.
 * A mismatch retries up to three attempts; I/O failures and cancellation do not retry.
 * The copy dependency operates on a whole tree, allowing controlled concurrent edits in tests.
 * Fingerprint checks do not provide an atomic filesystem snapshot.
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
      signal.throwIfAborted();
      const digest = await fingerprint(source);
      signal.throwIfAborted();
      await copy(source, directory);
      signal.throwIfAborted();
      const captured = await fingerprint(directory);
      signal.throwIfAborted();
      const matches = digest === captured && digest === await fingerprint(source);
      signal.throwIfAborted();
      if (matches) return { directory, digest };
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
