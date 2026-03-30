import { registerAs } from '@nestjs/config';

export default registerAs('tempo', () => ({
  network: process.env.TEMPO_NETWORK || 'tempo-testnet',
  rpcUrl: process.env.TEMPO_RPC_URL || 'https://rpc.moderato.tempo.xyz',
  chainId: parseInt(process.env.TEMPO_CHAIN_ID, 10) || 42431,
  merchantAddress: process.env.TEMPO_MERCHANT_ADDRESS || '',
  pathUsdAddress:
    process.env.TEMPO_PATHUSD_ADDRESS ||
    '0x20c0000000000000000000000000000000000000',
  paymentAmountMicro: process.env.TEMPO_PAYMENT_AMOUNT_MICRO || '1000000',
  paymentCurrency: process.env.TEMPO_PAYMENT_CURRENCY || 'pathUSD',
}));
