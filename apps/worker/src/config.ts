import path from 'node:path';
import dotenv from 'dotenv';

// Load root .env
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

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
  nextPublicAppUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  isDev: process.env.NODE_ENV !== 'production',
};
