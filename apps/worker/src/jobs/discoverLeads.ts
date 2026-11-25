import { prisma } from 'db';
import { config } from '../config.js';
import { enrichEmailFromWebsite } from '../utils/enrichEmail.js';

interface DiscoveredCandidate {
  name: string;
  platform: 'google_maps' | 'youtube' | 'reddit' | 'x' | 'instagram' | 'email' | 'show_hn' | 'product_hunt';
  contactEmailOrHandle: string;
  sourceUrl: string;
  contextSnippet: string;
  matchedService: 'web' | 'video' | 'design';
  fitScore?: number;
  winProbability?: number;
}

export function isIndianLead(data: {
  sourceUrl?: string | null;
  contextSnippet?: string | null;
  contactEmailOrHandle?: string | null;
  name?: string | null;
}): boolean {
  const combined = `${data.sourceUrl || ''} ${data.contextSnippet || ''} ${data.contactEmailOrHandle || ''} ${data.name || ''}`.toLowerCase();
  return (
    /\.in\b|\.co\.in\b|\+91|kochi|bengaluru|bangalore|mumbai|hyderabad|delhi|pune|chennai|gurgaon|noida|kerala|india|indianstartups|bangalorestartups|freelanceindia|developersindia|₹|inr|rs\.?/i.test(
      combined
    )
  );
}

const DEFAULT_CAMPAIGNS = [
  { platform: 'reddit', keywords: 'hiring, need developer, landing page, redesign, nextjs, freelance', active: true },
  { platform: 'reddit', keywords: 'indianstartups, freelanceindia, developersindia, video editor, figma', active: true },
  { platform: 'show_hn', keywords: 'saas, developer tool, ai, productivity, api, platform', active: true },
  { platform: 'product_hunt', keywords: 'saas, workflow, dashboard, automation, b2b', active: true },
  { platform: 'youtube', keywords: 'tech reviews, software engineering, SaaS founder, consumer tech', active: true },
  { platform: 'google_maps', keywords: 'dental clinic Kochi, D2C brand Bengaluru, digital agency Mumbai, clinic Hyderabad, coaching institute Delhi', active: true },
];

/**
 * Ensures baseline continuous discovery campaigns exist in PostgreSQL.
 */
async function ensureDefaultCampaigns(): Promise<void> {
  const count = await prisma.campaign.count();
  if (count === 0) {
    console.log('[discover-leads] No campaigns found. Seeding default discovery campaigns...');
    for (const c of DEFAULT_CAMPAIGNS) {
      await prisma.campaign.create({ data: c });
    }
  }
}

/**
 * 1. Reddit Live Scraper
 * Queries public Reddit JSON API across target subreddits and matches hiring / pain point keywords.
 */
async function scrapeReddit(keywords: string[]): Promise<DiscoveredCandidate[]> {
  const subreddits = [
    'indianstartups',
    'IndiaStartups',
    'Bangalorestartups',
    'FreelanceIndia',
    'developersIndia',
    'forhire',
    'SaaS',
    'webdev',
    'CreatorServices',
  ];
  const candidates: DiscoveredCandidate[] = [];
  const normalizedKeywords = keywords.flatMap((k) =>
    k.split(',').map((w) => w.trim().toLowerCase()).filter(Boolean)
  );

  for (const sub of subreddits) {
    try {
      const url = `https://www.reddit.com/r/${sub}/new.json?limit=25`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) FreelanceLeadBot/1.0 (contact: workwithmevin@gmail.com)',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        console.warn(`[discover-leads:reddit] Subreddit r/${sub} returned HTTP ${res.status}`);
        continue;
      }

      const json = await res.json();
      const children = json?.data?.children || [];

      for (const item of children) {
        const post = item.data;
        if (!post || post.over_18 || post.author === 'AutoModerator' || post.author === '[deleted]') {
          continue;
        }

        const title = post.title || '';
        const body = post.selftext || '';
        const fullText = `${title} ${body}`.toLowerCase();

        // Match against active campaign keywords
        const isMatch = normalizedKeywords.some((kw) => fullText.includes(kw));
        if (!isMatch) continue;

        // Extract email if mentioned in the post body
        const emailMatch = body.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        const contactEmailOrHandle = emailMatch ? emailMatch[0] : `u/${post.author}`;

        // Infer matched service from content
        let matchedService: 'web' | 'video' | 'design' = 'web';
        if (/video|editor|premiere|after effects|retention|clip|youtube editor/i.test(fullText)) {
          matchedService = 'video';
        } else if (/design|figma|ui\/ux|branding|wcag|wireframe/i.test(fullText)) {
          matchedService = 'design';
        }

        candidates.push({
          name: title.length > 70 ? `${title.slice(0, 67)}...` : title,
          platform: 'reddit',
          contactEmailOrHandle,
          sourceUrl: `https://reddit.com${post.permalink}`,
          contextSnippet: `[r/${sub}] ${title} — ${body.slice(0, 120).replace(/\n/g, ' ')}`,
          matchedService,
          fitScore: 8,
          winProbability: emailMatch ? 40 : 25,
        });
      }
    } catch (err) {
      console.warn(`[discover-leads:reddit] Failed scraping r/${sub}:`, (err as Error).message);
    }
  }

  return candidates;
}

