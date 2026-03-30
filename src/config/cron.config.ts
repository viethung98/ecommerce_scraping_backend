import { registerAs } from '@nestjs/config';

export default registerAs('cron', () => ({
  priceRefresh: process.env.PRICE_REFRESH_CRON || '0 */12 * * *',
  fullSync: process.env.FULL_SYNC_CRON || '0 0 * * *',
}));
