import { signal } from '@preact/signals';
import type { Stamp } from './stamp';
import { fingerprint, isValid } from './stamp';

/** One checked export, kept on the grader's device. */
export interface LogEntry {
  id: string;
  t: number;
  z: number;
  fp: string;
  sig: string;
  valid: boolean;
  checkedAt: number;
}

const KEY = 'nanotrees:grading';

function load(): LogEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as LogEntry[];
  } catch {
    return [];
  }
}

export const gradingLog = signal<LogEntry[]>(load());

function save(entries: LogEntry[]) {
  gradingLog.value = entries;
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    /* storage full or blocked: the log lasts for this visit only */
  }
}

export interface CheckResult {
  stamp: Stamp;
  valid: boolean;
  fp: string;
  /** other student IDs whose checked export has the same tree */
  sameTreeAs: string[];
  /** this exact export was checked before */
  seenBefore: boolean;
}

export function check(stamp: Stamp): CheckResult {
  const valid = isValid(stamp);
  const fp = fingerprint(stamp.s, stamp.b);
  const entries = gradingLog.value;
  const seenBefore = entries.some((e) => e.sig === stamp.sig && e.id === stamp.id);
  if (!seenBefore) save([...entries, { id: stamp.id, t: stamp.t, z: stamp.z, fp, sig: stamp.sig, valid, checkedAt: Date.now() }]);
  const sameTreeAs = [...new Set(gradingLog.value.filter((e) => e.fp === fp && e.id !== stamp.id).map((e) => e.id))];
  return { stamp, valid, fp, sameTreeAs, seenBefore };
}

export function clearLog() {
  save([]);
}

/** Student IDs that share each tree fingerprint with at least one other ID. */
export function sharedTrees(entries: LogEntry[]): Map<string, string[]> {
  const by = new Map<string, Set<string>>();
  for (const e of entries) {
    if (!by.has(e.fp)) by.set(e.fp, new Set());
    by.get(e.fp)!.add(e.id);
  }
  const out = new Map<string, string[]>();
  for (const [fp, ids] of by) if (ids.size > 1) out.set(fp, [...ids]);
  return out;
}

export function logCsv(entries: LogEntry[]): string {
  const shared = sharedTrees(entries);
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = [['student_id', 'exported_utc', 'tree', 'valid', 'same_tree_as'].join(',')];
  for (const e of entries) {
    const others = (shared.get(e.fp) ?? []).filter((x) => x !== e.id).join(' ');
    rows.push([q(e.id), new Date(e.t * 60000).toISOString(), e.fp, e.valid ? 'yes' : 'NO', q(others)].join(','));
  }
  return rows.join('\n');
}
