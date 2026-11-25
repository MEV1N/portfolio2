import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { config } from '../config.js';

/**
 * Job D: Poll Gmail Inbox for Inbound Replies
 * Runs every 2 minutes via node-cron using imapflow + mailparser.
 * Fetches unseen messages, matches sender/In-Reply-To against Lead, marks \Seen,
 * and POSTs to Next.js webhook with ADMIN_SECRET bearer token.
 */
export async function pollGmailRepliesJob(): Promise<number> {
  if (!config.gmailUser || !config.gmailAppPassword) {
    console.log('[poll-gmail-replies] Gmail credentials not configured. Skipping poll.');
    return 0;
  }

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    auth: {
      user: config.gmailUser,
      pass: config.gmailAppPassword,
    },
    logger: false,
  });

  // Handle EventEmitter errors to prevent unhandled 'error' events from terminating the worker process
  client.on('error', (err) => {
    console.warn('[poll-gmail-replies] IMAP client notice:', (err as Error)?.message || String(err));
  });

  let processedCount = 0;

  try {
    console.log('[poll-gmail-replies] Connecting to imap.gmail.com:993...');
    await client.connect();

    // Acquire Mailbox Lock for safe atomic inbox reading
    const lock = await client.getMailboxLock('INBOX');

    try {
      // Search for unseen messages
      const searchResult = await client.search({ seen: false });
      const uids = Array.isArray(searchResult) ? searchResult : [];

      console.log(`[poll-gmail-replies] Found ${uids.length} unseen message(s).`);

      for (const uid of uids) {
        try {
          const message = await client.fetchOne(uid, { source: true });
          if (!message || typeof message === 'boolean' || !message.source) continue;

          // Parse email source via mailparser
          const parsed = await simpleParser(message.source);
          const senderEmail = parsed.from?.value?.[0]?.address || '';
          const senderName = parsed.from?.value?.[0]?.name || '';
          const replyText = parsed.text || parsed.html || '';
          const inReplyTo = parsed.inReplyTo || '';
          const messageId = parsed.messageId || '';

          // Filter out automated notifications and mailer daemon bounces
          const isSystemEmail =
            !senderEmail ||
            /no-?reply|mailer-daemon|postmaster|google\.com|googlemail\.com|notifications\.google\.com|accounts\.google\.com|bounce|donotreply/i.test(
              senderEmail
            );

          if (isSystemEmail) {
            console.log(`[poll-gmail-replies] Skipping automated system email: ${senderEmail}`);
            await client.messageFlagsAdd({ uid }, ['\\Seen']);
            continue;
          }

          console.log(`[poll-gmail-replies] Processing client reply from: ${senderEmail} (${senderName})`);

          // POST reply to Next.js Webhook
          const webhookUrl = `${config.nextPublicAppUrl}/api/webhooks/inbound-reply`;
          const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${config.adminSecret}`,
            },
            body: JSON.stringify({
              senderEmail,
              senderName,
              replyText,
              inReplyTo,
              messageId,
            }),
          });

          if (res.ok) {
            // Mark email as \Seen
            await client.messageFlagsAdd({ uid }, ['\\Seen']);
            processedCount++;
            console.log(`[poll-gmail-replies] Successfully processed and marked \\Seen for UID: ${uid}`);
          } else {
            const errText = await res.text();
            console.warn(`[poll-gmail-replies] Webhook returned status ${res.status}: ${errText}`);
            // Mark as seen to avoid stalling on unprocessable messages
            await client.messageFlagsAdd({ uid }, ['\\Seen']);
          }
        } catch (msgErr) {
          console.error(`[poll-gmail-replies] Error processing UID ${uid}:`, (msgErr as Error).message);
        }
      }
    } finally {
      // Release IMAP lock safely
      try {
        lock.release();
      } catch {
        // ignore lock release error if connection is already closed
      }
    }
  } catch (err) {
    console.warn('[poll-gmail-replies] IMAP connection notice:', (err as Error).message);
  } finally {
    try {
      if (client.usable) {
        await client.logout().catch(() => {});
      }
    } catch {
      // ignore cleanup errors
    }
  }

  return processedCount;
}
