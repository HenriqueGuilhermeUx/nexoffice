/**
 * Production-only go-live lock for account-bound reads/writes.
 *
 * The existing Nexa PF handlers use pooled query() calls, but there is not
 * yet an audited transaction-scoped SET LOCAL app.user_id binding for every
 * request. Catalog RLS checks alone DO NOT prove effective tenant isolation.
 *
 * Keep this lock unconditional until an independently reviewed implementation
 * plus two-user/role-swapping integration tests replaces it. Env flags,
 * preview CI, and presence of RLS policies must NEVER unlock it.
 */
import {ApiError} from './auth.js';

export function requireVerifiedLifeosUserContext():never{
 throw new ApiError(
  503,
  'identity_context_not_ready',
  'O acesso aos dados pessoais Nexa ainda não foi liberado.'
 );
}
