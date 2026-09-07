import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

// @Global() means any module that imports DatabaseModule gets PrismaService
// without needing to add it to their own imports array.
// We register it once in AppModule and it's available everywhere.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
