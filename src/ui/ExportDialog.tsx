import { useSignal } from '@preact/signals';
import { serialize } from '../core/serialize';
import { copyText, download, fileBase, pngBlob } from '../export';
import { t } from '../i18n';
import { activeTree, currentName, modal, scene, showToast, snapshot, source, tree, trees } from '../state';
import { Modal, Seg } from './controls';
import { ICopy, IDownload } from './icons';
import { ID_PATTERN, normId, sign, stampPng } from '../classroom/stamp';

/**
 * Classroom edition: the only image export is a PNG stamped with the student ID, the time,
 * the tree's fingerprint, a check code and a QR code. SVG, PDF and LaTeX are switched off,
 * since they would give an unstamped picture.
 */

const ID_KEY = 'nanotrees:studentId';
const savedId = () => {
  try {
    return localStorage.getItem(ID_KEY) ?? '';
  } catch {
    return '';
  }
};

export function ExportDialog() {
  const scale = useSignal(3);
  const busy = useSignal(false);
  const studentId = useSignal(savedId());
  const touched = useSignal(false);
  const sc = scene.value;
  const tr = tree.value;
  const close = () => (modal.value = null);
  const many = trees.value.length > 1;
  const base = fileBase(sc, many ? activeTree.value.name : currentName.value);

  const id = normId(studentId.value);
  const idOk = ID_PATTERN.test(id);

  const stamped = async () => {
    const snap = snapshot();
    const now = new Date();
    const st = sign({ id, t: Math.floor(now.getTime() / 60000), z: now.getTimezoneOffset(), s: snap.s, b: snap.b, st: snap.st });
    try {
      localStorage.setItem(ID_KEY, id);
    } catch {
      /* not remembered */
    }
    return stampPng(await pngBlob(sc!, scale.value, true), scale.value, st);
  };

  const run = async (f: () => Promise<void>) => {
    touched.value = true;
    if (!sc || !idOk) return;
    busy.value = true;
    try {
      await f();
    } catch (e) {
      showToast(String((e as Error).message ?? e));
    } finally {
      busy.value = false;
    }
  };

  const safeId = id.replace(/[^\p{L}\p{N}_-]+/gu, '-');

  return (
    <Modal title={many ? `${t('exportTitle')}: ${activeTree.value.name}` : t('exportTitle')} onClose={close}>
      {many && <p class="hint">Exports the tree that is being edited. Click another tree on the canvas to export it.</p>}
      {!sc && <p class="hint">{t('emptyDoc')}</p>}
      {sc && (
        <div class="export-image">
          <label class="student-id">
            <span>Student ID</span>
            <input
              type="text"
              value={studentId.value}
              onInput={(e) => (studentId.value = (e.currentTarget as HTMLInputElement).value)}
              onBlur={() => (touched.value = true)}
              placeholder="e.g. B11202033"
              maxLength={40}
              autoComplete="off"
              spellcheck={false}
              aria-invalid={touched.value && !idOk}
            />
          </label>
          {touched.value && !idOk && <p class="hint check-warn">Enter your student ID (letters and numbers, up to 40 characters).</p>}
          <p class="hint">Your ID, the time and a QR code are printed under the tree, and your ID is repeated faintly behind it.</p>
          <div class="card">
            <h4>PNG</h4>
            <Seg label={t('scale')} small value={String(scale.value)} onChange={(v) => (scale.value = Number(v))} options={[2, 3, 4].map((x) => ({ v: String(x), label: `${x}× · ${Math.round(x * 96)} dpi` }))} />
            <button class="btn primary" disabled={busy.value || (touched.value && !idOk)} onClick={() => run(async () => download(await stamped(), `${base}-${safeId}.png`))}>
              <IDownload size={16} /> {t('downloadPng')}
            </button>
            <button
              class="btn"
              disabled={busy.value || (touched.value && !idOk)}
              onClick={() =>
                run(async () => {
                  try {
                    await navigator.clipboard.write([new ClipboardItem({ 'image/png': stamped() })]);
                    showToast(t('copied'));
                  } catch {
                    showToast('Clipboard not available');
                  }
                })
              }
            >
              <ICopy size={16} /> {t('copyImage')}
            </button>
          </div>
          <div class="row wrap">
            <button class="btn" onClick={async () => (await copyText(source.value)) && showToast(t('copied'))}>
              <ICopy size={16} /> {t('copyBrackets')}
            </button>
            {tr && (
              <button class="btn" onClick={async () => (await copyText(serialize(tr))) && showToast(t('copied'))}>
                <ICopy size={16} /> {t('copyBracketsShown')}
              </button>
            )}
          </div>
          {busy.value && <p class="hint">{t('exporting')}</p>}
        </div>
      )}
    </Modal>
  );
}
