/**
 * Billing port (plans/phase-2.md 2.5 / D-P2-2). Gateway DEFERRED — this port
 * and the mock adapter are the only billing code for now, so any future
 * gateway (Stripe, Paddle, …) is a pure adapter task. Domain code asks the
 * port "what can this user do?" and never sees a vendor.
 */

export type BillingTier = 'free' | 'monthly' | 'annual';

export interface Entitlement {
  tier: BillingTier;
  /** Coaching surface: plans, drills, spaced repetition, accountability. */
  canUseCoaching: boolean;
}

export interface Billing {
  readonly name: string;
  getEntitlement(userId: string): Promise<Entitlement>;
}
