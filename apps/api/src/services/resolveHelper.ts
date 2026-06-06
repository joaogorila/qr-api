// Resolve o nome da instancia Evolution de uma instancia qr-api (com checagem de
// tenant). No standalone a instancia guarda evolutionInstanceId DIRETO (sem
// WhatsAppQrAccount). Compartilhado por groups/status/labels.

import prisma from '../prisma'
import { QrApiError } from '@flipt/qr-api-core'

export async function resolveInstanceName(tenantId: string, instanceId: string): Promise<string> {
  const inst = await prisma.qrApiInstance.findFirst({
    where: { id: instanceId, tenantId, revokedAt: null },
    select: { evolutionInstanceId: true },
  })
  if (!inst) throw QrApiError.notFound('Instancia')
  if (!inst.evolutionInstanceId) {
    throw QrApiError.instance('instance_provisioning', 'Instancia ainda sendo provisionada (sem conexao Evolution).')
  }
  return inst.evolutionInstanceId
}
