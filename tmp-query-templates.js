const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const projectId = '6a0f5ec4e49c96fad4467008';
  const templates = await prisma.template.findMany({ where: { projectId } });
  console.log('Found', templates.length);
  for (const t of templates) {
    console.log(t.id, t.name, t.orgId, t.projectId, t.slugTemplate ? t.slugTemplate : t.slug);
  }
}

main().then(()=>prisma.$disconnect()).catch(e=>{console.error(e); prisma.$disconnect(); process.exit(1)});
