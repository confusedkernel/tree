/**
 * Classroom edition settings.
 *
 * CLASS_SECRET signs every export. Set it at build time with the environment variable
 * VITE_CLASS_SECRET (e.g. a GitHub Actions repository secret). Changing it makes every code
 * signed under the old secret show as "not valid", so keep it for the whole term.
 *
 * Note: the secret ships inside the page's JavaScript. It stops ordinary tampering (editing the
 * ID in an image editor, pasting someone else's QR code), not a student who reads the source.
 */
export const CLASS_SECRET: string = (import.meta.env.VITE_CLASS_SECRET as string | undefined) || 'nanotrees-classroom-default-secret';
export const CLASS_NAME: string = (import.meta.env.VITE_CLASS_NAME as string | undefined) || 'NanoTrees classroom edition';
/**
 * X-bar mode completes XP → X′ → X projections by itself, which gives away the answer on X-bar
 * assignments. It is off unless the site is built with VITE_CLASS_XBAR=on. While off, the mode
 * is hidden and any saved file, link or example that asks for it opens in manual mode.
 */
export const XBAR_ENABLED: boolean = import.meta.env.VITE_CLASS_XBAR === 'on';
export const USING_DEFAULT_SECRET = !import.meta.env.VITE_CLASS_SECRET;
