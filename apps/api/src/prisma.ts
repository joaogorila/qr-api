import { PrismaClient } from '@prisma/client'
import logger from './logger'

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? [{ emit: 'event', level: 'query' }]
    : [],
})

if (process.env.NODE_ENV === 'development') {
  // @ts-expect-error prisma.$on tipagem depende de log config acima
  prisma.$on('query', (e: any) => {
    logger.debug({ query: e.query, duration: e.duration }, '[prisma]')
  })
}

export default prisma
