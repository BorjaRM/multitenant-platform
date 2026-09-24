export type AuthorizedTenantContext = Readonly<{ identityId: string; organizationId: string }>;
export type CustomerInput = { fullName: string; email: string; organizationId?: string };
export type Entity = { id: string; organizationId: string };
export type BookingInput = { customerId: string; sessionId: string; organizationId?: string };
export interface Repositories {
  createCustomer(input: CustomerInput): Promise<Entity>;
  listCustomers(): Promise<Entity[]>;
  book(input: BookingInput): Promise<{ entity: Entity; created: boolean }>;
  appendAudit(type: 'customer' | 'booking', entity: Entity): Promise<void>;
  appendOutbox(type: 'customer' | 'booking', entity: Entity): Promise<void>;
  idempotent(key: string, fingerprint: string, operation: () => Promise<Entity>): Promise<Entity>;
}
export interface TenantUnitOfWork {
  execute<Result>(
    context: AuthorizedTenantContext,
    operation: (repositories: Repositories) => Promise<Result>,
  ): Promise<Result>;
}
function validateTenant(context: AuthorizedTenantContext, input: { organizationId?: string }) {
  if (!context?.organizationId) throw new Error('Authorized tenant context required');
  if (input.organizationId !== undefined && input.organizationId !== context.organizationId)
    throw new Error('Input tenant mismatch');
}
export async function createCustomer(
  unitOfWork: TenantUnitOfWork,
  context: AuthorizedTenantContext,
  input: CustomerInput,
  key: string,
): Promise<Entity> {
  validateTenant(context, input);
  if (!input.fullName?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))
    throw new Error('Invalid customer input');
  const normalized = { fullName: input.fullName.trim(), email: input.email.trim().toLowerCase() };
  return unitOfWork.execute(context, (repositories) =>
    repositories.idempotent(key, JSON.stringify(['customer', normalized]), async () => {
      const entity = await repositories.createCustomer(normalized);
      await repositories.appendAudit('customer', entity);
      await repositories.appendOutbox('customer', entity);
      return entity;
    }),
  );
}
export async function bookSession(
  unitOfWork: TenantUnitOfWork,
  context: AuthorizedTenantContext,
  input: BookingInput,
  key: string,
): Promise<Entity> {
  validateTenant(context, input);
  if (!input.customerId || !input.sessionId) throw new Error('Invalid booking input');
  return unitOfWork.execute(context, (repositories) =>
    repositories.idempotent(
      key,
      JSON.stringify(['booking', input.customerId, input.sessionId]),
      async () => {
        const { entity, created } = await repositories.book(input);
        if (created) {
          await repositories.appendAudit('booking', entity);
          await repositories.appendOutbox('booking', entity);
        }
        return entity;
      },
    ),
  );
}
