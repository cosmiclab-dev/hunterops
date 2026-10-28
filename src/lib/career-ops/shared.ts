// Enums shared by the evaluation's server code and its panel.
export const IMPORTANCE = ['critical', 'high', 'meaningful', 'preferred', 'low_signal'] as const;
export const TIERS = ['stated', 'structural', 'inferred'] as const;
export const MATCH = ['strong', 'partial', 'missing', 'na'] as const;
export const EVIDENCE = ['supported', 'partial', 'unknown'] as const;
export const DIMENSIONS = { cv: 'CV match', northStar: 'Fits your target roles', comp: 'Pay', culture: 'Culture signals', redFlags: 'Red flags' } as const;

