import { ConflictException, NotFoundException } from "@nestjs/common";
import { PageGenerationService } from "./page-generation.service";
import { GeneratePagesDto } from "./dto/pages.dto";

const mockPrisma = {
  generationRun: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  template: { findFirst: jest.fn() },
  dataSource: { findFirst: jest.fn() },
  organization: { findUnique: jest.fn() },
  usageRecord: { aggregate: jest.fn() },
} as any;

const mockQueue = { enqueueChunks: jest.fn() } as any;

const svc = new PageGenerationService(
  { ...mockPrisma, generationRun: mockPrisma.generationRun } as any,
  mockQueue
);

const dto: GeneratePagesDto = { templateId: "tpl1", dataSourceId: "ds1" };

describe("PageGenerationService.enqueueGeneration — duplicate guard", () => {
  beforeEach(() => jest.clearAllMocks());

  it("throws 409 when an active run already exists", async () => {
    mockPrisma.generationRun.findFirst.mockResolvedValueOnce({
      id: "run-abc",
      status: "PROCESSING",
    });
    await expect(
      svc.enqueueGeneration("org1", "proj1", dto)
    ).rejects.toThrow(ConflictException);
  });

  it("throws 409 for QUEUED status too", async () => {
    mockPrisma.generationRun.findFirst.mockResolvedValueOnce({
      id: "run-xyz",
      status: "QUEUED",
    });
    await expect(
      svc.enqueueGeneration("org1", "proj1", dto)
    ).rejects.toThrow(ConflictException);
  });

  it("proceeds when no active run exists", async () => {
    // No active run
    mockPrisma.generationRun.findFirst.mockResolvedValueOnce(null);
    // Template not found — NotFoundException is fine here, just proves we passed the 409 check
    mockPrisma.template.findFirst.mockResolvedValueOnce(null);
    await expect(
      svc.enqueueGeneration("org1", "proj1", dto)
    ).rejects.toThrow(NotFoundException);
  });
});
