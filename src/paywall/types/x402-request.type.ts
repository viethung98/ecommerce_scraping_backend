export interface X402PaymentContext {
  blockHash: string;
  recipient: string;
  network: string;
  token: string;
  amountPlanck: string;
  payer?: string;
}