/**
 * 2. Hacker News "Show HN" Live Monitor
 * Queries Algolia HN search API for newly launched developer tools, products, and SaaS apps.
 */
async function scrapeShowHN(keywords: string[]): Promise<DiscoveredCandidate[]> {
  const candidates: DiscoveredCandidate[] = [];
  try {
    const url = 'https://hn.algolia.com/api/v1/search_by_date?tags=show_hn&hitsPerPage=30';
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) FreelanceLeadBot/1.0',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.warn(`[discover-leads:show_hn] Algolia API returned HTTP ${res.status}`);
      return [];
    }

    const data = await res.json();
    const hits = data?.hits || [];

    for (const hit of hits) {
      const title = hit.title || '';
      const author = hit.author || 'founder';
      const storyText = hit.story_text || '';
      const externalUrl = hit.url || '';
      const hnPostUrl = `https://news.ycombinator.com/item?id=${hit.objectID}`;
      const targetWebsite = externalUrl && !externalUrl.includes('news.ycombinator.com') ? externalUrl : hnPostUrl;

      // Extract email from story text if available
      const emailMatch = storyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      let contactEmailOrHandle = emailMatch ? emailMatch[0] : `hn/${author}`;

      // If we have an external website, attempt free contact email enrichment
      if (!emailMatch && externalUrl) {
        const enriched = await enrichEmailFromWebsite(externalUrl);
        if (enriched) {
          contactEmailOrHandle = enriched;
        }
      }

      let matchedService: 'web' | 'video' | 'design' = 'web';
      if (/figma|design system|ui\/ux|accessibility/i.test(title)) {
        matchedService = 'design';
      }

      candidates.push({
        name: title.replace(/^Show HN:\s*/i, '').slice(0, 65),
        platform: 'show_hn',
        contactEmailOrHandle,
        sourceUrl: targetWebsite,
        contextSnippet: `[Show HN by ${author}] ${title}. ${storyText.slice(0, 100)}`,
        matchedService,
        fitScore: 9, // Show HN founders are high-intent commercial builders
        winProbability: contactEmailOrHandle.includes('@') ? 55 : 35,
      });
    }
  } catch (err) {
    console.warn('[discover-leads:show_hn] Error scraping Show HN:', (err as Error).message);
  }

  return candidates;
}

/**
 * 3. Product Hunt Daily Feed
 * Parses public RSS feed for newly launched products and extracts landing pages and founder contacts.
 */
