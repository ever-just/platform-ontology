import { useCallback, useEffect, useRef, useState } from 'react';
import type { NodeState, Opt, Phase, Scope } from '../types';
import type { Plan } from '../sim/flow';

export const NODE_IDS = ['trigger', 'c1', 'c2', 'c3', 'c4', 'prompt', 'decision', 'allow', 'data', 'persist', 'revoke', 'deny', 'sees', 'recover'] as const;
export type Lit = Record<string, NodeState>;
const blank = (): Lit => Object.fromEntries(NODE_IDS.map((n) => [n, 'idle'])) as Lit;

export interface Sim {
  phase: Phase;
  lit: Lit;
  cur: string;
  scope: Scope | null;
  choice: string;
  hint: string;
  next: string;
  runs: number;
  startedAt: number;
}

const initial: Sim = { phase: 'idle', lit: blank(), cur: 'trigger', scope: null, choice: '', hint: '', next: '', runs: 0, startedAt: 0 };

export function useSim(plan: Plan, resetKey: string) {
  const [sim, setSim] = useState<Sim>(initial);
  const timers = useRef<number[]>([]);
  const planRef = useRef(plan);
  planRef.current = plan;

  const clear = () => { timers.current.forEach((t) => window.clearTimeout(t)); timers.current = []; };
  const T = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)); };
  const patch = useCallback((fn: (s: Sim) => Sim) => setSim(fn), []);

  const light = (id: string, st: NodeState, extra?: Partial<Sim>) =>
    patch((s) => ({ ...s, ...extra, lit: { ...s.lit, [id]: st }, cur: st === 'active' ? id : s.cur }));

  const grantFlow = useCallback((scope: Scope, choice: string, viaPrompt: boolean) => {
    const dur = viaPrompt ? 1 : 0;
    patch((s) => ({
      ...s, phase: planRef.current.mode === 'silent' ? 'silent' : 'granted', scope, choice, cur: 'decision',
      lit: { ...s.lit, prompt: viaPrompt ? 'done' : 'skip', decision: viaPrompt ? 'active' : 'skip', deny: 'skip', sees: 'skip', recover: 'skip' },
      hint: viaPrompt ? `You chose "${choice}".` : planRef.current.mode === 'silent' ? 'Nothing asked you. The data was taken the moment the page or app ran.' : 'No prompt exists here, so the data comes straight through.',
      next: 'Watch Data delivered light up. Press Revoke on the device to pull access back.',
    }));
    T(260 * dur, () => light('decision', 'done'));
    T(300 * dur + 120, () => patch((s) => ({ ...s, cur: 'allow', lit: { ...s.lit, allow: viaPrompt ? 'done' : 'skip' } })));
    T(300 * dur + 380, () => light('data', 'active'));
    T(300 * dur + 900, () => patch((s) => ({ ...s, lit: { ...s.lit, data: 'done', persist: 'active' }, cur: 'persist' })));
    T(300 * dur + 1500, () => patch((s) => ({ ...s, lit: { ...s.lit, persist: 'done', revoke: 'active' }, cur: 'revoke',
      next: planRef.current.mode === 'silent' ? 'Silent items have no prompt, so there is nothing to revoke except turning the feature off.' : 'Access is armed. Press Revoke on the device to see Revocation fire.' })));
  }, [patch]);

  const denyFlow = useCallback((choice: string) => {
    patch((s) => ({
      ...s, phase: 'denied', scope: 'deny', choice, cur: 'decision',
      lit: { ...s.lit, prompt: 'done', decision: 'active', allow: 'skip', data: 'skip', persist: 'skip', revoke: 'skip' },
      hint: `You chose "${choice}".`, next: 'The Deny branch lights up. The app gets an error and no data.',
    }));
    T(260, () => light('decision', 'done'));
    T(520, () => light('deny', 'done'));
    T(900, () => light('sees', 'active'));
    T(1500, () => patch((s) => ({ ...s, lit: { ...s.lit, sees: 'done', recover: 'active' }, cur: 'recover', next: 'Press Open Settings on the device to recover. That re-opens the Allow path.' })));
  }, [patch]);

  const afterChecks = useCallback(() => {
    const pl = planRef.current;
    if (pl.mode === 'blocked') {
      const failId = pl.checks.find((c) => !c.ok)?.id ?? 'c3';
      patch((s) => ({ ...s, phase: 'blocked', cur: failId, lit: { ...s.lit, [failId]: 'fail', prompt: 'skip', decision: 'skip', allow: 'skip', data: 'fail', persist: 'skip', revoke: 'skip', deny: 'skip', sees: 'skip', recover: 'skip' },
        hint: 'A check failed. The app gets nothing.', next: pl.blockedReason }));
      return;
    }
    if (pl.mode === 'prompt') {
      patch((s) => ({ ...s, phase: 'prompt', cur: 'prompt', lit: { ...s.lit, prompt: 'active' }, hint: 'All checks passed. The system shows a prompt.', next: 'Pick an option on the device. Allow lights Data delivered. Deny lights the Deny branch.' }));
    } else if (pl.mode === 'picker') {
      patch((s) => ({ ...s, phase: 'picker', cur: 'prompt', lit: { ...s.lit, prompt: 'active' }, hint: 'All checks passed. A picker opens.', next: 'Choose items and confirm. Only what you pick is shared.' }));
    } else if (pl.mode === 'settings') {
      patch((s) => ({ ...s, phase: 'settings', cur: 'prompt', lit: { ...s.lit, prompt: 'active' }, hint: 'There is no prompt. Access is a switch in Settings.', next: 'Turn the switch on in Settings. That lights Allow and Data delivered.' }));
    } else {
      patch((s) => ({ ...s, lit: { ...s.lit, prompt: 'skip' } }));
      grantFlow('full', 'auto', false);
    }
  }, [grantFlow, patch]);

  const trigger = useCallback(() => {
    clear();
    const pl = planRef.current;
    setSim((s) => ({ ...initial, runs: s.runs + 1, startedAt: Date.now(), phase: 'checking', cur: 'trigger', lit: { ...blank(), trigger: 'active' },
      hint: 'Trigger fired. Checks run one by one.', next: 'Each check lights up in turn. If all pass, the next step lights.' }));
    T(230, () => light('trigger', 'done'));
    pl.checks.forEach((c, i) => {
      T(300 + i * 230, () => light(c.id, 'active'));
      T(300 + i * 230 + 190, () => light(c.id, c.ok ? 'done' : 'fail'));
    });
    T(300 + pl.checks.length * 230 + 120, () => afterChecks());
  }, [afterChecks]);

  const choose = useCallback((o: Opt) => {
    if (o.allow) grantFlow(o.scope, o.label, true); else denyFlow(o.label);
  }, [grantFlow, denyFlow]);

  const settingsSet = useCallback((on: boolean) => {
    if (on) grantFlow('full', 'Switch on in Settings', true);
    else denyFlow('Switch off in Settings');
  }, [grantFlow, denyFlow]);

  const revoke = useCallback(() => {
    clear();
    patch((s) => ({ ...s, phase: 'revoked', cur: 'revoke', scope: null, lit: { ...s.lit, revoke: 'done', data: 'fail' },
      hint: 'Access revoked in Settings. The app lost it immediately.', next: 'The data stopped. Press the trigger again to start a new run.' }));
  }, [patch]);

  const reset = useCallback(() => { clear(); setSim(initial); }, []);

  // reset when the selection changes
  useEffect(() => {
    clear();
    setSim({ ...initial, hint: '', next: '' });
    const pl = planRef.current;
    if (pl.mode === 'silent' || pl.mode === 'blocked') T(350, () => trigger());
    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  return { sim, trigger, choose, settingsSet, revoke, reset };
}
