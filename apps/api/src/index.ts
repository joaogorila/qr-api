import { createApp } from './app'
import prisma from './prisma'
import redis from './redis'
import { createSendWorker } from './workers/sendWorker'
import { createWebhookWorker } from './workers/webhookWorker'
import { startHealthWorker, stopHealthWorker } from './workers/healthWorker'
import logger from './logger'

const PORT = parseInt(process.env.PORT ?? '4500', 10)

async function bootstrap() {
  // Conecta Redis (lazyConnect = precisa de connect explicito)
  await redis.connect()

  // Verifica conexao Prisma
  await prisma.$connect()
  logger.info('[bootstrap] Prisma conectado')

  // Sobe workers BullMQ
  const sendWorker = createSendWorker()
  const webhookWorker = createWebhookWorker()

  // Worker de health + warmup (setInterval, sem BullMQ)
  startHealthWorker()
  logger.info('[bootstrap] Workers iniciados')

  // Sobe servidor Express
  const app = createApp()
  const server = app.listen(PORT, () => {
    logger.info({ port: PORT }, `[bootstrap] qr-api standalone ouvindo em :${PORT}`)
  })

  // Graceful shutdown
  async function shutdown(signal: string) {
    logger.info({ signal }, '[bootstrap] shutdown recebido')
    server.close()
    stopHealthWorker()
    await sendWorker.close()
    await webhookWorker.close()
    await redis.quit()
    await prisma.$disconnect()
    logger.info('[bootstrap] encerrado com sucesso')
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

bootstrap().catch((err) => {
  logger.error({ err }, '[bootstrap] falha fatal')
  process.exit(1)
})
