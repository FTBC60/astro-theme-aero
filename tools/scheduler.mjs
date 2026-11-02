import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function scheduleConfig(env) {
  const schedule = env.CRON_SCHEDULE?.trim();
  if (!schedule || schedule.split(/\s+/).length !== 5 || !/^[a-z\d*\/,\- ]+$/i.test(schedule)) throw new Error('CRON_SCHEDULE must be a five-field cron expression without commands or line breaks');
  const timezone = env.TZ || 'UTC';
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(); }
  catch { throw new Error(`Invalid TZ: ${timezone}`); }
  return { schedule, timezone };
}

export async function scheduler(args = process.argv.slice(2)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const mode = args[0] || 'schedule';
  const execute = (command, argv, env = process.env) => new Promise((done, reject) => {
    const child = spawn(command, argv, { cwd: root, env, stdio: 'inherit' });
    const stop = (signal) => child.kill(signal);
    const term = () => stop('SIGTERM');
    const interrupt = () => stop('SIGINT');
    process.once('SIGTERM', term);
    process.once('SIGINT', interrupt);
    child.once('error', reject);
    child.once('close', (code, signal) => {
      process.removeListener('SIGTERM', term);
      process.removeListener('SIGINT', interrupt);
      code === 0 ? done() : reject(new Error(`${command} exited with ${signal || code}`));
    });
  });
  if (mode === 'once') return execute(process.execPath, [join(root, 'tools/deploy.mjs'), ...args.slice(1)]);
  if (!['schedule', 'validate'].includes(mode) || args.length > 1) throw new Error('Usage: scheduler.mjs [schedule | validate | once [--dry-run | --build-only]]');
  const { schedule, timezone } = scheduleConfig(process.env);
  const data = process.env.PUBLISHER_DATA_DIR || '/data';
  await mkdir(data, { recursive: true });
  const crontab = join(data, 'publisher.crontab');
  const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
  await writeFile(crontab, `${schedule} ${quote(process.execPath)} ${quote(join(root, 'tools/deploy.mjs'))}\n`);
  const env = { ...process.env, TZ: timezone };
  await execute('supercronic', ['-test', crontab], env);
  console.log(`[scheduler] Schedule: ${schedule}; timezone: ${timezone}.${mode === 'validate' ? ' Validation complete.' : ' Waiting for the next scheduled run.'}`);
  if (mode !== 'validate') await execute('supercronic', [crontab], env);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  scheduler().catch((error) => { console.error(`[scheduler] ${error.message}`); process.exitCode = 1; });
}
