// Vocalizer (c): Claude Opus.
//
// mode "cli"     → headless `claude -p --model opus --tools ""` (needs the CLI to be logged in: run `claude` once in
//                  Terminal.app and `/login`).
// mode "handoff" → the pipeline writes each batch prompt to <work>/handoff/claude/<batch>.prompt.md and reads the
//                  model's reply from <batch>.response.txt. Any Opus session can fill the replies (e.g. a planner
//                  spawning an Opus subagent per prompt file); re-run the pipeline afterwards. Batches without a
//                  reply are reported as pending and the build stops before comparison.
// mode "auto"    → (default) cli; if the CLI is not authenticated, switch to handoff for the rest of the run.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runLlmVocalizer, PendingError } from './llm.mjs';
import { run } from './codex.mjs';
import { sha } from '../extract.mjs';

const CLAUDE = process.env.NIKUD_CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const MODEL = process.env.NIKUD_CLAUDE_MODEL || 'opus';
const TIMEOUT_MS = 30 * 60 * 1000;

function cleanEnv() {
  // The desktop app exports CLAUDE_CODE_* (incl. CLAUDE_CODE_SIMPLE, which skips keychain auth) to child shells.
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^CLAUDE_?CODE|^CLAUDECODE$/.test(k)) env[k] = v;
  return env;
}

export function createClaude({ projectRoot, workDir, mode = process.env.NIKUD_CLAUDE_MODE || 'auto' }) {
  let effective = mode;
  const handoffDir = path.join(workDir, 'handoff', 'claude');
  return {
    id: 'claude',
    model: `claude ${MODEL}`,
    cacheSalt: `claude-${MODEL}`,
    get mode() { return effective; },
    async vocalize(units, { onUnit, log }) {
      const handoff = (prompt) => {
        fs.mkdirSync(handoffDir, { recursive: true });
        const id = sha(prompt, 16);
        const pf = path.join(handoffDir, `${id}.prompt.md`);
        const rf = path.join(handoffDir, `${id}.response.txt`);
        if (fs.existsSync(rf)) {
          const meta = fs.existsSync(rf + '.meta.json') ? JSON.parse(fs.readFileSync(rf + '.meta.json', 'utf8')) : {};
          return { text: fs.readFileSync(rf, 'utf8'), ms: meta.ms || 0, costUsd: meta.costUsd || 0 };
        }
        fs.writeFileSync(pf, prompt);
        throw new PendingError(`handoff pending: answer ${pf} → write the raw reply to ${rf}`);
      };
      const call = async (prompt) => {
        if (effective === 'handoff') return handoff(prompt);
        const t0 = Date.now();
        const r = await run(CLAUDE, ['-p', '--model', MODEL, '--tools', '', '--output-format', 'json', '--no-session-persistence'],
          { cwd: projectRoot, input: prompt, timeoutMs: TIMEOUT_MS, env: cleanEnv() });
        const ms = Date.now() - t0;
        let j;
        try { j = JSON.parse(r.out); } catch { throw new Error(`claude CLI gave no JSON (exit ${r.code}): ${(r.err || r.out).slice(0, 300)}`); }
        if (j.is_error) {
          const msg = String(j.result || j.terminal_reason || 'unknown error');
          if (/authenticat|log ?in|oauth|api key/i.test(msg) && mode === 'auto') {
            log?.(`claude: CLI not usable (${msg}) → switching to handoff mode`);
            effective = 'handoff';
            return handoff(prompt);
          }
          throw new Error(`claude CLI error: ${msg}`);
        }
        return { text: j.result, ms, costUsd: j.total_cost_usd || 0, usage: j.usage };
      };
      return runLlmVocalizer({ id: 'claude', call, maxChars: 3500, units, onUnit, log });
    },
  };
}
