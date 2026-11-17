import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import qrcode from 'qrcode-generator';
import { parse } from '../core/parser';
import { buildTree, defaultBuildOptions } from '../core/build';
import type { BuildOptions } from '../core/build';
import { serialize } from '../core/serialize';
import { CLASS_NAME, CLASS_SECRET } from './config';
import { base32, hmacSha256, sha256Hex } from './crypto';

/** What the QR code carries: who exported which tree, when, and a signature over all of it. */
export interface Stamp {
  v: 1;
  /** student ID as typed */
  id: string;
  /** export time, minutes since 1970 (UTC) */
  t: number;
  /** the student's time zone offset in minutes, only for display */
  z: number;
  /** tree code, build options and style, as NanoTrees saves them */
  s: string;
  b?: unknown;
  st?: unknown;
  /** signature */
  sig: string;
}

export const ID_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,39}$/u;
export const normId = (id: string) => id.trim().replace(/\s+/g, ' ');

function message(st: Omit<Stamp, 'sig'>): string {
  return JSON.stringify([st.v, st.id, st.t, st.s, st.b ?? null, st.st ?? null]);
}

export function sign(fields: Omit<Stamp, 'sig' | 'v'>): Stamp {
  const st = { v: 1 as const, ...fields };
  return { ...st, sig: base32(hmacSha256(CLASS_SECRET, message(st)), 10) };
}

export function isValid(st: Stamp): boolean {
  return st.v === 1 && st.sig === base32(hmacSha256(CLASS_SECRET, message(st)), 10);
}

export const prettyCode = (sig: string) => sig.slice(0, 5) + '-' + sig.slice(5);

/**
 * Fingerprint of the tree's structure: the same for the same tree however the code was typed
 * (spacing, line breaks), different as soon as a label or a branch differs. It does not depend
 * on the student, so identical trees from different students share it.
 */
export function fingerprint(s: string, b?: unknown): string {
  let canon = s;
  try {
    const r = parse(s);
    if (r.ok) {
      const opts = { ...defaultBuildOptions, ...((b as Partial<BuildOptions>) ?? {}) } as BuildOptions;
      const tr = buildTree(r.doc, opts);
      if (tr) canon = serialize(tr);
    }
  } catch {
    /* fall back to the raw code */
  }
  return sha256Hex(canon.replace(/\s+/g, ' ').trim()).slice(0, 8).toUpperCase();
}

/* ------------------------------------------------------------ QR payload */

export function encodePayload(st: Stamp): string {
  return compressToEncodedURIComponent(JSON.stringify(st));
}

export function decodePayload(p: string): Stamp | null {
  try {
    const json = decompressFromEncodedURIComponent(p);
    if (!json) return null;
    const st = JSON.parse(json) as Stamp;
    return st && st.v === 1 && typeof st.id === 'string' && typeof st.s === 'string' && typeof st.sig === 'string' ? st : null;
  } catch {
    return null;
  }
}

/** The text in the QR code: a link back to this page when it is online, so a phone camera opens the checker. */
export function qrText(st: Stamp): string {
  const p = encodePayload(st);
  if (/^https?:$/.test(location.protocol)) return `${location.origin}${location.pathname}#v=${p}`;
  return `NTV1:${p}`;
}

/** Reads a stamp from scanned QR text or a pasted link. */
export function stampFromText(text: string): Stamp | null {
  const m = /#v=([A-Za-z0-9+\-$]+)/.exec(text) ?? /NTV1:([A-Za-z0-9+\-$]+)/.exec(text);
  return m ? decodePayload(m[1]) : null;
}

/* ------------------------------------------------------------ dates */

export function formatTime(t: number, z: number): string {
  const d = new Date((t - z) * 60000);
  const p = (n: number) => String(n).padStart(2, '0');
  const off = -z;
  const sign = off >= 0 ? '+' : '−';
  const oz = `UTC${sign}${p(Math.floor(Math.abs(off) / 60))}:${p(Math.abs(off) % 60)}`;
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} (${oz})`;
}

/* ------------------------------------------------------------ stamped PNG */

/**
 * Puts the tree on white, with the student ID faintly repeated behind it, and adds a footer
 * with the ID, time, tree fingerprint, check code and QR code.
 * `treePng` must have a transparent background, so the watermark shows through.
 */
export async function stampPng(treePng: Blob, scale: number, st: Stamp): Promise<Blob> {
  const img = await createImageBitmap(treePng);
  const u = scale;
  const pad = Math.round(16 * u);

  const qr = qrcode(0, 'M');
  qr.addData(qrText(st), 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const cell = Math.max(2, Math.round((118 * u) / (n + 8)));
  const qrSize = cell * (n + 8);

  const textW = Math.round(330 * u);
  const W = Math.max(img.width + 2 * pad, textW + qrSize + 3 * pad);
  const footerH = qrSize + 2 * pad;
  const H = img.height + 2 * pad + footerH;

  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // watermark behind the tree: the ID on a diagonal, light enough not to get in the way
  const treeTop = pad;
  const treeH = img.height;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, treeTop + treeH + pad);
  ctx.clip();
  ctx.translate(W / 2, treeTop + treeH / 2);
  ctx.rotate(-Math.PI / 9);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.045)';
  ctx.font = `600 ${Math.round(18 * u)}px system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const mark = st.id;
  const step = ctx.measureText(mark).width + 70 * u;
  const rowH = 54 * u;
  const span = Math.hypot(W, treeH + 2 * pad);
  for (let y = -span / 2, row = 0; y <= span / 2; y += rowH, row++) {
    for (let x = -span / 2 + (row % 2) * (step / 2); x <= span / 2; x += step) ctx.fillText(mark, x, y);
  }
  ctx.restore();

  ctx.drawImage(img, Math.round((W - img.width) / 2), treeTop);

  // footer
  const fy = img.height + 2 * pad;
  ctx.fillStyle = '#f3f3f1';
  ctx.fillRect(0, fy, W, footerH);
  ctx.fillStyle = '#9a9a96';
  ctx.fillRect(0, fy, W, Math.max(1, Math.round(u)));

  const qx = W - pad - qrSize;
  const qy = fy + pad;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(qx, qy, qrSize, qrSize);
  ctx.fillStyle = '#000000';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) ctx.fillRect(qx + (k + 4) * cell, qy + (r + 4) * cell, cell, cell);

  const font = (px: number, w = 400) => `${w} ${Math.round(px * u)}px system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const tx = pad;
  const maxW = qx - 2 * pad;
  let y = qy + 18 * u;
  ctx.fillStyle = '#111111';
  ctx.font = font(17, 650);
  ctx.fillText(`Student ID: ${st.id}`, tx, y, maxW);
  y += 24 * u;
  ctx.font = font(13);
  ctx.fillStyle = '#333333';
  ctx.fillText(`Exported ${formatTime(st.t, st.z)}`, tx, y, maxW);
  y += 20 * u;
  ctx.fillText(`Tree ${fingerprint(st.s, st.b)}    Check code ${prettyCode(st.sig)}`, tx, y, maxW);
  y += 26 * u;
  ctx.font = font(11);
  ctx.fillStyle = '#6b6b66';
  ctx.fillText(`${CLASS_NAME}. Scan the QR code to verify this export.`, tx, y, maxW);

  return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG encoding failed'))), 'image/png'));
}
