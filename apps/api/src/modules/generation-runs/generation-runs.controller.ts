import {
  Controller, Get, Patch, Param, Query,
  HttpCode, HttpStatus, Res, Sse, MessageEvent,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString } from "class-validator";
import { Response } from "express";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { Observable, interval, from, switchMap, takeWhile, map, distinctUntilKeyChanged } from "rxjs";
import { GenerationRunsService, RunStatus } from "./generation-runs.service";
import { OrgId, Public } from "../../common/decorators";

class ListRunsQuery {
  @IsString()
  @IsOptional()
  projectId?: string;

  @IsEnum(["QUEUED", "PROCESSING", "COMPLETED", "PARTIAL", "FAILED", "CANCELLED"])
  @IsOptional()
  status?: RunStatus;
}

// Terminal statuses — SSE stream closes when the run reaches one of these
const TERMINAL: RunStatus[] = ["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"];

@ApiTags("generation-runs")
@ApiBearerAuth()
@Controller("generation-runs")
export class GenerationRunsController {
  constructor(
    private readonly service: GenerationRunsService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService
  ) {}

  @Get()
  @ApiOperation({ summary: "List all generation runs for the authenticated org" })
  @ApiQuery({ name: "projectId", required: false })
  @ApiQuery({ name: "status", required: false, enum: ["QUEUED", "PROCESSING", "COMPLETED", "PARTIAL", "FAILED", "CANCELLED"] })
  findAll(
    @OrgId() orgId: string,
    @Query() query: ListRunsQuery
  ) {
    return this.service.findAll(orgId, query.projectId, query.status);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a single generation run by ID" })
  findOne(
    @Param("id") id: string,
    @OrgId() orgId: string
  ) {
    return this.service.findById(id, orgId);
  }

  // ── SSE: GET /generation-runs/:id/stream ──────────────────────────────────
  // Marked @Public() because EventSource cannot send Authorization headers.
  // Auth is performed inline via ?token= query param (JWT verified manually).
  @Sse(":id/stream")
  @Public()
  @ApiOperation({ summary: "SSE stream of live progress for a generation run" })
  stream(
    @Param("id") id: string,
    @Query("token") tokenParam: string,
    @Res() res: Response
  ): Observable<MessageEvent> {
    // Validate token from query param and extract orgId
    let orgId: string;
    try {
      const payload = this.jwtService.verify(tokenParam, {
        secret: this.config.get<string>("JWT_SECRET"),
      }) as { orgId: string };
      orgId = payload.orgId;
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      // Return an empty observable — response already ended
      return new Observable((s) => s.complete());
    }

    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("X-Accel-Buffering", "no");

    return interval(2000).pipe(
      switchMap(() => from(this.service.findById(id, orgId))),
      distinctUntilKeyChanged("processedRows"),
      takeWhile(
        (run) => !TERMINAL.includes(run.status as RunStatus),
        true  // emit terminal event before completing
      ),
      map((run): MessageEvent => ({ data: run }))
    );
  }

  @Patch(":id/cancel")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Cancel a queued or processing generation run" })
  cancel(
    @Param("id") id: string,
    @OrgId() orgId: string
  ) {
    return this.service.cancel(id, orgId);
  }
}
