import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing all demo data and initializing production baseline state...');

  // 1. Purge all demo/mock leads, threads, and reports
  const deletedThreads = await prisma.messageThread.deleteMany();
  const deletedLeads = await prisma.lead.deleteMany();
  const deletedReports = await prisma.dailyReport.deleteMany();
  const deletedCampaigns = await prisma.campaign.deleteMany();

  console.log(`Deleted ${deletedThreads.count} message threads.`);
  console.log(`Deleted ${deletedLeads.count} leads.`);
  console.log(`Deleted ${deletedReports.count} daily reports.`);
  console.log(`Deleted ${deletedCampaigns.count} legacy campaigns.`);

  // 2. Initialize Clean Production Discovery Campaigns
  await prisma.campaign.createMany({
    data: [
      {
        platform: 'reddit',
        keywords: 'hiring, need developer, landing page, redesign, nextjs, freelance',
        active: true,
      },
      {
        platform: 'reddit',
        keywords: 'indianstartups, freelanceindia, developersindia, video editor, figma',
        active: true,
      },
      {
        platform: 'show_hn',
        keywords: 'saas, developer tool, ai, productivity, api, platform',
        active: true,
      },
      {
        platform: 'product_hunt',
        keywords: 'saas, workflow, dashboard, automation, b2b',
        active: true,
      },
      {
        platform: 'youtube',
        keywords: 'tech reviews, software engineering, SaaS founder, consumer tech',
        active: true,
      },
      {
        platform: 'google_maps',
        keywords: 'dental clinic Kochi, D2C brand Bengaluru, digital agency Mumbai, clinic Hyderabad, coaching institute Delhi',
        active: true,
      },
    ],
  });

  // 3. Initialize Production System Configuration (Safe paused state ready for user toggle)
  await prisma.systemConfig.upsert({
    where: { key: 'pipelineActive' },
    update: { value: 'false' },
    create: { key: 'pipelineActive', value: 'false' },
  });
  await prisma.systemConfig.upsert({
    where: { key: 'outreachPaused' },
    update: { value: 'true' },
    create: { key: 'outreachPaused', value: 'true' },
  });

  console.log('====================================================');
  console.log('✅ Production Database Reset Complete:');
  console.log('  • 0 demo leads or mock threads in database');
  console.log('  • 4 active live multi-platform campaigns configured');
  console.log('  • Autonomous pipeline in safe standby mode');
  console.log('====================================================');
}

main()
  .catch((e) => {
    console.error('Production database initialization error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
