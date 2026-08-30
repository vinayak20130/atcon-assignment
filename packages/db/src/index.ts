/**
 * Database access.
 *
 * Exposes the generated client directly rather than wrapping it in a repository
 * layer — the domain rules that matter live in @atcon/shared as pure functions,
 * and another abstraction over Prisma would add indirection without a boundary
 * worth defending.
 */
export * from '@prisma/client';
export { PrismaClient, Prisma } from '@prisma/client';
