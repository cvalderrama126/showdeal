'use strict';

const {
  generateSecureToken,
  generateSecureRandomString,
  hashPassword,
  verifyPassword,
  hashFileIntegrity,
  generateHMAC,
  verifyHMAC,
  encryptAES,
  decryptAES,
  generateAESKey,
  secureCompare,
  validateCryptoKey,
  legacySha256,
} = require('../src/utils/crypto.utils');

describe('utils/crypto.utils', () => {
  describe('generateSecureToken', () => {
    it('returns a hex string of the requested byte length', () => {
      const token = generateSecureToken(16);
      expect(token).toMatch(/^[0-9a-f]+$/);
      expect(token).toHaveLength(32); // 16 bytes => 32 hex chars
    });

    it('defaults to 32 bytes (64 hex chars)', () => {
      expect(generateSecureToken()).toHaveLength(64);
    });

    it('produces unique values', () => {
      expect(generateSecureToken()).not.toBe(generateSecureToken());
    });
  });

  describe('generateSecureRandomString', () => {
    it('returns a URL-safe base64 string', () => {
      const s = generateSecureRandomString(24);
      expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe('hashPassword / verifyPassword', () => {
    it('hashes and verifies a password', async () => {
      const hash = await hashPassword('s3cret!', 4);
      expect(hash).not.toBe('s3cret!');
      expect(await verifyPassword('s3cret!', hash)).toBe(true);
      expect(await verifyPassword('wrong', hash)).toBe(false);
    });

    it('coerces nullish passwords to empty string', async () => {
      const hash = await hashPassword(null, 4);
      expect(await verifyPassword('', hash)).toBe(true);
    });
  });

  describe('hashFileIntegrity', () => {
    it('returns a stable SHA-256 hex digest', () => {
      const a = hashFileIntegrity('hello');
      const b = hashFileIntegrity('hello');
      expect(a).toBe(b);
      expect(a).toHaveLength(64);
    });

    it('differs for different input', () => {
      expect(hashFileIntegrity('a')).not.toBe(hashFileIntegrity('b'));
    });
  });

  describe('generateHMAC / verifyHMAC', () => {
    it('generates and verifies an HMAC', () => {
      const mac = generateHMAC('payload', 'key');
      expect(verifyHMAC('payload', 'key', mac)).toBe(true);
    });

    it('fails verification with a wrong key', () => {
      const mac = generateHMAC('payload', 'key');
      expect(verifyHMAC('payload', 'otherkey', mac)).toBe(false);
    });
  });

  describe('encryptAES / decryptAES', () => {
    it('round-trips plaintext with a derived key', () => {
      const cipher = encryptAES('top secret', 'my-key');
      expect(cipher.split(':')).toHaveLength(3);
      expect(decryptAES(cipher, 'my-key')).toBe('top secret');
    });

    it('round-trips with a full 32-byte hex key', () => {
      const key = generateAESKey();
      const cipher = encryptAES('data', key);
      expect(decryptAES(cipher, key)).toBe('data');
    });

    it('throws on malformed encrypted data', () => {
      expect(() => decryptAES('bad-format', 'key')).toThrow('Invalid encrypted data format');
    });

    it('throws when decrypting with the wrong key', () => {
      const cipher = encryptAES('data', 'key-a');
      expect(() => decryptAES(cipher, 'key-b')).toThrow('Failed to decrypt');
    });
  });

  describe('generateAESKey', () => {
    it('returns a 32-byte hex key (64 chars)', () => {
      expect(generateAESKey()).toHaveLength(64);
    });
  });

  describe('secureCompare', () => {
    it('returns true for equal strings', () => {
      expect(secureCompare('abc', 'abc')).toBe(true);
    });

    it('returns false for different strings', () => {
      expect(secureCompare('abc', 'abd')).toBe(false);
    });

    it('returns false for different lengths', () => {
      expect(secureCompare('abc', 'abcd')).toBe(false);
    });

    it('returns false for non-string input', () => {
      expect(secureCompare(123, 'abc')).toBe(false);
      expect(secureCompare('abc', null)).toBe(false);
    });
  });

  describe('validateCryptoKey', () => {
    it('accepts a strong random key', () => {
      expect(validateCryptoKey(generateAESKey())).toBe(true);
    });

    it('rejects non-string or empty keys', () => {
      expect(validateCryptoKey(null)).toBe(false);
      expect(validateCryptoKey('')).toBe(false);
    });

    it('rejects keys shorter than the minimum byte length', () => {
      expect(validateCryptoKey('ab')).toBe(false);
    });

    it('rejects weak patterns', () => {
      expect(validateCryptoKey('0'.repeat(64))).toBe(false);
      expect(validateCryptoKey('f'.repeat(64))).toBe(false);
      expect(validateCryptoKey('mysecretkey'.padEnd(64, 'x'))).toBe(false);
    });
  });

  describe('legacySha256', () => {
    it('returns a SHA-256 hex digest', () => {
      const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const hash = legacySha256('data');
      expect(hash).toHaveLength(64);
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
