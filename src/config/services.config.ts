import { registerAs } from '@nestjs/config';

export default registerAs('services', () => ({
  meilisearchHost:
    process.env.MEILISEARCH_HOST || 'http://localhost:7700',
  meilisearchApiKey: process.env.MEILISEARCH_API_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4',
  apifyApiToken: process.env.APIFY_API_TOKEN || '',
  amazonAffiliateTag: process.env.AMAZON_AFFILIATE_TAG || '',
  comagentBaseUrl:
    process.env.COMAGENT_BASE_URL || 'http://localhost:3001',
  depositWebhookSecret: process.env.DEPOSIT_WEBHOOK_SECRET || '',
}));
