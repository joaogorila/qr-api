import Redis from 'ioredis'
import logger from './logger'

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379'

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null, // necessario para BullMQ
  enableReadyCheck: false,
  lazyConnect: true,
})

redis.on('connect', () => logger.info('[redis] conectado'))
redis.on('error', (err) => logger.error({ err }, '[redis] erro'))

export default redis
