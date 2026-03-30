import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  url: process.env.DB_URL || '',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'amazon_shopping_agent',
  synchronize: asBoolean(process.env.DB_SYNCHRONIZE || 'false'),
  migrationsRun: asBoolean(process.env.DB_MIGRATIONS_RUN || 'false'),
}));

function asBoolean(value: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}
