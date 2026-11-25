import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Locate and load monorepo root .env from multiple candidate paths
const candidateEnvPaths = [
  path.resolve(__dirname, '../../../.env'), // From apps/worker/src or apps/worker/dist to monorepo root
  path.resolve(__dirname, '../../.env'),    // From apps/worker to monorepo root
  path.resolve(process.cwd(), '.env'),      // When executed from monorepo root
  path.resolve(process.cwd(), '../../.env'),// When executed from apps/worker cwd
];

for (const p of candidateEnvPaths) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
  }
}

export const config = {
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  databaseUrl: process.env.DATABASE_URL || '',
  redisUrl: process.env.REDIS_URL || '',
  gmailUser: process.env.GMAIL_USER || '',
  gmailAppPassword: process.env.GMAIL_APP_PASSWORD || '',
  apifyApiToken: process.env.APIFY_API_TOKEN || '',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
  telegramUseWebhook: process.env.TELEGRAM_USE_WEBHOOK || '',
  adminSecret: process.env.ADMIN_SECRET || 'mevin_freelance_9f8a7d6c5b4e3a2f1d0c9b8a7e6f5d4c',
  nextPublicAppUrl: (process.env.NEXT_PUBLIC_APP_URL || 'https://mevin-portfolio.vercel.app').replace(/\/+$/, ''),
  isDev: process.env.NODE_ENV !== 'production',
};