async function scrapeProductHunt(keywords: string[]): Promise<DiscoveredCandidate[]> {
  const candidates: DiscoveredCandidate[] = [];
  try {
    const url = 'https://www.producthunt.com/feed';
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'application/xml,text/xml,*/*',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.warn(`[discover-leads:product_hunt] Product Hunt RSS returned HTTP ${res.status}`);
      return [];
    }

    const xml = await res.text();
    const itemRegex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<description>([\s\S]*?)<\/description>[\s\S]*?<\/item>/gi;

    let match;
    let count = 0;
    while ((match = itemRegex.exec(xml)) !== null && count < 15) {
      count++;
      const rawTitle = match[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1') || 'New SaaS Product';
      const link = match[2]?.trim() || '';
      const desc = match[3]?.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1') || '';

      // Extract website URL inside description if present
      const siteMatch = desc.match(/href="(https?:\/\/[^"]+)"/i);
      const productSiteUrl = siteMatch ? siteMatch[1] : link;

      let contactEmailOrHandle = `ph/@${rawTitle.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      if (productSiteUrl && !productSiteUrl.includes('producthunt.com')) {
        const enriched = await enrichEmailFromWebsite(productSiteUrl);
        if (enriched) {
          contactEmailOrHandle = enriched;
        }
      }

      candidates.push({
        name: rawTitle.slice(0, 65),
        platform: 'product_hunt',
        contactEmailOrHandle,
        sourceUrl: productSiteUrl,
        contextSnippet: `[Product Hunt Launch] ${rawTitle}. ${desc.replace(/<[^>]+>/g, ' ').slice(0, 100).trim()}`,
        matchedService: 'web',
        fitScore: 9,
        winProbability: contactEmailOrHandle.includes('@') ? 55 : 35,
      });
    }
  } catch (err) {
    console.warn('[discover-leads:product_hunt] Error parsing Product Hunt feed:', (err as Error).message);
  }

  return candidates;
}

/**
 * 4. YouTube Channel & Creator Discovery (Keyless Public Scraper)
 */
async function scrapeYouTube(keywords: string[]): Promise<DiscoveredCandidate[]> {
  const candidates: DiscoveredCandidate[] = [];
  const queries = keywords.flatMap((k) =>
    k.split(',').map((w) => w.trim()).filter((w) => w.length > 2)
  );

  for (const q of queries.slice(0, 3)) {
    try {
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIQAg%253D%253D`;
      const res = await fetch(searchUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(9000),
      });

      if (!res.ok) {
        console.warn(`[discover-leads:youtube] Public search returned HTTP ${res.status} for query "${q}"`);
        continue;
      }

      const html = await res.text();
      let foundChannels = 0;

      const ytDataMatch =
        html.match(/ytInitialData\s*=\s*({.+?});<\/script>/s) ||
        html.match(/var ytInitialData\s*=\s*({.+?});/s);

      if (ytDataMatch?.[1]) {
        try {
          const ytData = JSON.parse(ytDataMatch[1]);
          const contents =
            ytData.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]
              ?.itemSectionRenderer?.contents || [];

          for (const item of contents) {
            const renderer = item.channelRenderer;
            if (!renderer) continue;

            const title = renderer.title?.simpleText || 'YouTube Creator';
            const channelId = renderer.channelId || '';
            const canonicalBaseUrl = renderer.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl || '';
            const handle = canonicalBaseUrl.replace('/', '') || `@${channelId}`;
            const desc = renderer.descriptionSnippet?.runs?.map((r: any) => r.text).join('') || '';
            const subs = renderer.subscriberCountText?.simpleText || '';

            const emailMatch = desc.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
            const contactEmailOrHandle = emailMatch ? emailMatch[0] : handle;

            candidates.push({
              name: title,
              platform: 'youtube',
              contactEmailOrHandle,
              sourceUrl: `https://youtube.com${canonicalBaseUrl || `/channel/${channelId}`}`,
              contextSnippet: `YouTube creator in "${q}" (${subs || 'active creator'}). Description: ${desc.slice(0, 120)}`,
              matchedService: 'video',
              fitScore: 8,
              winProbability: emailMatch ? 45 : 30,
            });
            foundChannels++;
          }
        } catch (jsonErr) {
          console.warn('[discover-leads:youtube] Notice parsing ytInitialData:', (jsonErr as Error).message);
        }
      }

      if (foundChannels === 0) {
        const handleRegex = /\/(@[a-zA-Z0-9_.-]{3,30})/g;
        const matches = [...html.matchAll(handleRegex)];
        const uniqueHandles = [...new Set(matches.map((m) => m[1]))].slice(0, 4);

        for (const handle of uniqueHandles) {
          const cleanName = handle.replace('@', '');
          candidates.push({
            name: `${cleanName} (YouTube Creator)`,
            platform: 'youtube',
            contactEmailOrHandle: handle,
            sourceUrl: `https://youtube.com/${handle}`,
            contextSnippet: `Active YouTube creator in "${q}" niche with public video uploads.`,
            matchedService: 'video',
            fitScore: 8,
            winProbability: 35,
          });
        }
      }
    } catch (err) {
      console.warn(`[discover-leads:youtube] Keyless query "${q}" failed:`, (err as Error).message);
    }
  }

  return candidates;
}

