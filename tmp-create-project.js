require('dotenv').config({ path: 'apps/api/.env' });
const bcrypt = require('bcryptjs');
const { PrismaClient, UserRole } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const email = 'rahatrajput@example.com';
  const name = 'rahatrajput';
  const password = '12345678';
  const orgName = 'rahatrajput-org';
  const projectName = 'rahatrajput-project';

  // Check if user exists
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const passwordHash = await bcrypt.hash(password, 12);
    user = await prisma.user.create({ data: { email, name, passwordHash, emailVerified: true } });
    console.log('Created user:', user.email);
  } else {
    console.log('User already exists:', user.email);
  }

  // Create or find org
  let org = await prisma.organization.findFirst({ where: { slug: orgName } });
  if (!org) {
    // generate a slug similar to app: base + random suffix
    const base = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    const slug = `${base}-${Math.random().toString(36).slice(2,6)}`;
    org = await prisma.organization.create({ data: { name: orgName, slug } });
    console.log('Created org:', org.slug);
  } else {
    console.log('Org exists:', org.slug);
  }

  // Ensure membership
  const existingMember = await prisma.orgMember.findFirst({ where: { userId: user.id, orgId: org.id } });
  if (!existingMember) {
    await prisma.orgMember.create({ data: { userId: user.id, orgId: org.id, role: UserRole.ORG_OWNER } });
    console.log('Added membership for user to org');
  } else {
    console.log('Membership exists');
  }

  // Create project
  const slugCandidate = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const existingProject = await prisma.project.findFirst({ where: { orgId: org.id, slug: slugCandidate } });
  let project;
  if (!existingProject) {
    project = await prisma.project.create({ data: { orgId: org.id, name: projectName, slug: slugCandidate } });
    console.log('Created project:', project.name);
  } else {
    project = existingProject;
    console.log('Project exists:', project.name);
  }

  console.log('\nSummary:');
  console.log('User:', { email: user.email, name: user.name });
  console.log('Org:', { id: org.id, slug: org.slug, name: org.name });
  console.log('Project:', { id: project.id, name: project.name, slug: project.slug });
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
