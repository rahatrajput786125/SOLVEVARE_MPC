// Removes duplicate generated_pages where (projectId + templateId + slug) is the same.
// Keeps the LATEST document (highest createdAt), deletes the older ones.

const { PrismaClient } = require("./node_modules/.prisma/client");

const prisma = new PrismaClient();

async function main() {
  // Get all pages, group manually by (projectId, templateId, slug)
  const allPages = await prisma.generatedPage.findMany({
    select: { id: true, projectId: true, templateId: true, slug: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const seen = new Map();
  const toDelete = [];

  for (const page of allPages) {
    const key = `${page.projectId}__${page.templateId}__${page.slug}`;
    if (seen.has(key)) {
      toDelete.push(page.id);
    } else {
      seen.set(key, page.id);
    }
  }

  console.log(`Found ${toDelete.length} duplicate pages to delete`);

  if (toDelete.length > 0) {
    const result = await prisma.generatedPage.deleteMany({
      where: { id: { in: toDelete } },
    });
    console.log(`Deleted ${result.count} duplicate pages`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
