import { registerAs } from '@nestjs/config';

export default registerAs('mpp', () => ({
  secretKey: process.env.MPP_SECRET_KEY || '',
  realm: process.env.MPP_REALM || 'localhost',
  scanApiKey: process.env.SCAN_API_KEY || '',
  scanBaseUrl:
    process.env.SCAN_BASE_URL ||
    'https://api.routescan.io/v2/network/testnet/evm/420420417/etherscan/api',
}));
