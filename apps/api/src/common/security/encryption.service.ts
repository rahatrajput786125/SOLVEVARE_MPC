import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createCipheriv, createDecipheriv,
  randomBytes, createHash,
} from "crypto";

// =============================================================================
// ENCRYPTION SERVICE
//
// Used to encrypt sensitive data before storing in DB:
//   - WordPress application passwords (publish config)
//   - Webhook signing secrets
//   - Third-party API keys stored per-org
//   - OAuth refresh tokens
//
// Algorithm: AES-256-GCM
// Why GCM over CBC?
//   - GCM is authenticated encryption — detects tampering (integrity check)
//   - CBC requires separate HMAC for integrity — more code, more risk
//   - GCM is the industry standard for symmetric encryption
//
// Key: 32-byte key from ENCRYPTION_KEY env var
// IV:  16 random bytes per encryption — never reuse IV with same key
// Output format: iv:authTag:ciphertext (all hex-encoded, colon-separated)
//
// IMPORTANT: ENCRYPTION_KEY must be exactly 32 characters.
// Validated in config.schema.ts at startup.
// Rotate key: decrypt all values with old key, re-encrypt with new key.
// =============================================================================

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(private readonly config: ConfigService) {
    const rawKey = config.get<string>("ENCRYPTION_KEY")!;
    // Derive a consistent 32-byte key from the config value
    // SHA-256 ensures exactly 32 bytes regardless of input length
    this.key = createHash("sha256").update(rawKey).digest();
  }

  // Encrypt a plaintext string → returns "iv:authTag:ciphertext"
  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    // Store as hex strings separated by colons
    return [
      iv.toString("hex"),
      authTag.toString("hex"),
      encrypted.toString("hex"),
    ].join(":");
  }

  // Decrypt "iv:authTag:ciphertext" → returns plaintext
  // Throws if data was tampered with (GCM auth tag mismatch)
  decrypt(encryptedData: string): string {
    const parts = encryptedData.split(":");
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted data format");
    }

    const [ivHex, authTagHex, ciphertextHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const ciphertext = Buffer.from(ciphertextHex, "hex");

    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);

    try {
      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);
      return decrypted.toString("utf8");
    } catch {
      // GCM auth tag mismatch = data was tampered with
      throw new Error("Decryption failed: data integrity check failed");
    }
  }

  // Encrypt a JSON object (for publish configs, webhook secrets)
  encryptObject(obj: Record<string, unknown>): string {
    return this.encrypt(JSON.stringify(obj));
  }

  decryptObject<T = Record<string, unknown>>(encrypted: string): T {
    return JSON.parse(this.decrypt(encrypted)) as T;
  }

  // Check if a string looks like encrypted data (for migration safety)
  isEncrypted(value: string): boolean {
    const parts = value.split(":");
    return (
      parts.length === 3 &&
      parts[0].length === IV_LENGTH * 2 &&
      parts[1].length === AUTH_TAG_LENGTH * 2
    );
  }
}
