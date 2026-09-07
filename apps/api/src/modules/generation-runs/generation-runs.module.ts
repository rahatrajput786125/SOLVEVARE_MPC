import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { QUEUE_NAMES } from "@mpc/queue";
import { GenerationRunsController } from "./generation-runs.controller";
import { GenerationRunsService } from "./generation-runs.service";

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.PAGE_GENERATION }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>("JWT_SECRET"),
      }),
    }),
  ],
  controllers: [GenerationRunsController],
  providers: [GenerationRunsService],
  exports: [GenerationRunsService],
})
export class GenerationRunsModule {}
