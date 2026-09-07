# Worker — Architecture & Logic

## Overview

Worker ek background process hai jo koi HTTP server nahi chalata. Sirf Redis queues se jobs leta hai aur process karta hai. NestFactory.createApplicationContext() use hota hai — no HTTP layer.

```
API  ──→  Redis Queue  ──→  Worker  ──→  MongoDB + Disk
```

---

## Startup Flow

```
main.ts
  └── WorkerModule bootstrap
        ├── MongoDB connect (PrismaClient)
        ├── Redis connect (BullModule)
        ├── JobRecoveryService.onApplicationBootstrap()
        │     └── 10 sec baad: stale PROCESSING runs detect karo, re-enqueue
        └── Sab processors queue listen karne lagte hain
```

---

## Queues aur Processors

| Queue | Processor | Concurrency | Rate Limit |
|---|---|---|---|
| csv_import | CsvImportProcessor | 2 | — |
| page_generation | PageGenerationProcessor | 10 | 2000 jobs / 5s |
| ai_content | AiContentProcessor | 3 | 50 jobs / 1s |
| publish | PublishProcessor | 5 | — |
| sitemap | SitemapProcessor | 1 | — |
| export | ExportProcessor | 2 | — |

---

## 1. CSV Import Flow

**Trigger:** API uploads CSV/Excel file → enqueues job

```
CsvImportProcessor.processImport()
  1. dataSource DB se columnMap lo
  2. File CSV hai → stream parse, Excel hai → buffer parse
  3. Row count count karo
  4. CsvImport → COMPLETED, DataSource.rowCount update
```

File disk par save rehti hai (sourceUrl = filePath). Rows DB mein store nahi hote — generation ke waqt directly file se read hoti hai.

---

## 2. Page Generation Flow

**Trigger:** API POST /generate → GenerationRun create → chunks queue mein

```
PageGenerationProcessor.processChunk()

Phase 1 — Render (per row)
  ├── TemplateCache se template lo (LRU cache, request coalescing)
  ├── Project baseUrl lo (in-memory cache)
  ├── readChunk() → file slice karo (parsedFileCache se)
  └── har row ke liye renderRow():
        ├── TemplateEngine.render() → HTML, slug, title, SEO fields
        ├── SchemaMarkupGenerator → JSON-LD schemas
        ├── SEO score calculate (agar AI nahi hai)
        └── writeHtmlFile() → disk par save karo
              dist/<projectId>/<templateId>/<slug>.html

Phase 2 — DB Write (3 calls total, pehle 50+ tha)
  ├── findMany → existing slugs check karo
  ├── createMany → naye pages insert
  └── updateMany → existing pages update

Phase 3 — Schema + AI
  ├── schemaMarkup.createMany()
  └── AI placeholders hain → aiQueue.addBulk()

Phase 4 — Side effects
  ├── usageRecord increment (pages_generated)
  └── internalLinking.buildLinksForChunk() fire-and-forget

Phase 5 — Progress
  └── GenerationRun counters atomic increment
        → sab chunks done? status = COMPLETED/PARTIAL/FAILED
```

### Slug Deduplication

Ek hi chunk mein duplicate slugs aa sakti hain (same CSV rows). `seenSlugs` Set se in-memory dedup hota hai before DB write.

### File Cache

`parsedFileCache` global Map hai. Pehla chunk file parse karta hai, baaki 9 chunks same Promise await karte hain — file 10 baar parse nahi hoti.

---

## 3. AI Content Flow

**Trigger:** PageGenerationProcessor AI placeholder detect kare → job enqueue

```
AiContentProcessor.generateContent()
  1. Redis cache check (cacheKey = hash of provider+model+prompt)
     → hit: cached response use karo, API call nahi
  2. Org rate limit check (300 req/min per org via Redis)
  3. OpenAI API call
  4. Quality score check (scoreAiContent)
     → fail: prompt strengthen karo, retry (max 3 baar)
  5. Response Redis mein cache karo
  6. AiGeneration record save karo
  7. ai_tokens usage record update
  8. checkAndFinalizePageIfComplete()
        → is page ke sab AI placeholders done?
        → haan: finalizePageWithAiContent() call karo

finalizePageWithAiContent()
  ├── Template se second-pass render (AI content inject karke)
  ├── FAQ schema generate karo
  ├── Final SEO score calculate
  └── HTML file disk par overwrite karo
```

