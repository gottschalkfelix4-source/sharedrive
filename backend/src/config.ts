import crypto from 'crypto'
const developmentSecret = crypto.randomBytes(32).toString('hex')
export const config = {
  port: Number(process.env.PORT || 3000),
  get jwtSecret() {
    return process.env.JWT_SECRET || developmentSecret
  },
  nodeEnv: process.env.NODE_ENV || 'development',
  minio: {
    endpoint: process.env.MINIO_ENDPOINT || 'minio',
    port: Number(process.env.MINIO_PORT || 9000),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    get accessKey() {
      return process.env.MINIO_ACCESS_KEY || 'minioadmin'
    },
    get secretKey() {
      return process.env.MINIO_SECRET_KEY || 'minioadmin'
    },
    bucket: process.env.MINIO_BUCKET || 'sharedrive',
  },
  redis: { url: process.env.REDIS_URL || 'redis://redis:6379' },
  clamav: {
    host: process.env.CLAMAV_HOST || 'clamav',
    port: Number(process.env.CLAMAV_PORT || 3310),
  },
}
