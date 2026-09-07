import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "crypto";

// =============================================================================
// WEBHOOK SIGNATURE SERVICE
//
// Verifies HMAC-SHA256 signatures on incoming webhooks.
// Used for:
//   - Stripe webhooks (billing events)
//   - GitHub webhooks (CI/CD triggers)
//   - Any external service that signs their webhooks
//
// Why HMAC verification?
// Without it, anyone can POST to your webhook endpoint and fake events.
// With it, only the service that knows the secret can produce a valid signature.
//
// Timing-safe comparison:
// Regular string comparison (===) leaks timing information.
// An attacker can measure response time to guess the signature byte by byte.
// timingSafeEqual() always takes the same time regardless of where strings differ.
//
// Stripe signature format:
//   Stripe-Signature: t=1614556800,v1=abc123...
//   Payload: timestamp + "." + body
//
// Generic HMAC format:
//   X-Signature: sha256=abc123...
//   Payload: raw request body
// =============================================================================

@Injectable()
export class WebhookSignatureService {
  // Verify a generic HMAC-SHA256 signature
  // Header format: "sha256=<hex_signature>"
  verifyHmac(
    rawBody: Buffer,
    signatureHeader: string,
    secret: string
  ): void {
    if (!signatureHeader) {
      throw new UnauthorizedException("Missing webhook signature");
    }

    const [scheme, receivedSig] = signatureHeader.split("=");

    if (scheme !== "sha256" || !receivedSig) {
      throw new UnauthorizedException("Invalid signature format");
    }

    const expectedSig = createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    // Timing-safe comparison — prevents timing attacks
    const expected = Buffer.from(expectedSig, "hex");
    const received = Buffer.from(receivedSig, "hex");

    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw new UnauthorizedException("Webhook signature mismatch");
    }
  }

  // Verify Stripe webhook signature
  // Stripe format: "t=<timestamp>,v1=<signature>"
  // Stripe payload: "<timestamp>.<raw_body>"
  verifyStripe(
    rawBody: Buffer,
    stripeSignatureHeader: string,
    webhookSecret: string,
    toleranceSeconds = 300 // 5 minutes — reject old events
  ): void {
    if (!stripeSignatureHeader) {
      throw new UnauthorizedException("Missing Stripe-Signature header");
    }

    // Parse the header
    const parts = Object.fromEntries(
      stripeSignatureHeader.split(",").map((p) => p.split("=") as [string, string])
    );

    const timestamp = parseInt(parts["t"] ?? "0", 10);
    const v1Sig = parts["v1"];

    if (!timestamp || !v1Sig) {
      throw new UnauthorizedException("Invalid Stripe signature format");
    }

    // Check timestamp tolerance — prevents replay attacks
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > toleranceSeconds) {
      throw new UnauthorizedException(
        `Stripe webhook timestamp too old (${Math.abs(now - timestamp)}s)`
      );
    }

    // Compute expected signature
    const payload = `${timestamp}.${rawBody.toString("utf8")}`;
    const expectedSig = createHmac("sha256", webhookSecret)
      .update(payload)
      .digest("hex");

    const expected = Buffer.from(expectedSig, "hex");
    const received = Buffer.from(v1Sig, "hex");

    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw new UnauthorizedException("Stripe signature verification failed");
    }
  }

  // Generate a signing secret for outbound webhooks
  generateSecret(): string {
    // 32 random bytes = 64 hex chars — enough entropy
    return require("crypto").randomBytes(32).toString("hex");
  }
}