---

## 4. Export Flow

**Trigger:** API POST /export → job enqueue

```
ExportProcessor.exportProject()

Phase 1 — ZIP banana
  ├── tmp/exports/<jobId>.zip create karo
  ├── archiver stream open karo
  ├── Pages BATCH_SIZE=500 mein cursor-based fetch
  │     filePath disk par hai → archive.file() stream directly
  │     filePath missing → fallback HTML generate karo
  └── archive.finalize()

Phase 2 — Validation (export-validator.service.ts)
  ├── Pass 1: sab valid slugs collect karo
  └── Pass 2: har page check karo:
        1. Missing HTML file on disk
        2. Broken internal links
        3. Invalid slug format
        4. Missing/inactive template
        5. Blank SEO fields
        6. Unreplaced {{variable}} tokens
        7. Empty/thin body (< 200 chars)
        8. Invalid canonical URL
        9. Duplicate slugs
        10. SEO score = 0 ya missing focusKeyword
        11. Pages stuck in GENERATING > 30 min

Phase 3 — Report
  ├── export-report.json ZIP mein append karo
  └── ExportJob → COMPLETED, zipPath, expiresAt (2 hours)
```

---

## 5. Publish Flow

**Trigger:** API POST /publish → batches queue mein

```
PublishProcessor.publishBatch()
  1. Pages DB se load karo
  2. SchemaMarkup load karo
  3. Publisher route karo (WORDPRESS / STATIC_HTML / WEBHOOK)
  4. Har page publish karo (Promise.allSettled)
  5. Page status update karo (PUBLISHED / FAILED)
  6. PublishJob counters update karo
  7. Sab batches done? → sitemapQueue mein job daalo
```

---

## 6. Sitemap Flow

**Trigger:** Publish complete hone ke baad

```
SitemapProcessor.generateSitemap()
  1. Project baseUrl lo
  2. SitemapGeneratorService.generate() → XML files
  3. S3 upload karo
  4. Sitemap record DB mein upsert
```

---

## Services

### TemplateCacheService
- LRU cache (max 100 templates, TTL 5 min)
- Request coalescing: agar fetch already chal rahi hai toh same Promise await karo — 10 concurrent chunks ek hi DB call karenge

### InternalLinkingService
- Chunk ke liye ek baar 200 pages ka pool fetch karo
- Har page ke liye pool se 8 links resolve karo (in-memory)
- `deleteMany` + `createMany` — **no $transaction** (MongoDB standalone par unsupported)

### JobRecoveryService
- Startup par 10 sec baad chalti hai
- PROCESSING status mein 5+ min se stuck runs dhundho
- Missing chunks re-enqueue karo (stable jobId se duplicate avoid)

### CleanupService (Cron jobs)
- Har ghante: expired ZIP files delete karo
- Daily 2am: 30 din purane GenerationRuns delete karo
- Daily 3am: orphaned page directories disk se delete karo

### DiskSpaceService
- Generation se pehle disk space check karo
- `pageCount × 50KB + 500MB buffer` chahiye
- Fail hone par `InsufficientDiskSpaceError` throw karo

---

## MongoDB Compatibility Notes

Yeh sab `deletedAt: null` ki jagah `OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]` use karta hai kyunki MongoDB mein missing field `null` se alag hoti hai.

`prisma.$transaction()` use nahi hota kyunki MongoDB standalone (replica set nahi) par transactions supported nahi hain — deadlock/write conflict error aata hai.

---

## Disk Structure

```
dist/
  <projectId>/
    <templateId>/
      <slug>.html       ← generated HTML pages

tmp/
  exports/
    <exportJobId>.zip         ← export ZIP (2 hour TTL)
    <exportJobId>-report.json ← validation report
```
