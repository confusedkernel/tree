import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import qrcode from 'qrcode-generator';
import { parse } from '../core/parser';
import { buildTree, defaultBuildOptions } from '../core/build';
import type { BuildOptions } from '../core/build';
import { serialize } from '../core/serialize';
import { CLASS_SECRET } from './config';
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

/** How much smaller (as a fraction of the area) a layout using a top corner must make the image to be picked. */
const TOP_CORNER_GAIN = 0.9;

/**
 * Puts the tree on white with the student ID faintly repeated across the image, and two blocks in
 * corners of the image: the QR code, and the ID with the tree fingerprint. They go in the bottom
 * corners (QR code on the right by default) or, when that makes the image clearly smaller, a top
 * corner, using empty space beside the tree where there is room.
 * `treePng` must have a transparent background, so the watermark shows through.
 */
export async function stampPng(treePng: Blob, scale: number, st: Stamp): Promise<Blob> {
  const img = await createImageBitmap(treePng);
  const u = scale;
  const pad = Math.round(10 * u);
  const gap = Math.round(8 * u); // clearance between the tree and the corner blocks

  // the tree's drawn pixels: crop its transparent margins and find where the corners can go
  const src = document.createElement('canvas');
  src.width = img.width;
  src.height = img.height;
  const sctx = src.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(img, 0, 0);
  const alpha = sctx.getImageData(0, 0, img.width, img.height).data;
  const ink = (x: number, y: number) => alpha[(y * img.width + x) * 4 + 3] > 8;
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
  const colTop = new Int32Array(img.width).fill(-1); // first and last inked row of each column
  const colBot = new Int32Array(img.width).fill(-1);
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      if (ink(x, y)) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
        if (colTop[x] < 0) colTop[x] = y;
        colBot[x] = y;
      }
  if (x1 < 0) (x0 = 0), (y0 = 0), (x1 = img.width - 1), (y1 = img.height - 1);
  const tw = x1 - x0 + 1;
  const th = y1 - y0 + 1;

  const qr = qrcode(0, 'M');
  qr.addData(qrText(st), 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 2; // modules of white around the code, kept clear of the watermark
  const cell = Math.max(2, Math.round((76 * u) / (n + 2 * quiet)));
  const qrSize = cell * (n + 2 * quiet);

  const font = (px: number, w = 400) => `${w} ${Math.round(px * u)}px system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif`;
  const idText = `Student ID: ${st.id}`;
  const hashText = `Tree ${fingerprint(st.s, st.b)}`;
  sctx.font = font(11.5, 650);
  const idW = sctx.measureText(idText).width;
  sctx.font = font(9.5);
  const textW = Math.ceil(Math.max(idW, sctx.measureText(hashText).width));
  const textH = Math.round(32 * u);

  // Try every pair of corners for the two blocks and keep the smallest image. A block in a corner
  // that the tree reaches pushes the image taller by just enough to clear the tree.
  type Corner = { top: boolean; left: boolean };
  type Placed = { corner: Corner; w: number; h: number; x: number; y: number };
  const corners: Corner[] = [
    { top: false, left: false },
    { top: false, left: true },
    { top: true, left: false },
    { top: true, left: true },
  ];
  // how many rows of canvas columns a..b the tree's ink covers, counted from the tree's bottom edge
  // (for a block in a top corner) or from its top edge (for a block in a bottom corner)
  const reach = (W: number, a: number, b: number, forTop: boolean) => {
    const tx = Math.round((W - tw) / 2);
    let r = -Infinity;
    for (let x = Math.max(x0, a - gap - tx + x0); x <= Math.min(x1, b + gap - tx + x0); x++) {
      if (colTop[x] < 0) continue;
      r = Math.max(r, forTop ? y1 - colTop[x] + 1 : colBot[x] - y0 + 1);
    }
    return r;
  };
  let best: { W: number; H: number; score: number; top: number; blocks: Placed[] } | null = null;
  for (const qc of corners)
    for (const tc of corners) {
      if (qc === tc) continue;
      // never narrower than the two blocks side by side, so small trees get a tidy row underneath
      const W = Math.max(tw + 2 * pad, qrSize + textW + 3 * pad);
      let extraTop = 0;
      let extraBottom = 0;
      const blocks: Placed[] = [
        { corner: qc, w: qrSize, h: qrSize, x: 0, y: 0 },
        { corner: tc, w: textW, h: textH, x: 0, y: 0 },
      ];
      for (const bl of blocks) {
        bl.x = bl.corner.left ? pad : W - pad - bl.w;
        // rows free of ink at the block's edge of the tree, in the block's columns
        const free = th - reach(W, bl.x, bl.x + bl.w, bl.corner.top);
        const need = Math.max(0, bl.h + gap - free);
        if (bl.corner.top) extraTop = Math.max(extraTop, need);
        else extraBottom = Math.max(extraBottom, need);
      }
      // the blocks must fit between top and bottom too, one above the other when their columns overlap
      const [q, t] = blocks;
      const overlap = q.x < t.x + t.w + gap && t.x < q.x + q.w + gap;
      const stacked = overlap ? qrSize + gap + textH : Math.max(qrSize, textH);
      extraBottom += Math.max(0, stacked - (extraTop + th + extraBottom));
      const H = pad + extraTop + th + extraBottom + pad;
      for (const bl of blocks) bl.y = bl.corner.top ? pad : H - pad - bl.h;
      // bottom corners are the default; a top corner has to make the image at least 10% smaller
      const score = (W * H) / (qc.top || tc.top ? TOP_CORNER_GAIN : 1);
      if (!best || score < best.score) best = { W, H, score, top: pad + extraTop, blocks };
    }
  const { W, H, top: ty, blocks } = best!;
  const tx = Math.round((W - tw) / 2);
  const [qb, tb] = blocks;

  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // watermark over the whole image: the ID on a diagonal, light enough not to get in the way
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-Math.PI / 9);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.045)';
  ctx.font = font(18, 600);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const step = ctx.measureText(st.id).width + 70 * u;
  const rowH = 54 * u;
  const span = Math.hypot(W, H);
  for (let y = -span / 2, row = 0; y <= span / 2; y += rowH, row++) {
    for (let x = -span / 2 + (row % 2) * (step / 2); x <= span / 2; x += step) ctx.fillText(st.id, x, y);
  }
  ctx.restore();

  ctx.drawImage(img, x0, y0, tw, th, tx, ty, tw, th);

  // QR code
  const qx = qb.x;
  const qy = qb.y;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(qx, qy, qrSize, qrSize);
  ctx.fillStyle = '#000000';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) ctx.fillRect(qx + (k + quiet) * cell, qy + (r + quiet) * cell, cell, cell);

  // ID with the tree fingerprint under it, flush with the side of the image they sit on
  const left = tb.corner.left;
  const textX = left ? tb.x : tb.x + tb.w;
  const textBottom = tb.y + tb.h - quiet * cell;
  ctx.textAlign = left ? 'left' : 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = '#333333';
  ctx.font = font(9.5);
  ctx.fillText(hashText, textX, textBottom);
  ctx.fillStyle = '#111111';
  ctx.font = font(11.5, 650);
  ctx.fillText(idText, textX, textBottom - Math.round(15 * u));

  return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG encoding failed'))), 'image/png'));
}
