import { Module, Global } from "@nestjs/common";
import { EncryptionService } from "./encryption.service";
import { ApiKeyService } from "./api-key.service";
import { WebhookSignatureService } from "./webhook-signature.service";

// Global module — security services available everywhere without re-importing
@Global()
@Module({
  providers: [EncryptionService, ApiKeyService, WebhookSignatureService],
  exports: [EncryptionService, ApiKeyService, WebhookSignatureService],
})
export class SecurityModule {}
