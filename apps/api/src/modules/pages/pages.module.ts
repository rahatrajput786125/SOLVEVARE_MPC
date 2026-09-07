import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { QUEUE_NAMES } from "@mpc/queue";
import { PagesController } from "./pages.controller";
import { PagesService } from "./pages.service";
import { GenerationStatsService } from "./generation-stats.service";
import { PageGenerationQueue } from "./page-generation.queue";
import { PageGenerationService } from "./page-generation.service";

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.PAGE_GENERATION }),
  ],
  controllers: [PagesController],
  providers: [
    PagesService,
    GenerationStatsService,
    PageGenerationQueue,
    PageGenerationService,
  ],
  exports: [PagesService],
})
export class PagesModule {}
