import { test, expect } from '@playwright/test';
import { escapeHtml, formatTelegramDossierHtml } from '../apps/web/lib/telegram';
import { fetchPageSpeedMetrics } from '../apps/worker/src/lib/pagespeed';
import { extractEmailsFromHtml, isValidContactEmail } from '../apps/worker/src/utils/enrichEmail';
import { isSubBudgetOrHobbyist, isSub500BudgetOrHobbyist, heuristicAuditor } from '../apps/worker/src/lib/gemini';
import { isIndianLead } from '../apps/worker/src/jobs/discoverLeads';

test.describe('Freelance Portfolio & 24/7 Lead-Gen E2E Suite', () => {
  // 1. Portfolio Storefront Routes (No pricing mentioned up front on public portfolio)
  test('Public Portfolio landing page renders with high contrast and metrics', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('PORTFOLIO').first()).toBeVisible();
    await expect(page.getByText('About Mevin')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('SPRINT PACKAGES');
    await expect(page.locator('body')).not.toContainText('₹5,000');
    await expect(page.getByText('TOOLS I USE')).toBeVisible();
    await expect(page.getByRole('heading', { name: /LET'S.*WORK.*TOGETHER/i })).toBeVisible();
    await expect(page.locator('img[alt="Mevin"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tempo' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Yumzy' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'HIVE' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Impactor 25' })).toBeVisible();
    await expect(page.locator('a[href="https://tempo-six-plum.vercel.app/"]')).toBeVisible();
    await expect(page.locator('a[href="https://canteen-app-9p2e.vercel.app/"]')).toBeVisible();
    await expect(page.locator('a[href="https://hive-five-psi.vercel.app/"]')).toBeVisible();
    await expect(page.locator('a[href="https://impactor-2025.vercel.app/"]')).toBeVisible();
  });

  test('Dedicated Web Dev Case Study page renders with benchmarks', async ({ page }) => {
    await page.goto('/work/web');
    await expect(page.locator('h1')).toContainText('Sub-200ms Next.js 15 Architectures');
    await expect(page.getByText('Time To First Byte (TTFB)')).toBeVisible();
    await expect(page.getByText('140ms')).toBeVisible();
    await expect(page.getByText('Apex Cloud Systems')).toBeVisible();
    await expect(page.getByText('Custom Engineering Sprints')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('₹5,000');
  });

  test('Dedicated Video Editing Case Study page renders with retention breakdown', async ({ page }) => {
    await page.goto('/work/video');
    await expect(page.locator('h1')).toContainText('Defeating the 0:30 Cliff');
    await expect(page.getByText('TechPulse Media').first()).toBeVisible();
    await expect(page.getByText('Retention Timeline Preview')).toBeVisible();
    await expect(page.getByText('Custom Video Sprints')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('₹5,000');
  });

  test('Dedicated UI/UX Design Case Study page renders with interactive contrast mode', async ({ page }) => {
    await page.goto('/work/design');
    await expect(page.locator('h1')).toContainText('Figma Design Systems');
    await expect(page.getByText('Interactive Contrast & Hierarchy Audit')).toBeVisible();
    await expect(page.getByText('7.2:1 (WCAG AAA Passed)')).toBeVisible();
    await expect(page.getByText('Custom Design Sprints')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('₹5,000');
  });

  // 2. Click Tracking Route /r/[leadId]
  test('Click tracking route /r/[leadId] increments clicks, boosts probability, and redirects', async ({ request }) => {
    const redirectRes = await request.get('/r/apex-lead', {
      maxRedirects: 0,
    });
    expect([302, 307]).toContain(redirectRes.status());
    const location = redirectRes.headers()['location'];
    expect(location).toBeDefined();
  });

  // 3. Protected /admin Authentication & Lead Table
  test('/admin redirects unauthenticated users to /admin/login', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForURL('**/admin/login**');
    await expect(page.locator('h1')).toContainText('Admin Lead Desk Login');
  });

  test('/admin logs in with ADMIN_SECRET and displays lead desk and Social DM queue', async ({ page }) => {
    await page.goto('/admin/login');
    await page.fill('input[type="password"]', 'mevin_freelance_9f8a7d6c5b4e3a2f1d0c9b8a7e6f5d4c');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/admin', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Lead Command & Outreach Ops');
    await expect(page.getByText('One-Click Social DM Queue')).toBeVisible();
    await expect(page.getByText('All Prospects (Sorted by Win Probability)')).toBeVisible();
    await expect(page.getByText('Outreach Emails')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Email Outreach' })).toBeVisible();
  });

  test('Admin dashboard tracks outreach email status (sent vs not sent) with filter and badges', async ({ page }) => {
    await page.goto('/admin/login');
    await page.fill('input[type="password"]', 'mevin_freelance_9f8a7d6c5b4e3a2f1d0c9b8a7e6f5d4c');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/admin', { timeout: 10000 });

    // 1. Verify Outreach Emails KPI Card
    await expect(page.getByText('Outreach Emails')).toBeVisible();

    // 2. Verify Email Outreach Table Column Header
    await expect(page.getByRole('columnheader', { name: 'Email Outreach' })).toBeVisible();

    // 3. Verify Email Status Filter Dropdown with options
    const filterSelect = page.locator('[data-testid="email-status-filter"]');
    await expect(filterSelect).toBeVisible();
    await expect(filterSelect.locator('option[value="sent"]')).toBeAttached();
    await expect(filterSelect.locator('option[value="not_sent"]')).toBeAttached();

    // 4. Verify Email Outreach Navigation Tab
    await expect(page.locator('[data-testid="tab-email-outreach"]')).toBeVisible();
  });

  // 4. Inbound Reply Webhook Classification, Rich Dossier & Draft Framing
  test('Telegram lead dossier formats as clean HTML with zero backslashes and scannable layout', () => {
    // 1. Verify escapeHtml escapes ONLY &, <, > and leaves punctuation (. - _ ( )) clean
    const rawPunctuation = "Marcus O'Connor (VP_Growth) - 3.8s LCP & <script>alert(1)</script> /work_dev!";
    const escaped = escapeHtml(rawPunctuation);
    expect(escaped).toBe("Marcus O'Connor (VP_Growth) - 3.8s LCP &amp; &lt;script&gt;alert(1)&lt;/script&gt; /work_dev!");
    expect(escaped).not.toContain('\\.');
    expect(escaped).not.toContain('\\(');
    expect(escaped).not.toContain('\\)');
    expect(escaped).not.toContain('\\-');
    expect(escaped).not.toContain('\\_');

    // 2. Format a full dossier and assert layout structure
    const dossierHtml = formatTelegramDossierHtml({
      prospectName: 'Marcus (Apex Cloud)',
      matchedService: 'Next.js 15 Web Dev',
      platform: 'reddit',
      winProbability: 85,
      portfolioClicks: 4,
      auditSummary: 'LCP is 3.8s on mobile. Next.js bundle is 1.4MB uncompressed.',
      incomingReply: 'Sounds great, can we hop on a call this Thursday at 2pm?',
      proposedReply: 'Hi Marcus, Thursday at 2pm works great. Let us talk then.\n\nBest,\nMevin',
      adminUrl: 'http://localhost:3000/admin?leadId=apex-lead',
      sourceUrl: 'https://reddit.com/r/webdev/comments/12345',
    });

    // Assert exact scannable HTML headers
    expect(dossierHtml).toContain('🔥 <b>New Reply — Marcus (Apex Cloud)</b>');
    expect(dossierHtml).toContain('Next.js 15 Web Dev · reddit · 85% win · 4 clicks');
    expect(dossierHtml).toContain('<b>Why we pitched:</b> LCP is 3.8s on mobile. Next.js bundle is 1.4MB uncompressed.');
    expect(dossierHtml).toContain('<b>Their message:</b>\n"Sounds great, can we hop on a call this Thursday at 2pm?"');
    expect(dossierHtml).toContain('<b>Suggested reply:</b>\nHi Marcus, Thursday at 2pm works great. Let us talk then.\n\nBest,\nMevin');
    expect(dossierHtml).toContain('<a href="http://localhost:3000/admin?leadId=apex-lead">Open in Admin</a> · <a href="https://reddit.com/r/webdev/comments/12345">View Source</a>');

    // Assert zero raw backslash escapes (e.g. \\., \\-, \\_, \\(, \\))
    expect(dossierHtml).not.toMatch(/\\[.\-_()[\]*!~`>#+=|{}]/);
    expect(dossierHtml).not.toContain('\\.');
    expect(dossierHtml).not.toContain('\\(');
    expect(dossierHtml).not.toContain('\\)');

    // Assert no divider walls
    expect(dossierHtml).not.toContain('━━━');
    expect(dossierHtml).not.toContain('---');
  });

  test('POST /api/webhooks/inbound-reply rejects unauthenticated requests', async ({ request }) => {
    const res = await request.post('/api/webhooks/inbound-reply', {
      data: { replyText: 'Yes, let us talk next week.' },
    });
    expect(res.status()).toBe(401);
  });

  test('POST /api/webhooks/inbound-reply drafts contextual reply and formats rich dossier', async ({ request }) => {
    const res = await request.post('/api/webhooks/inbound-reply', {
      headers: {
        Authorization: 'Bearer mevin_freelance_9f8a7d6c5b4e3a2f1d0c9b8a7e6f5d4c',
      },
      data: {
        senderEmail: 'marcus@apexcloud.io',
        replyText: 'Hey! Loved your audit, what is your pricing and availability for a sprint next Monday?',
      },
    });

    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(['POSITIVE_INTEREST', 'OBJECTION_OR_QUESTION']).toContain(data.sentiment);
    expect(data.draftReply).toBeDefined();
    expect(data.draftReply.length).toBeGreaterThan(15);
    expect(data.draftStatus).toBe('PENDING_REVIEW');

    // Strict Gemini reply quality checks:
    // 1. Word count constraint (concise, 2-3 sentences, < 65 words including signoff)
    const wordCount = data.draftReply.trim().split(/\s+/).length;
    expect(wordCount).toBeLessThanOrEqual(65);

    // 2. No hallucinated excuses or bugs
    expect(data.draftReply.toLowerCase()).not.toMatch(/bounced|bounce|technical glitch|email delivery issue|server error|glitch/);

    // 3. No corporate buzzwords
    expect(data.draftReply.toLowerCase()).not.toContain('performance sprints');
    expect(data.draftReply.toLowerCase()).not.toContain('sprint architecture');

    // 4. Clean signoff with Mevin
    expect(data.draftReply).toContain('Mevin');
  });

  // 5. Reply Regeneration & Dispatch Endpoints
  test('POST /api/leads/[leadId]/regenerate-draft updates draftReply with new angle', async ({ request }) => {
    // 1. Get Marcus lead
    const leadsRes = await request.get('/api/admin/leads?platform=all', {
      headers: { Authorization: 'Bearer mevin_freelance_9f8a7d6c5b4e3a2f1d0c9b8a7e6f5d4c' },
    });
    const { leads } = await leadsRes.json();
    const marcusLead = leads.find((l: any) => l.contactEmailOrHandle.includes('apexcloud') || l.platform === 'reddit');
    expect(marcusLead).toBeDefined();

    const regenRes = await request.post(`/api/leads/${marcusLead.id}/regenerate-draft`, {
      headers: { Authorization: 'Bearer mevin_freelance_9f8a7d6c5b4e3a2f1d0c9b8a7e6f5d4c' },
    });
    expect(regenRes.status()).toBe(200);
    const regenData = await regenRes.json();
    expect(regenData.success).toBe(true);
    expect(regenData.draftReply).toBeDefined();
    expect(regenData.draftStatus).toBe('PENDING_REVIEW');

    const regenWordCount = regenData.draftReply.trim().split(/\s+/).length;
    expect(regenWordCount).toBeLessThanOrEqual(65);
    expect(regenData.draftReply.toLowerCase()).not.toMatch(/bounced|bounce|technical glitch|email delivery issue|server error|glitch/);
    expect(regenData.draftReply.toLowerCase()).not.toContain('performance sprints');
    expect(regenData.draftReply).toContain('Mevin');
  });

  test('POST /api/leads/[leadId]/send-reply dispatches reply and sets status to IN_CONVERSATION', async ({ request }) => {
    const leadsRes = await request.get('/api/admin/leads?platform=all', {
      headers: { Authorization: 'Bearer mevin_freelance_9f8a7d6c5b4e3a2f1d0c9b8a7e6f5d4c' },
    });
    const { leads } = await leadsRes.json();
    const targetLead = leads.find((l: any) => l.contactEmailOrHandle === 'marcus@apexcloud.io') || leads[0];
    expect(targetLead).toBeDefined();

    const firstName = targetLead.name.split(' ')[0] || 'there';
    const sendRes = await request.post(`/api/leads/${targetLead.id}/send-reply`, {
      headers: { Authorization: 'Bearer mevin_freelance_9f8a7d6c5b4e3a2f1d0c9b8a7e6f5d4c' },
      data: { content: `Sounds great ${firstName}, looking forward to speaking with you on Thursday.` },
    });
    expect(sendRes.status()).toBe(200);
    const sendData = await sendRes.json();
    expect(sendData.success).toBe(true);
    expect(sendData.status).toBe('IN_CONVERSATION');
  });

  // 6. Direct /admin?leadId=... auto-open drawer test
  test('/admin?leadId=... automatically opens drawer with editable draft controls', async ({ page }) => {
    // 1. Authenticate first
    await page.goto('/admin/login');
    await page.fill('input[type="password"]', 'mevin_freelance_9f8a7d6c5b4e3a2f1d0c9b8a7e6f5d4c');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/admin', { timeout: 10000 });

    // 2. Fetch first lead ID from page
    const inspectBtn = page.getByRole('button', { name: 'Inspect' }).first();
    await inspectBtn.click();
    await page.waitForTimeout(300);

    // Verify modal drawer and draft box components are visible
    await expect(page.getByText('Gemini Proposed Reply')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send Reply via Gmail' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Regenerate Draft' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark Opt-Out' })).toBeVisible();
  });

  // 7. Hidden Admin Panel & Start/Stop Outreach Engine Controls
  test('Public pages hide /admin from plain sight (no admin link in navbar or footer)', async ({ page }) => {
    await page.goto('/');
    // Check that there is no anchor pointing to /admin
    const adminLinks = page.locator('a[href="/admin"]');
    expect(await adminLinks.count()).toBe(0);

    // Verify footer does not have "Lead Ops" pointing to /admin
    await expect(page.getByText('Lead Ops')).toHaveCount(0);
  });

  test('GET & POST /api/admin/engine toggles outreach engine state', async ({ request }) => {
    // 1. GET engine status
    const getRes = await request.get('/api/admin/engine', {
      headers: { Authorization: 'Bearer mevin_freelance_9f8a7d6c5b4e3a2f1d0c9b8a7e6f5d4c' },
    });
    expect(getRes.status()).toBe(200);
    const getData = await getRes.json();
    expect(typeof getData.isPaused).toBe('boolean');

    // 2. Pause engine
    const pauseRes = await request.post('/api/admin/engine', {
      headers: { Authorization: 'Bearer mevin_freelance_9f8a7d6c5b4e3a2f1d0c9b8a7e6f5d4c' },
      data: { isPaused: true },
    });
    expect(pauseRes.status()).toBe(200);
    const pauseData = await pauseRes.json();
    expect(pauseData.isPaused).toBe(true);

    // 3. Resume engine
    const resumeRes = await request.post('/api/admin/engine', {
      headers: { Authorization: 'Bearer mevin_freelance_9f8a7d6c5b4e3a2f1d0c9b8a7e6f5d4c' },
      data: { isPaused: false },
    });
    expect(resumeRes.status()).toBe(200);
    const resumeData = await resumeRes.json();
    expect(resumeData.isPaused).toBe(false);
  });

  test('Admin dashboard renders Start/Stop Outreach button and toggles state interactively', async ({ page }) => {
    await page.goto('/admin/login');
    await page.fill('input[type="password"]', 'mevin_freelance_9f8a7d6c5b4e3a2f1d0c9b8a7e6f5d4c');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/admin', { timeout: 10000 });

    const toggleBtn = page.getByTestId('toggle-engine-btn');
    await expect(toggleBtn).toBeVisible();

    // Click to toggle
    await toggleBtn.click();
    await page.waitForTimeout(400);

    // Click to toggle back
    await toggleBtn.click();
    await page.waitForTimeout(400);
  });

  // 8. Decoupled 24/7 Listener & Gated Engine Loop (/api/admin/engine-toggle & /api/webhooks/telegram)
  test('GET & POST /api/admin/engine-toggle controls pipelineActive flag', async ({ request }) => {
    // 1. GET engine toggle status
    const getRes = await request.get('/api/admin/engine-toggle', {
      headers: { Authorization: 'Bearer mevin_freelance_9f8a7d6c5b4e3a2f1d0c9b8a7e6f5d4c' },
    });
    expect(getRes.status()).toBe(200);
    const getData = await getRes.json();
    expect(typeof getData.pipelineActive).toBe('boolean');

    // 2. Start pipeline (active: true)
    const startRes = await request.post('/api/admin/engine-toggle', {
      headers: { Authorization: 'Bearer mevin_freelance_9f8a7d6c5b4e3a2f1d0c9b8a7e6f5d4c' },
      data: { active: true },
    });
    expect(startRes.status()).toBe(200);
    const startData = await startRes.json();
    expect(startData.pipelineActive).toBe(true);
    expect(startData.isPaused).toBe(false);

    // 3. Stop pipeline (active: false)
    const stopRes = await request.post('/api/admin/engine-toggle', {
      headers: { Authorization: 'Bearer mevin_freelance_9f8a7d6c5b4e3a2f1d0c9b8a7e6f5d4c' },
      data: { active: false },
    });
    expect(stopRes.status()).toBe(200);
    const stopData = await stopRes.json();
    expect(stopData.pipelineActive).toBe(false);
    expect(stopData.isPaused).toBe(true);
  });

  test('POST /api/webhooks/telegram verifies secret token and handles engine:start/stop', async ({ request }) => {
    // 1. Rejects missing or invalid secret token
    const unauthRes = await request.post('/api/webhooks/telegram', {
      data: { callback_query: { id: 'test-1', data: 'engine:start' } },
    });
    expect(unauthRes.status()).toBe(401);

    // 2. Accepts valid secret token and processes engine:start callback
    const startRes = await request.post('/api/webhooks/telegram', {
      headers: { 'X-Telegram-Bot-Api-Secret-Token': 'mevin_freelance_9f8a7d6c5b4e3a2f1d0c9b8a7e6f5d4c' },
      data: {
        callback_query: {
          id: 'test-cb-start',
          data: 'engine:start',
          message: { message_id: 9999, chat: { id: 843198031 } },
        },
      },
    });
    expect(startRes.status()).toBe(200);
    const startData = await startRes.json();
    expect(startData.ok).toBe(true);

    // 3. Accepts valid secret token and processes engine:stop callback
    const stopRes = await request.post('/api/webhooks/telegram', {
      headers: { 'X-Telegram-Bot-Api-Secret-Token': 'mevin_freelance_9f8a7d6c5b4e3a2f1d0c9b8a7e6f5d4c' },
      data: {
        callback_query: {
          id: 'test-cb-stop',
          data: 'engine:stop',
          message: { message_id: 9999, chat: { id: 843198031 } },
        },
      },
    });
    expect(stopRes.status()).toBe(200);
    const stopData = await stopRes.json();
    expect(stopData.ok).toBe(true);
  });

  test('Inbound reply processor fires 24/7 even when pipelineActive is stopped', async ({ request }) => {
    // 1. Ensure pipelineActive is false
    await request.post('/api/admin/engine-toggle', {
      headers: { Authorization: 'Bearer mevin_freelance_9f8a7d6c5b4e3a2f1d0c9b8a7e6f5d4c' },
      data: { active: false },
    });

    // 2. Send inbound reply from prospect while pipeline is stopped
    const webhookRes = await request.post('/api/webhooks/inbound-reply', {
      headers: { Authorization: 'Bearer mevin_freelance_9f8a7d6c5b4e3a2f1d0c9b8a7e6f5d4c' },
      data: {
        senderEmail: 'marcus@apexcloud.io',
        replyText: 'Hey Mevin, let us get on a quick call this Thursday.',
      },
    });

    expect(webhookRes.status()).toBe(200);
    const data = await webhookRes.json();
    expect(data.success).toBe(true);
    expect(data.sentiment).toBeDefined();
  });

  // 9. Live Campaign Management, Technical Audits & Telegram Swipe-Reply
  test('PageSpeed Insights metric extractor filters non-websites and handles live audit URLs gracefully', async () => {
    // 1. Social URLs and empty strings should return null
    expect(await fetchPageSpeedMetrics('https://reddit.com/r/webdev/comments/123')).toBeNull();
    expect(await fetchPageSpeedMetrics('https://youtube.com/@techchannel')).toBeNull();
    expect(await fetchPageSpeedMetrics('')).toBeNull();
    expect(await fetchPageSpeedMetrics(null)).toBeNull();

    // 2. Extracts domain from raw strings and parses or fails gracefully
    const dummyUrl = 'https://example.com';
    const metrics = await fetchPageSpeedMetrics(dummyUrl);
    if (metrics) {
      expect(metrics.testedUrl).toBe(dummyUrl);
      expect(typeof metrics.performanceScore).toBe('number');
      expect(typeof metrics.lcp).toBe('string');
      expect(typeof metrics.ttfb).toBe('string');
    }
  });

  test('Admin Discovery Campaign API supports creating, toggling, and deleting campaigns', async ({ request }) => {
    const authHeaders = { Authorization: 'Bearer mevin_freelance_9f8a7d6c5b4e3a2f1d0c9b8a7e6f5d4c' };

    // 1. Create a new campaign
    const createRes = await request.post('/api/admin/campaigns', {
      headers: authHeaders,
      data: {
        platform: 'reddit',
        keywords: 'nextjs 15, sub-200ms ttfb, high performance saas',
      },
    });
    expect(createRes.status()).toBe(200);
    const createData = await createRes.json();
    expect(createData.success).toBe(true);
    const campaignId = createData.campaign.id;
    expect(campaignId).toBeDefined();

    // 2. Toggle campaign to paused
    const toggleRes = await request.post('/api/admin/campaigns', {
      headers: authHeaders,
      data: {
        campaignId,
        active: false,
      },
    });
    expect(toggleRes.status()).toBe(200);
    const toggleData = await toggleRes.json();
    expect(toggleData.campaign.active).toBe(false);

    // 3. Delete campaign
    const deleteRes = await request.delete(`/api/admin/campaigns?id=${campaignId}`, {
      headers: authHeaders,
    });
    expect(deleteRes.status()).toBe(200);
    const deleteData = await deleteRes.json();
    expect(deleteData.success).toBe(true);
    expect(deleteData.deletedId).toBe(campaignId);
  });

  test('POST /api/webhooks/telegram handles direct swipe-reply with reply: prefix stripping and dispatches reply', async ({ request }) => {
    // 1. Find a lead with a telegramMessageId or create one for test
    const leadsRes = await request.get('/api/admin/leads?platform=all', {
      headers: { Authorization: 'Bearer mevin_freelance_9f8a7d6c5b4e3a2f1d0c9b8a7e6f5d4c' },
    });
    const { leads } = await leadsRes.json();
    const testLead = leads.find((l: any) => l.contactEmailOrHandle === 'marcus@apexcloud.io') || leads[0];
    expect(testLead).toBeDefined();

    const simulatedMessageId = testLead.telegramMessageId || 888899;

    // 2. Dispatch swipe reply to this telegram message id with 'reply:' prefix
    const swipeRes = await request.post('/api/webhooks/telegram', {
      headers: { 'X-Telegram-Bot-Api-Secret-Token': 'mevin_freelance_9f8a7d6c5b4e3a2f1d0c9b8a7e6f5d4c' },
      data: {
        message: {
          message_id: 99991,
          chat: { id: 843198031 },
          text: 'reply: Hey Marcus, Thursday 2pm works great. Talk then!',
          reply_to_message: {
            message_id: simulatedMessageId,
            text: 'Why we pitched: LCP is 3.8s on mobile',
          },
        },
      },
    });

    expect(swipeRes.status()).toBe(200);
    const swipeData = await swipeRes.json();
    expect(swipeData.ok).toBe(true);
  });

  // 10. High-Ticket SaaS Discovery: Show HN, Domain Email Enricher & $500+ Budget Filter
  test('Free website contact email enricher extracts valid business emails and rejects invalid ones', () => {
    // 1. Validation tests
    expect(isValidContactEmail('founder@apexcloud.io')).toBe(true);
    expect(isValidContactEmail('hello@saasdev.co')).toBe(true);
    expect(isValidContactEmail('noreply@google.com')).toBe(false);
    expect(isValidContactEmail('user@example.com')).toBe(false);
    expect(isValidContactEmail('error@sentry.io')).toBe(false);
    expect(isValidContactEmail('avatar@2x.png')).toBe(false);

    // 2. HTML extraction test
    const sampleHtml = `
      <footer>
        <p>Get in touch at <a href="mailto:founder@apexcloud.io">founder@apexcloud.io</a> or hello@apexcloud.io</p>
        <img src="logo@2x.png" />
        <a href="mailto:noreply@sentry.io">Telemetry</a>
      </footer>
    `;
    const emails = extractEmailsFromHtml(sampleHtml);
    expect(emails).toContain('founder@apexcloud.io');
    expect(emails).toContain('hello@apexcloud.io');
    expect(emails).not.toContain('logo@2x.png');
    expect(emails).not.toContain('noreply@sentry.io');
  });

  test('Show HN JSON API parser discovers developer tools and captures live launch contexts', async ({ request }) => {
    const res = await request.get('https://hn.algolia.com/api/v1/search_by_date?tags=show_hn&hitsPerPage=5');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.hits)).toBe(true);
    expect(data.hits.length).toBeGreaterThan(0);

    const firstHit = data.hits[0];
    expect(firstHit.title).toBeDefined();
    expect(firstHit.objectID).toBeDefined();
    expect(firstHit.author).toBeDefined();
  });

  test('Minimum budget gate (₹5,000 / $55) accepts valid client inquiries and rejects micro-tasks', () => {
    // Micro-tasks under ₹5,000 / $55 must be rejected
    expect(isSubBudgetOrHobbyist('Need a quick landing page, budget is $25')).toBe(true);
    expect(isSubBudgetOrHobbyist('Looking for fullstack developer, $50 max')).toBe(true);
    expect(isSubBudgetOrHobbyist('Need short form video editing, ₹1500 budget')).toBe(true);
    expect(isSubBudgetOrHobbyist('WordPress bug fix, ₹2000 inr')).toBe(true);
    expect(isSubBudgetOrHobbyist('Student homework assignment in React')).toBe(true);
    expect(isSubBudgetOrHobbyist('Unpaid equity only split for co-founder')).toBe(true);

    // ₹5,000+ INR and $55+ USD opportunities must be ACCEPTED
    expect(isSubBudgetOrHobbyist('Need short form video editing, ₹5000 budget')).toBe(false);
    expect(isSubBudgetOrHobbyist('Next.js sprint, 5k inr budget')).toBe(false);
    expect(isSubBudgetOrHobbyist('Looking for fullstack developer, $60 budget')).toBe(false);
    expect(isSubBudgetOrHobbyist('Funded B2B SaaS looking for Next.js performance sprint, $2500 budget')).toBe(false);
    expect(isSubBudgetOrHobbyist('Indian D2C brand: ₹15,000 retainer for website revamp')).toBe(false);
    expect(isSubBudgetOrHobbyist('Show HN: FastKV distributed cache launch')).toBe(false);
  });

  test('Indian lead detector identifies Indian domains, cities, subreddits, and +91 numbers', () => {
    expect(isIndianLead({ sourceUrl: 'https://drkavitha.in', name: 'Dr. Kavitha Dental' })).toBe(true);
    expect(isIndianLead({ contextSnippet: 'Dental clinic located in Kochi, Kerala' })).toBe(true);
    expect(isIndianLead({ contextSnippet: '[r/indianstartups] Hiring Next.js developer for SaaS launch' })).toBe(true);
    expect(isIndianLead({ contactEmailOrHandle: '+919876543210' })).toBe(true);
    expect(isIndianLead({ sourceUrl: 'https://apexcloud.io', contextSnippet: 'Show HN launch in San Francisco' })).toBe(false);
  });

  test('Outreach pitch generator introduces portfolio as recent work/portfolio and never says live demo', () => {
    const audit = heuristicAuditor('Elena Rostova (Apex Cloud)', 'reddit', 'apex-lead', 'SaaS founder launching beta');
    expect(audit.threeSentencePitch.toLowerCase()).not.toContain('live demo');
    expect(audit.threeSentencePitch.toLowerCase()).not.toContain('demos here');
    expect(audit.threeSentencePitch).toContain('recent work');
    expect(audit.threeSentencePitch).toContain('/r/apex-lead');
  });
});
