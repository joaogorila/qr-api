// Operacoes de grupo (Onda 5). Espelha o embedded qrApiGroups.service.ts.

import { evo } from './evolutionClient'
import { resolveInstanceName } from './resolveHelper'

export async function createGroup(
  tenantId: string,
  instanceId: string,
  body: { subject: string; description?: string; participants: string[] },
) {
  const name = await resolveInstanceName(tenantId, instanceId)
  return evo.createGroup(name, body)
}

export async function listGroups(tenantId: string, instanceId: string, withParticipants = false) {
  const name = await resolveInstanceName(tenantId, instanceId)
  return evo.fetchAllGroups(name, withParticipants)
}

export async function getGroup(tenantId: string, instanceId: string, groupJid: string) {
  const name = await resolveInstanceName(tenantId, instanceId)
  return evo.fetchGroupInfo(name, groupJid)
}

export async function getInviteCode(tenantId: string, instanceId: string, groupJid: string) {
  const name = await resolveInstanceName(tenantId, instanceId)
  return evo.fetchInviteCode(name, groupJid)
}

export async function updateParticipants(
  tenantId: string, instanceId: string, groupJid: string,
  action: 'add' | 'remove' | 'promote' | 'demote', participants: string[],
) {
  const name = await resolveInstanceName(tenantId, instanceId)
  return evo.updateParticipant(name, groupJid, action, participants)
}

export async function updateGroupInfo(
  tenantId: string, instanceId: string, groupJid: string,
  data: { subject?: string; description?: string },
) {
  const name = await resolveInstanceName(tenantId, instanceId)
  const results: { subject?: unknown; description?: unknown } = {}
  if (data.subject !== undefined) results.subject = await evo.updateGroupSubject(name, groupJid, data.subject)
  if (data.description !== undefined) results.description = await evo.updateGroupDescription(name, groupJid, data.description)
  return results
}
