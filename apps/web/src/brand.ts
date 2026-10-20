/**
 * NexOffice distribution identity. This module is intentionally side-effect free:
 * changing the label must never change authentication, tenant selection or data APIs.
 *
 * Enable Nexa PJ only from a trusted deployment configuration; do not infer it
 * from a query parameter, hash fragment or untrusted postMessage.
 */
export type ProductBrand = 'nexoffice' | 'nexa-pj';

export type BrandIdentity = Readonly<{
  id: ProductBrand;
  productName: string;
  eyebrow: string;
  description: string;
  homePath: string;
  themeClass: string;
}>;

const BRANDS: Record<ProductBrand, BrandIdentity> = {
  nexoffice: {
    id: 'nexoffice',
    productName: 'NexOffice',
    eyebrow: 'NEXOFFICE',
    description: 'O sistema operacional do seu negócio.',
    homePath: '/',
    themeClass: 'brand-nexoffice',
  },
  'nexa-pj': {
    id: 'nexa-pj',
    productName: 'Nexa PJ',
    eyebrow: 'NEXA PJ',
    description: 'Sua empresa, suas finanças e sua operação em um só lugar.',
    homePath: '/pj',
    themeClass: 'brand-nexa-pj',
  },
};

/** Server/build-verified brand; unknown variants fail closed to NexOffice. */
export function resolveBrand(variant: string | undefined | null): BrandIdentity {
  return variant === 'nexa-pj' ? BRANDS['nexa-pj'] : BRANDS.nexoffice;
}

/**
 * No connection to Nexa tokens or wallet is made here.
 * The authentication bridge must be implemented server-side separately,
 * with verified user, workspace membership, scoped session and CSRF protection.
 */
