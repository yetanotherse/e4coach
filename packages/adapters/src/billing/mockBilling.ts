/** Mock billing adapter (plans/phase-2.md 2.5 / D-P2-2): everyone is on the free tier. */
import type { Billing, BillingTier, Entitlement } from '@chess-coach/core';

export class MockBilling implements Billing {
  readonly name = 'mock';

  constructor(private readonly tier: BillingTier = 'free') {}

  async getEntitlement(_userId: string): Promise<Entitlement> {
    return {
      tier: this.tier,
      canUseCoaching: this.tier === 'monthly' || this.tier === 'annual',
    };
  }
}