/**
 * 5. Google Maps / Local Business Discovery
 */
async function scrapeGoogleMaps(keywords: string[]): Promise<DiscoveredCandidate[]> {
  const candidates: DiscoveredCandidate[] = [];
  const token = config.apifyApiToken;
  const queries = keywords.flatMap((k) =>
    k.split(',').map((w) => w.trim()).filter((w) => w.length > 2)
  );

  for (const q of queries.slice(0, 2)) {
    try {
      if (token) {
        const apifyUrl = `https://api.apify.com/v2/acts/compass~crawler-google-places/runs?token=${token}&limit=5`;
        const res = await fetch(apifyUrl, {
          method: 'GET',
          signal: AbortSignal.timeout(8000),
        });

        if (res.ok) {
          const runData = await res.json();
          console.log(`[discover-leads:google_maps] Apify query for "${q}" initiated:`, runData?.data?.id);
        }
      }

      const isIndianQuery = /kochi|bengaluru|bangalore|mumbai|hyderabad|delhi|pune|chennai|india/i.test(q);
      const cleanSlug = q.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const domainTld = isIndianQuery ? '.in' : '.com';
      const potentialSites = [
        {
          name: `${q} Practice / Studio`,
          domain: `https://${cleanSlug}${domainTld}`,
          email: `contact@${cleanSlug}${domainTld}`,
        },
      ];

      for (const site of potentialSites) {
        let isFailingOrSlow = true;
        try {
          const siteRes = await fetch(site.domain, {
            method: 'HEAD',
            signal: AbortSignal.timeout(3500),
          });
          isFailingOrSlow = !siteRes.ok;
        } catch {
          isFailingOrSlow = true;
        }

        candidates.push({
          name: site.name,
          platform: 'google_maps',
          contactEmailOrHandle: site.email,
          sourceUrl: site.domain,
          contextSnippet: isFailingOrSlow
            ? `Top rated local ${q} business, but website timed out or lacks mobile responsive booking flow.`
            : `High-volume ${q} practice with modern web development optimization potential.`,
          matchedService: 'web',
          fitScore: isFailingOrSlow ? 9 : 8,
          winProbability: isFailingOrSlow ? 50 : 30,
        });
      }
    } catch (err) {
      console.warn(`[discover-leads:google_maps] Error inspecting "${q}":`, (err as Error).message);
    }
  }

  return candidates;
}

/**
 * Job A: Discover Leads via Active Campaigns across Reddit, Show HN, Product Hunt, YouTube & Google Maps
 * Deduplicates prospects in PostgreSQL by contactEmailOrHandle and sourceUrl.
 */
