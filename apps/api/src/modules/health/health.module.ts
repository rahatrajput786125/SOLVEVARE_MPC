import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { QUEUE_NAMES } from "@mpc/queue";
import { HealthController } from "./health.controller";

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.PAGE_GENERATION })],
  controllers: [HealthController],
})
export class HealthModule {}
