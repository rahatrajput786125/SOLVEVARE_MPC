import { Module } from "@nestjs/common";
import { DataSourcesController } from "./data-sources.controller";
import { DataSourcesService } from "./data-sources.service";
import { CsvImportService } from "./csv-import.service";

@Module({
  controllers: [DataSourcesController],
  providers: [DataSourcesService, CsvImportService],
  exports: [DataSourcesService],
})
export class DataSourcesModule {}
