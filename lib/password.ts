import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const derive = (pw: string, salt: Buffer) =>
  new Promise<Buffer>((res, rej) => scrypt(pw, salt, 64, (e, k) => (e ? rej(e) : res(k))));

// Stored as "salt:hash" (hex). scrypt is slow on purpose, which protects against guessing.
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${(await derive(pw, salt)).toString('hex')}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [s, k] = stored.split(':');
  if (!s || !k) return false;
  const want = Buffer.from(k, 'hex');
  const got = await derive(pw, Buffer.from(s, 'hex'));
  return want.length === got.length && timingSafeEqual(want, got);
}

// SECURITY: unknown emails must cost the same time as known ones, or response timing reveals
// which accounts exist. The dummy hash is made once, on first use, then cached.
let dummy: Promise<string> | null = null;
export async function verifyDummy(pw: string): Promise<boolean> {
  dummy ??= hashPassword(randomBytes(16).toString('hex'));
  await verifyPassword(pw, await dummy);
  return false; // always false: there is no real account behind it
}
