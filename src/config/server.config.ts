import { registerAs } from '@nestjs/config';

export default registerAs('server', () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
}));
