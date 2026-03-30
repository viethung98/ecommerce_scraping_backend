import { registerAs } from '@nestjs/config';

export default registerAs('polkadot', () => ({
  network: process.env.POLKADOT_NETWORK || 'polkadot',
  merchantAddress: process.env.POLKADOT_MERCHANT_ADDRESS || '',
  paymentAmountPlanck:
    process.env.POLKADOT_PAYMENT_AMOUNT_PLANCK || '1000000000',
  currencySymbol: process.env.POLKADOT_CURRENCY_SYMBOL || 'DOT',
}));
