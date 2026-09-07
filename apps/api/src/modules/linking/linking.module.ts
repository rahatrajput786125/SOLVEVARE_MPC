import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { QUEUE_NAMES } from "@mpc/queue";
import { LinkingController } from "./linking.controller";
import { LinkGraphService } from "./link-graph.service";

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.SITEMAP }),
  ],
  controllers: [LinkingController],
  providers: [LinkGraphService],
  exports: [LinkGraphService],
})
export class LinkingModule {}
