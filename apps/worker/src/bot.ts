import { startTelegramBotPoller } from './lib/telegramBot.js';

console.log('====================================================');
console.log('🤖 Telegram Interactive Command Center Bot Launcher');
console.log('====================================================');

startTelegramBotPoller().catch((err) => {
  console.error('[Telegram Bot Fatal Error]:', err);
});
