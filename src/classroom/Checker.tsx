import { signal, useSignal } from '@preact/signals';
import jsQR from 'jsqr';
import { download } from '../export';
import { autosavePaused, restore } from '../state';
import { Modal } from '../ui/controls';
import { IClose } from '../ui/icons';
import { USING_DEFAULT_SECRET, XBAR_ENABLED } from './config';
import type { CheckResult } from './grading';
import { check, clearLog, gradingLog, logCsv, sharedTrees } from './grading';
import type { Stamp } from './stamp';
import { formatTime, prettyCode, stampFromText } from './stamp';

/** The export being checked (shown in the banner), and whether the grading log is open. */
export const checking = signal<CheckResult | null>(null);
export const logOpen = signal(false);
export function openStamp(st: Stamp) {
  // the grader's own autosaved tree is left alone
  autosavePaused.value = true;
  restore({ s: st.s, b: st.b as never, st: st.st as never });
  checking.value = check(st);
}

/** Called before the app starts: a link from an older printout's QR code (#v=…) opens the checker. */
export function readCheckLink(): Stamp | null {
  if (!/[#&]v=/.test(location.hash)) return null;
  return stampFromText(location.hash);
}

async function decodeImage(file: File): Promise<string | null> {
  const bmp = await createImageBitmap(file);
  // phone photos are large: try a reduced copy first, then full size
  for (const max of [1600, 3200, Infinity]) {
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * k);
    const h = Math.round(bmp.height * k);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bmp, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    const r = jsQR(data.data, w, h, { inversionAttempts: 'dontInvert' });
    if (r?.data) return r.data;
    if (k === 1) break;
  }
  return null;
}

export function CheckBanner() {
  const r = checking.value;
  if (!r) return null;
  const st = r.stamp;
  return (
    <div class={`check-banner ${r.valid ? 'ok' : 'bad'}`} role="status">
      <div class="check-main">
        <strong class="check-verdict">{r.valid ? '✓ Valid export' : '✗ Not valid: this export was altered or made with another copy of the tool'}</strong>
        <span>
          Student ID <b>{st.id}</b>, exported {formatTime(st.t, st.z)}
        </span>
        <span>
          Tree <code>{r.fp}</code>, check code <code>{prettyCode(st.sig)}</code>
        </span>
        {r.sameTreeAs.length > 0 && <span class="check-warn">Same tree as checked exports from: {r.sameTreeAs.join(', ')}</span>}
        {(st.b as { mode?: string } | undefined)?.mode === 'xbar' && (
          <span class="check-warn">
            Exported in X-bar mode: the X′ levels were filled in by the tool.{!XBAR_ENABLED && ' The tree below is shown in manual mode, as the student typed it.'}
          </span>
        )}
        {r.seenBefore && <span class="check-note">This export was already checked on this device.</span>}
        <span class="check-note">Compare the tree below with the printed one: the QR code holds the tree as exported.</span>
      </div>
      <div class="check-actions">
        <button class="btn" onClick={() => (logOpen.value = true)}>
          Grading log ({gradingLog.value.length})
        </button>
        <button class="icon-btn" onClick={() => (checking.value = null)} title="Close" aria-label="Close">
          <IClose size={16} />
        </button>
      </div>
    </div>
  );
}

export function GradingLog() {
  const busy = useSignal(false);
  const status = useSignal('');
  const entries = gradingLog.value;
  const shared = sharedTrees(entries);
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    busy.value = true;
    let ok = 0;
    const failed: string[] = [];
    let last: Stamp | null = null;
    for (const f of [...files]) {
      try {
        const text = await decodeImage(f);
        const st = text ? stampFromText(text) : null;
        if (st) {
          check(st);
          last = st;
          ok++;
        } else failed.push(f.name);
      } catch {
        failed.push(f.name);
      }
    }
    busy.value = false;
    status.value = `Read ${ok} code${ok === 1 ? '' : 's'}.` + (failed.length ? ` No code found in: ${failed.join(', ')}` : '');
    if (ok === 1 && last && !failed.length) {
      openStamp(last);
      logOpen.value = false;
    }
  };
  const onPaste = (text: string) => {
    const st = stampFromText(text);
    if (st) {
      openStamp(st);
      logOpen.value = false;
    } else status.value = 'That text holds no check code.';
  };
  const sorted = [...entries].sort((a, b) => (shared.has(b.fp) ? 1 : 0) - (shared.has(a.fp) ? 1 : 0) || a.fp.localeCompare(b.fp) || a.id.localeCompare(b.id));
  return (
    <Modal title="Grading log" onClose={() => (logOpen.value = false)} wide>
      <p class="hint">
        Add photos or scans of the printouts (on a phone, you can take the photo right here), or paste the text of a QR code. Every export you check is
        listed below; trees shared by more than one student come first. The log stays on this device only.
      </p>
      {USING_DEFAULT_SECRET && <p class="check-warn">This copy uses the default signing secret. Set VITE_CLASS_SECRET when you build it (see CLASSROOM.md).</p>}
      <div class="row wrap">
        <label class="btn primary">
          Add photos or scans…
          <input type="file" accept="image/*" multiple hidden onChange={(e) => onFiles((e.currentTarget as HTMLInputElement).files)} />
        </label>
        <input
          class="check-paste"
          type="text"
          placeholder="…or paste the text of a QR code"
          onKeyDown={(e) => e.key === 'Enter' && onPaste((e.currentTarget as HTMLInputElement).value)}
          onPaste={(e) => onPaste(e.clipboardData?.getData('text') ?? '')}
        />
      </div>
      {(busy.value || status.value) && <p class="hint">{busy.value ? 'Reading images…' : status.value}</p>}
      {sorted.length > 0 ? (
        <div class="check-table-wrap">
          <table class="check-table">
            <thead>
              <tr>
                <th>Student ID</th>
                <th>Exported</th>
                <th>Tree</th>
                <th>Valid</th>
                <th>Same tree as</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((e) => {
                const others = (shared.get(e.fp) ?? []).filter((x) => x !== e.id);
                return (
                  <tr key={e.sig + e.id} class={!e.valid ? 'bad' : others.length ? 'warn' : ''}>
                    <td>{e.id}</td>
                    <td>{formatTime(e.t, e.z)}</td>
                    <td>
                      <code>{e.fp}</code>
                    </td>
                    <td>{e.valid ? 'yes' : 'NO'}</td>
                    <td>{others.join(', ')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p class="hint">Nothing checked yet.</p>
      )}
      <div class="row wrap">
        <button class="btn" disabled={!entries.length} onClick={() => download(logCsv(entries), 'grading-log.csv', 'text/csv')}>
          Download CSV
        </button>
        <button
          class="btn ghost"
          disabled={!entries.length}
          onClick={() => {
            if (confirm('Clear the grading log on this device?')) clearLog();
          }}
        >
          Clear log
        </button>
      </div>
      <p class="hint">
        A shared tree is a lead, not proof: on an easy item many correct answers will be identical. Shared <em>wrong</em> trees, or the same unusual choices, are
        the stronger sign.
      </p>
    </Modal>
  );
}
