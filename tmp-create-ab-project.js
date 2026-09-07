require('dotenv').config({ path: 'apps/api/.env' });
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main(){
  const orgSlug = 'rahatrajput-org-iw6z';
  const projectSlug = 'rahatrajput-project';
  const csvPath = 'apps/api/uploads/karachi_pakistan.csv';
  const templateName = 'Karachi Landing - A';
  const templateSlug = 'karachi-landing-a';

  // Read CSV to ensure it exists
  if(!fs.existsSync(csvPath)){
    throw new Error('CSV file not found: ' + csvPath);
  }

  const org = await prisma.organization.findFirst({ where: { slug: orgSlug } });
  if(!org) throw new Error('Org not found: ' + orgSlug);

  let project = await prisma.project.findFirst({ where: { slug: projectSlug, orgId: org.id } });
  if(!project) throw new Error('Project not found: ' + projectSlug);

  // Create DataSource record
  const ds = await prisma.dataSource.create({
    data: {
      orgId: org.id,
      projectId: project.id,
      name: 'Karachi CSV',
      type: 'CSV',
      sourceUrl: csvPath,
      columnMap: {},
    }
  });

  // Create Template
  // read the provided HTML on the Desktop (user's editor context)
  const htmlContentPath = 'c:/Users/DELL/Desktop/index.html';
  const htmlContent = fs.readFileSync(htmlContentPath, 'utf8').slice(0, 100000);

  const tpl = await prisma.template.create({
    data: {
      orgId: org.id,
      projectId: project.id,
      name: templateName,
      description: 'A/B test template for Karachi landing',
      content: htmlContent,
      titleTemplate: 'Solvevare Karachi | Web Development',
      descriptionTemplate: 'Karachi web development services',
      slugTemplate: templateSlug,
      version: 1,
      isActive: true,
    }
  });

  console.log('Created DataSource id:', ds.id);
  console.log('Created Template id:', tpl.id);
  console.log('Done.');
}

main().catch(e=>{ console.error(e); process.exit(1); }).finally(()=>prisma.$disconnect());
