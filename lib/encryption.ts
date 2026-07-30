import crypto from 'node:crypto';

// 32-byte key required for AES-256 — generate once with:
// node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
// then store as ENCRYPTION_KEY in .env.local (never commit it)
const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex');

export function encryptToken(plainText: string): string {
  const iv = crypto.randomBytes(12); // random each time, prevents identical tokens from encrypting to identical ciphertext
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag(); // verifies data wasn't tampered with

  // store iv + authTag + ciphertext together, colon-separated, so decrypt has everything it needs
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptToken(encryptedText: string): string {
  const [ivHex, authTagHex, dataHex] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(dataHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
