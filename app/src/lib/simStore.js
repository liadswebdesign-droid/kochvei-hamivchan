// Persistence for the test simulation. All on this device (localStorage via storage.js).
//   kh:sim-defs         = { 1: def, …, 6: def }   pinned plans, so #1–#6 stay the same when new content arrives
//   kh:p:<id>:sims      = [{ sim, t, mode, score, max, tasks:{reading:[s,m],A,B,C,D}, ms, minutes, over }]
//   kh:p:<id>:simrun    = the run in progress (so a tablet restart mid-test can resume)
import { load, save, remove } from './storage.js';
import { planFixed, defValid, FIXED_SIM_COUNT } from './sim.js';

const pk = (pid, k) => `p:${pid}:${k}`;

// Plans for #1–#6. A pinned plan is kept as long as its ids exist, except that a plan built from too little content
// ("short": a passage had to be reused) is replaced as soon as enough content exists to do it properly.
export function currentDefs(content) {
  const fresh = planFixed(content);
  const pinned = load('sim-defs', {});
  const keep = fresh.every((f, i) => {
    const p = pinned[i + 1];
    return p && defValid(p, content) && !(p.short && !f.short);
  });
  if (keep) return fresh.map((_, i) => pinned[i + 1]);
  save('sim-defs', Object.fromEntries(fresh.map((f, i) => [i + 1, f])));
  return fresh;
}
export const defFor = (n, content) => currentDefs(content)[n - 1];

export const getSims = (pid) => load(pk(pid, 'sims'), []);
export function addSim(pid, entry) {
  const list = getSims(pid);
  list.push(entry);
  save(pk(pid, 'sims'), list.slice(-200));
}
// Best score per simulation id: { 'sim-1': {score, max}, … }
export function bestScores(pid) {
  const best = {};
  for (const e of getSims(pid)) {
    const b = best[e.sim];
    if (!b || e.score / e.max > b.score / b.max) best[e.sim] = { score: e.score, max: e.max };
  }
  return best;
}
export function bestOverall(pid) {
  let top = null;
  for (const b of Object.values(bestScores(pid))) if (!top || b.score / b.max > top.score / top.max) top = b;
  return top;
}

export const getRun = (pid) => load(pk(pid, 'simrun'), null);
export const saveRun = (pid, run) => save(pk(pid, 'simrun'), run);
export const clearRun = (pid) => remove(pk(pid, 'simrun'));

export { FIXED_SIM_COUNT };
