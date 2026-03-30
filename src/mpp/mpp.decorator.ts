import { SetMetadata } from '@nestjs/common';

export const MPP_CHARGE_METADATA_KEY = 'mpp_charge';
export const MPP_SESSION_METADATA_KEY = 'mpp_session';

export interface MppChargeOptions {
  /** Payment amount in token units (e.g. '0.1' for 0.1 pathUSD). */
  amount: string;
  /** Optional human-readable description of the payment. */
  description?: string;
}

export interface MppSessionOptions {
  /** Payment amount per unit (e.g. '0.01' per request). */
  amount: string;
  /** Unit type label (e.g. 'request', 'photo'). */
  unitType?: string;
  /** Optional human-readable description. */
  description?: string;
}

/**
 * Mark an endpoint as requiring a one-time MPP charge.
 *
 * @example
 * ```ts
 * @MppCharge({ amount: '0.1' })
 * @Get('premium')
 * getPremium() { ... }
 * ```
 */
export const MppCharge = (options: MppChargeOptions) =>
  SetMetadata(MPP_CHARGE_METADATA_KEY, options);

/**
 * Mark an endpoint as requiring an MPP session (pay-as-you-go).
 *
 * @example
 * ```ts
 * @MppSession({ amount: '0.01', unitType: 'request' })
 * @Get('api')
 * getApi() { ... }
 * ```
 */
export const MppSession = (options: MppSessionOptions) =>
  SetMetadata(MPP_SESSION_METADATA_KEY, options);
