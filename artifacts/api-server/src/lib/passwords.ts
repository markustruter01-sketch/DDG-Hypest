import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const SALT_BYTES = 16;
const KEY_BYTES = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 } as const;

function scryptAsync(password: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, SCRYPT_OPTIONS, (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(derivedKey);
    });
  });
}

/** salt and hash stored together. Never store the raw password. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await scryptAsync(password, salt, KEY_BYTES);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }

  const salt = Buffer.from(parts[1] ?? "", "hex");
  const expected = Buffer.from(parts[2] ?? "", "hex");
  if (salt.length !== SALT_BYTES || expected.length !== KEY_BYTES) {
    return false;
  }

  const actual = await scryptAsync(password, salt, expected.length);
  if (actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(actual, expected);
}
