# NanoTrees, classroom edition

A fork of [NanoTrees](https://github.com/interprole/tree) (MIT) for assignments where students draw syntax trees and hand in printouts.

## What changed

**Export (students).** The export dialog asks for a student ID and offers only a stamped PNG (download or copy). SVG, PDF and LaTeX export are removed, since they would give an unstamped picture. Each PNG has

- the student ID repeated faintly across the whole image, so cropping does not remove it;
- the ID and a tree fingerprint together in one corner (the export time and check code are in the QR code);
- a QR code in another corner holding the tree as exported, the student ID, the time and a signature (HMAC-SHA256) over all of them.

**Sharing (off by default).** Files, share links and the clipboard can all carry trees from one student to another. This edition builds without them: Save to disk, Save as, Open from disk, keeping a file up to date, the Share button and the Copy bracket notation buttons are hidden; Ctrl+S and Ctrl+O only show a note; dropped files are not opened; and a share link opens the page without its trees. Copy, cut and paste still work inside the app (in the code and on the canvas, also between trees), but through the app's own clipboard: nothing copied in NanoTrees reaches other apps, and nothing copied elsewhere can be pasted into the code. Students' trees are still kept in their browser (My trees). This stops casual sharing, not a determined student, who can still retype a tree or read it off a screenshot. To turn sharing back on, build with `VITE_CLASS_SHARING=on` (on GitHub, the repository variable `CLASS_SHARING`).

**X-bar mode (off by default).** X-bar mode fills in XP → X′ → X projections by itself, which gives the answer away on X-bar assignments, so this edition builds without it: the Labelling switch and the X-bar example are hidden, and saved files or shared links that ask for X-bar mode open in manual mode. To turn it back on, build with `VITE_CLASS_XBAR=on` (on GitHub, the repository variable `CLASS_XBAR`). The checker notes any export that was made in X-bar mode.

**Checking (instructor).** Open `…/#check` (bookmark it) for the grading log and add photos or scans of printouts (several at once; on a phone you can take the photo from there), or paste the text a QR scanner reads from the code. One export opens with the student's tree loaded and a banner that says whether the signature is valid, whose export it is, and which other checked students handed in the same tree. Changing the ID, the time or the tree in the QR code makes the signature fail.

The QR code holds the tree itself, not a link, so a phone camera app shows only text starting with `NTV2:`; it does not open the checker. You can download the log as CSV. The log is kept in the browser of the device you check on.

The tree fingerprint depends only on the tree's structure and labels, not on the student or on how the code was typed. Identical fingerprints from different students are a lead, not proof: correct answers to an easy item will often be identical. Shared wrong trees are the stronger sign.

## Limits

- The signing secret is inside the page's JavaScript. The scheme stops a student who edits the ID in an image editor, pastes in someone else's footer, or prints a friend's file. It does not stop a student who digs the secret out of the source.
- A student can always retype a classmate's tree under their own ID. The stamp tells you who exported a tree, not who thought of it. Varying the sentence per student is what closes that gap.

## Setup

1. Fork this repository on GitHub.
2. Settings → Secrets and variables → Actions: add a repository **secret** `CLASS_SECRET` (any long random string), and optionally a **variable** `CLASS_NAME` (shown in the PNG footer, e.g. "Intro to Syntax, Fall 2026"). Set a variable `CLASS_XBAR` to `on` only if students may use X-bar mode, and `CLASS_SHARING` to `on` only if they may save and open .nanotrees files and use share links.
3. Settings → Pages → Source: **GitHub Actions**.
4. Push to `main` (or run the workflow by hand). The site appears at `https://<user>.github.io/<repo>/`.

Keep `CLASS_SECRET` unchanged for the whole term: exports signed under an old secret show as not valid.

Exports are checked with the signing secret of the copy you check on, so check on the same site the students use (or a copy built with the same `CLASS_SECRET`).

## Local build

```sh
npm ci
VITE_CLASS_SECRET='…' npm run dev                       # development
VITE_CLASS_SECRET='…' npx vite build --mode offline     # one self-contained nanotrees.html
```

Code for this edition: `src/classroom/` (signing, stamping, checker, grading log), `src/ui/ExportDialog.tsx`, and small hooks in `src/main.tsx`, `src/state.ts`, `src/ui/App.tsx`.
