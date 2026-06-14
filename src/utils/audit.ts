// src/utils/audit.ts
import { prisma } from "../server";

/**
 * Helper to create an audit log entry.
 * @param action - e.g., "CREATE", "UPDATE", "DELETE"
 * @param entityType - e.g., "expense", "import", "settlement", "group", "membership"
 * @param entityId - UUID of the affected entity (if any)
 * @param details - Arbitrary JSON/string with context
 * @param userId - UUID of the user performing the action
 * @param groupId - (optional) group context
 */
export async function logAction(
  action: string,
  entityType: string,
  entityId: string | null,
  details: any,
  userId: string | null,
  groupId?: string | null
) {
  await prisma.audit_logs.create({
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
