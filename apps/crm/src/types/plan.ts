// Placeholder plan/pricing data — no real billing config exists in this repo
// yet (no Stripe wiring). Unblocks Landing.tsx's PricingGrid until a real
// plan/billing model is defined.

export interface PlanTier {
  name: string;
  price: number;
  tagline: string;
  features: string[];
  color: string;
  badge?: string;
}

export const PLAN_TIERS: Record<string, PlanTier> = {
  free: {
    name: 'Free',
    price: 0,
    tagline: '1 active deal, full feature preview',
    color: '#64748b',
    features: [
      '1 active deal',
      'Property search & underwriting calculator',
      'LOI builder',
      'Market intelligence dashboard',
    ],
  },
  pro: {
    name: 'Pro',
    price: 79,
    tagline: 'Unlimited deals, full pipeline & scoring',
    color: '#3b82f6',
    badge: 'Most popular',
    features: [
      'Unlimited active deals',
      'Deal pipeline (kanban)',
      'Deal scoring engine',
      'Capital raise tracker',
      'Learn A→Z course',
    ],
  },
  team: {
    name: 'Team',
    price: 199,
    tagline: 'Up to 5 members per deal, shared board',
    color: '#8b5cf6',
    features: [
      'Everything in Pro',
      'Up to 5 team members per deal',
      'Shared deal board',
      'Collaborative pipeline checklist',
    ],
  },
};

export const PLAN_ORDER = ['free', 'pro', 'team'] as const;
