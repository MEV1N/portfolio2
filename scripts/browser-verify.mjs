import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

async function verifyBrowser() {
  console.log('=== Starting Browser Verification Suite ===');
  const browser = await chromium.launch({ headless: true });

  const viewports = [
    { name: 'Desktop (1280x800)', width: 1280, height: 800, isMobile: false },
    { name: 'Mobile Viewport (390x844)', width: 390, height: 844, isMobile: true },
  ];

  const routes = [
    { path: '/', title: 'Home Storefront' },
    { path: '/work/web', title: 'Web Dev Case Study' },
    { path: '/work/video', title: 'Video Editing Case Study' },
    { path: '/work/design', title: 'UI/UX Design Case Study' },
    { path: '/admin/login', title: 'Admin Login' },
  ];

  let totalErrors = 0;

  for (const vp of viewports) {
    console.log(`\n--- Inspecting on ${vp.name} ---`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile,
    });
    const page = await context.newPage();

    // Track console and network errors
    const consoleLogs = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.error(`[Console Error on ${vp.name}]:`, msg.text());
        consoleLogs.push(msg.text());
        totalErrors++;
      }
    });

    page.on('pageerror', err => {
      console.error(`[Page Runtime Error on ${vp.name}]:`, err.message);
      totalErrors++;
    });

    for (const r of routes) {
      const url = `http://localhost:3000${r.path}`;
      const res = await page.goto(url, { waitUntil: 'networkidle' });
      const status = res.status();
      console.log(`[${vp.name}] ${r.title} (${r.path}) -> HTTP ${status}`);
      if (status >= 400) {
        console.error(`Failed to load ${url} with status ${status}`);
        totalErrors++;
      }
    }

    // Test Admin Login & Lead Desk on this viewport
    console.log(`[${vp.name}] Testing Admin Login & Lead Desk interaction...`);
    await page.goto('http://localhost:3000/admin/login');
    await page.fill('input[type="password"]', 'mevin_freelance_9f8a7d6c5b4e3a2f1d0c9b8a7e6f5d4c');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/admin', { timeout: 10000 });

    const adminHeading = await page.locator('h1').textContent();
    console.log(`[${vp.name}] /admin authenticated successfully! Heading: "${adminHeading?.trim()}"`);

    // Verify main components visible
    const dmQueueVisible = await page.getByText('One-Click Social DM Queue').isVisible();
    const leadsTableVisible = await page.getByText('All Prospects (Sorted by Win Probability)').isVisible();
    console.log(`[${vp.name}] Social DM Queue Visible: ${dmQueueVisible} | Leads Table Visible: ${leadsTableVisible}`);

    // Test opening Message Thread drawer
    const inspectBtn = page.getByRole('button', { name: 'Inspect' }).first();
    if (await inspectBtn.isVisible()) {
      await inspectBtn.click();
      await page.waitForTimeout(400);
      const modalHeader = await page.getByRole('heading', { level: 3 }).first().textContent();
      console.log(`[${vp.name}] Message Thread modal opened for: "${modalHeader?.trim()}"`);
      await page.getByRole('button', { name: 'Close' }).click();
    }

    await context.close();
  }

  await browser.close();

  console.log(`\n=== Verification Summary ===`);
  console.log(`Total Console / Network / Runtime Errors: ${totalErrors}`);
  if (totalErrors === 0) {
    console.log('✓ All viewports passed with 0 console and 0 network errors!');
    process.exit(0);
  } else {
    console.error(`✕ Detected ${totalErrors} errors during verification.`);
    process.exit(1);
  }
}

verifyBrowser().catch(err => {
  console.error('Fatal Browser Verification Error:', err);
  process.exit(1);
});