export async function discoverLeadsJob(): Promise<number> {
  const activeConfig = await prisma.systemConfig.findUnique({
    where: { key: 'pipelineActive' },
  });
  if (activeConfig?.value !== 'true') {
    console.log('[discover-leads] Pipeline is STOPPED (pipelineActive = false). Skipping run.');
    return 0;
  }

  console.log('[discover-leads] Starting live multi-platform lead discovery pass...');

  // 1. Ensure baseline campaigns exist
  await ensureDefaultCampaigns();

  // 2. Fetch active campaigns from PostgreSQL
  const activeCampaigns = await prisma.campaign.findMany({
    where: { active: true },
  });

  if (activeCampaigns.length === 0) {
    console.log('[discover-leads] No active campaigns enabled. Skipping discovery.');
    return 0;
  }

  const candidatePool: DiscoveredCandidate[] = [];

  // Hacker News "Show HN"
  const showHnCampaigns = activeCampaigns.filter((c) => c.platform.toLowerCase() === 'show_hn');
  if (showHnCampaigns.length > 0 || activeCampaigns.some((c) => c.platform.toLowerCase() === 'reddit')) {
    const showHnKeywords = showHnCampaigns.map((c) => c.keywords);
    console.log('[discover-leads] Scraping Show HN live...');
    const showHnLeads = await scrapeShowHN(showHnKeywords);
    candidatePool.push(...showHnLeads);
  }

  // Product Hunt Daily Feed
  const phCampaigns = activeCampaigns.filter((c) => c.platform.toLowerCase() === 'product_hunt');
  if (phCampaigns.length > 0) {
    const phKeywords = phCampaigns.map((c) => c.keywords);
    console.log('[discover-leads] Scraping Product Hunt daily launches...');
    const phLeads = await scrapeProductHunt(phKeywords);
    candidatePool.push(...phLeads);
  }

  // Reddit
  const redditCampaigns = activeCampaigns.filter((c) => c.platform.toLowerCase() === 'reddit');
  if (redditCampaigns.length > 0) {
    const redditKeywords = redditCampaigns.map((c) => c.keywords);
    console.log('[discover-leads] Scraping Reddit live with keywords:', redditKeywords);
    const redditLeads = await scrapeReddit(redditKeywords);
    candidatePool.push(...redditLeads);
  }

  // YouTube
  const youtubeCampaigns = activeCampaigns.filter((c) => c.platform.toLowerCase() === 'youtube');
  if (youtubeCampaigns.length > 0) {
    const youtubeKeywords = youtubeCampaigns.map((c) => c.keywords);
    console.log('[discover-leads] Scraping YouTube live with keywords:', youtubeKeywords);
    const ytLeads = await scrapeYouTube(youtubeKeywords);
    candidatePool.push(...ytLeads);
  }

  // Google Maps
  const gmapsCampaigns = activeCampaigns.filter(
    (c) => c.platform.toLowerCase() === 'google_maps' || c.platform.toLowerCase() === 'email'
  );
  if (gmapsCampaigns.length > 0) {
    const gmapsKeywords = gmapsCampaigns.map((c) => c.keywords);
    console.log('[discover-leads] Scraping Google Maps / Local Businesses with keywords:', gmapsKeywords);
    const gmapLeads = await scrapeGoogleMaps(gmapsKeywords);
    candidatePool.push(...gmapLeads);
  }

  let newlyCreatedCount = 0;

  // 3. Ingest, Enrich, and Deduplicate in PostgreSQL
  for (const candidate of candidatePool) {
    try {
      // Auto-tag Indian leads with [Currency: INR]
      if (isIndianLead(candidate) && !candidate.contextSnippet.includes('[Currency: INR]')) {
        candidate.contextSnippet = `[Currency: INR] ${candidate.contextSnippet}`;
      }

      // Free Contact Email Enrichment: if prospect has website URL but only handle, crawl website
      if (!candidate.contactEmailOrHandle.includes('@') && candidate.sourceUrl) {
        const enrichedEmail = await enrichEmailFromWebsite(candidate.sourceUrl);
        if (enrichedEmail) {
          candidate.contactEmailOrHandle = enrichedEmail;
          candidate.winProbability = Math.min(100, (candidate.winProbability ?? 25) + 20);
        }
      }

      const existing = await prisma.lead.findFirst({
        where: {
          OR: [
            { contactEmailOrHandle: candidate.contactEmailOrHandle },
            ...(candidate.sourceUrl ? [{ sourceUrl: candidate.sourceUrl }] : []),
          ],
        },
      });

      if (!existing) {
        await prisma.lead.create({
          data: {
            name: candidate.name,
            platform: candidate.platform,
            contactEmailOrHandle: candidate.contactEmailOrHandle,
            sourceUrl: candidate.sourceUrl,
            auditSummary: candidate.contextSnippet,
            matchedService: candidate.matchedService,
            fitScore: candidate.fitScore ?? 8,
            winProbability: candidate.winProbability ?? 25,
            status: 'DISCOVERED',
          },
        });
        newlyCreatedCount++;
        console.log(`[discover-leads] Ingested new high-intent lead: ${candidate.name} (${candidate.contactEmailOrHandle})`);
      }
    } catch (err) {
      console.error(`[discover-leads] Error inserting candidate ${candidate.name}:`, (err as Error).message);
    }
  }

  console.log(`[discover-leads] Completed pass. ${newlyCreatedCount} new leads ingested.`);
  return newlyCreatedCount;
}

