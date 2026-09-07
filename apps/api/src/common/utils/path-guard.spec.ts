import { assertUploadPathSafe, assertPagesPathSafe } from "./path-guard";
import { resolve, join } from "path";

const UPLOADS_ROOT = resolve(join(process.cwd(), "uploads"));
const PAGES_ROOT = "/data/generated-pages";

beforeEach(() => {
  process.env.PAGES_DIST_ROOT = PAGES_ROOT;
});

describe("assertUploadPathSafe", () => {
  it("allows a valid file inside uploads", () => {
    expect(() => assertUploadPathSafe(`${UPLOADS_ROOT}/file.csv`)).not.toThrow();
  });

  it("blocks path traversal via ..", () => {
    expect(() => assertUploadPathSafe(`${UPLOADS_ROOT}/../../etc/passwd`)).toThrow(/path traversal/i);
  });

  it("blocks absolute path outside uploads", () => {
    expect(() => assertUploadPathSafe("/etc/passwd")).toThrow(/path traversal/i);
  });

  it("blocks null-byte injection", () => {
    expect(() => assertUploadPathSafe(`${UPLOADS_ROOT}/file\0.csv`)).toThrow();
  });
});

describe("assertPagesPathSafe", () => {
  it("allows a valid file inside PAGES_DIST_ROOT", () => {
    expect(() => assertPagesPathSafe(`${PAGES_ROOT}/org1/page.html`)).not.toThrow();
  });

  it("blocks traversal out of PAGES_DIST_ROOT", () => {
    expect(() => assertPagesPathSafe(`${PAGES_ROOT}/../../etc/shadow`)).toThrow(/path traversal/i);
  });

  it("throws when PAGES_DIST_ROOT is not set", () => {
    delete process.env.PAGES_DIST_ROOT;
    expect(() => assertPagesPathSafe("/data/generated-pages/page.html")).toThrow(/PAGES_DIST_ROOT is not set/i);
  });
});
