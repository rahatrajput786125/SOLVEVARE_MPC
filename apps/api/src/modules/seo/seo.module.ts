import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { QUEUE_NAMES } from "@mpc/queue";
import { SeoController } from "./seo.controller";
import { SeoService } from "./seo.service";

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.SITEMAP })],
  controllers: [SeoController],
  providers: [SeoService],
  exports: [SeoService],
})
export class SeoModule {}
