import { z } from 'zod';

// SECURITY: only plain web links may be stored. z.string().url() also accepts
// javascript: and data: URLs, which become stored XSS the day a link is rendered.
export function isHttpUrl(s: string): boolean {
  try {
    const p = new URL(s).protocol;
    return p === 'http:' || p === 'https:';
  } catch {
    return false;
  }
}

// Returns the URL if it is http(s), otherwise null.
export const safeUrl = (s: string | null | undefined): string | null => (s && isHttpUrl(s) ? s : null);

export const httpUrl = z.string().max(500).refine(isHttpUrl, 'Only http(s) links are allowed.');

// SECURITY: ids in URLs must look like our ids (cuid-style) before they reach the database.
export const idParam = z.string().regex(/^[A-Za-z0-9_-]{10,60}$/);
export const isValidId = (s: unknown): s is string => idParam.safeParse(s).success;
