import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { QUEUE_NAMES } from "@mpc/queue";
import { ExportController } from "./export.controller";
import { ExportService } from "./export.service";

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.EXPORT })],
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportModule {}
