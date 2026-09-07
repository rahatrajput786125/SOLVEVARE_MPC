import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { QUEUE_NAMES } from "@mpc/queue";
import { PublishController } from "./publish.controller";
import { PublishService } from "./publish.service";

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.PUBLISH }),
  ],
  controllers: [PublishController],
  providers: [PublishService],
  exports: [PublishService],
})
export class PublishModule {}
