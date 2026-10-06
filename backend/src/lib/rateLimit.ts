import rateLimit from 'express-rate-limit'
import { RedisStore } from 'rate-limit-redis'
import { createClient } from 'redis'
import { config } from '../config'

export const redisClient = createClient({ url: config.redis.url })
redisClient.on('error', () => console.error('Redis temporarily unavailable'))
let connecting: Promise<void> | undefined
export async function connectRedis(): Promise<void> {
  if (!redisClient.isOpen) {
    connecting ??= redisClient.connect().then(() => {})
    await connecting
  }
}
export function rateLimiter(prefix: string, limit: number, windowMs: number) {
  return rateLimit({
    windowMs,
    max: limit,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      prefix: `sharedrive:${prefix}:`,
      sendCommand: async (...args: string[]) => {
        await connectRedis()
        return redisClient.sendCommand(args)
      },
    }),
    // Failure of the shared limit store must not silently remove protection.
    passOnStoreError: false,
  })
}
