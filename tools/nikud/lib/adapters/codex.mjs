// Vocalizer (b): GPT via the Codex companion, read-only (no --write). `--model gpt-6-luna` is REQUIRED: the default
// model is rejected for this account while the process still exits 0, so an empty reply is treated as an error.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runLlmVocalizer } from './llm.mjs';

const COMPANION = process.env.NIKUD_CODEX_COMPANION
  || path.join(os.homedir(), '.claude/plugins/cache/openai-codex/codex/1.0.6/scripts/codex-companion.mjs');
const MODEL = process.env.NIKUD_CODEX_MODEL || 'gpt-6-luna';
const EFFORT = process.env.NIKUD_CODEX_EFFORT || 'high';
const TIMEOUT_MS = 40 * 60 * 1000;

function run(cmd, args, { cwd, input, timeoutMs, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: env || process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error(`${path.basename(cmd)} timed out after ${timeoutMs / 1000}s`)); }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out, err }); });
    if (input) child.stdin.end(input); else child.stdin.end();
  });
}
export { run };

export function createCodex({ projectRoot, tmpDir }) {
  return {
    id: 'codex',
    model: `${MODEL} (effort ${EFFORT}) via codex-companion`,
    cacheSalt: `codex-${MODEL}-${EFFORT}`,
    async vocalize(units, { onUnit, log }) {
      if (!fs.existsSync(COMPANION)) throw new Error(`codex companion not found at ${COMPANION}`);
      fs.mkdirSync(tmpDir, { recursive: true });
      const call = async (prompt, { attempt, batchIndex }) => {
        const file = path.join(tmpDir, `codex-prompt-${process.pid}-${attempt}-${batchIndex}.txt`);
        fs.writeFileSync(file, prompt);
        const env = { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH || ''}` };
        let r;
        let ms;
        // "codex app-server connection closed" happens at start-up now and then (seen when another CLI starts at the
        // same moment). It fails within seconds and costs nothing, so retry it twice, 20 s apart. Anything else stops.
        for (let tries = 0; ; tries++) {
          const t0 = Date.now();
          r = await run(process.execPath, [COMPANION, 'task', '--model', MODEL, '--effort', EFFORT, '--json', '--prompt-file', file],
            { cwd: projectRoot, timeoutMs: TIMEOUT_MS, env });
          ms = Date.now() - t0;
          const transient = r.code !== 0 && /app-server connection closed/i.test(r.err + r.out) && ms < 30000;
          if (!transient || tries >= 2) break;
          log?.(`codex: app-server closed at start-up, retrying in 20s (${tries + 1}/2)`);
          await new Promise((res) => setTimeout(res, 20000));
        }
        fs.rmSync(file, { force: true });
        let payload;
        try { payload = JSON.parse(r.out); } catch {
          throw new Error(`codex companion gave no JSON (exit ${r.code}): ${(r.err || r.out).slice(0, 300)}`);
        }
        const text = payload.rawOutput || '';
        if (!text.trim()) throw new Error(`codex returned an empty reply (status ${payload.status}) — model rejected? ${r.err.slice(0, 300)}`);
        return { text, ms };
      };
      return runLlmVocalizer({ id: 'codex', call, maxChars: 3500, units, onUnit, log });
    },
  };
}
