/**
 * Free Website Contact Email Enricher
 * Inspects a prospect's landing page, /contact, and /about to discover
 * verified business and founder contact emails without paid third-party APIs.
 */

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const IGNORED_DOMAINS = [
  'sentry.io',
  'example.com',
  'wixpress.com',
  'schema.org',
  'w3.org',
  'googleapis.com',
  'gravatar.com',
  'cloudflare.com',
  'github.com',
  'reddit.com',
  'youtube.com',
  'twitter.com',
  'x.com',
  'facebook.com',
  'instagram.com',
  'medium.com',
  'vercel.app',
];

const IGNORED_PREFIXES = [
  'noreply',
  'no-reply',
  'donotreply',
  'mailer-daemon',
  'postmaster',
  'abuse',
  'security',
  'privacy',
  'unsubscribe',
  'bounce',
  'hostmaster',
  'root',
];

const INVALID_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.ico',
  '.css',
  '.js',
  '.woff',
  '.woff2',
];

export function isValidContactEmail(email: string): boolean {
  if (!email || email.length < 5 || email.length > 80) return false;
  const lower = email.toLowerCase().trim();

  // Filter invalid file extensions matched accidentally
  if (INVALID_EXTENSIONS.some((ext) => lower.endsWith(ext))) return false;

  const [prefix, domain] = lower.split('@');
  if (!prefix || !domain || !domain.includes('.')) return false;

  if (IGNORED_PREFIXES.some((p) => prefix === p || prefix.startsWith(`${p}+`))) return false;
  if (IGNORED_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) return false;

  return true;
}

export function extractEmailsFromHtml(html: string): string[] {
  if (!html) return [];
  const matches = html.match(EMAIL_REGEX) || [];
  const unique = [...new Set(matches.map((m) => m.toLowerCase().trim()))];
  return unique.filter(isValidContactEmail);
}

/**
 * Crawls homepage, /contact, and /about of a website to find business emails.
 * Times out each fetch after 5 seconds with a custom User-Agent.
 */
export async function enrichEmailFromWebsite(rawUrl: string | null | undefined): Promise<string | null> {
  if (!rawUrl) return null;

  const urlMatch = rawUrl.match(/https?:\/\/[^\s)'"<>]+/i);
  if (!urlMatch) return null;
  const baseUrlStr = urlMatch[0];

  try {
    const parsed = new URL(baseUrlStr);
    // Ignore major platforms
    if (IGNORED_DOMAINS.some((d) => parsed.hostname === d || parsed.hostname.endsWith(`.${d}`))) {
      return null;
    }

    const origin = parsed.origin;
    const pathsToTry = [
      parsed.href,
      `${origin}/contact`,
      `${origin}/about`,
      `${origin}/contact-us`,
    ];

    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 (FreelanceLeadBot/1.0)',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    };

    for (const url of pathsToTry) {
      try {
        const res = await fetch(url, {
          headers,
          signal: AbortSignal.timeout(5000),
        });

        if (!res.ok) continue;

        const html = await res.text();
        const emails = extractEmailsFromHtml(html);

        if (emails.length > 0) {
          // Prefer founder/hello/contact/inquiries emails
          const prioritized =
            emails.find((e) => /^(contact|hello|founder|team|inquiries|info|support|alex|marcus|dev)@/i.test(e)) ||
            emails[0];

          return prioritized;
        }
      } catch {
        // Individual path timeout/failure -> continue to next path
      }
    }
  } catch {
    // Malformed URL or DNS error
  }

  return null;
}
