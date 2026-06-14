import prisma from '../prisma';

export async function logAction(
  action: string,
  entityType: string,
  entityId: string | null,
  details: any,
  userId: string | null,
  groupId?: string | null
) {
  await prisma.auditLog.create({
    data: {
      actor_user_id: userId ?? undefined,
      group_id: groupId ?? undefined,
      action,
      entity_type: entityType,
      entity_id: entityId ?? undefined,
      details: JSON.stringify(details),
    },
  });
}
