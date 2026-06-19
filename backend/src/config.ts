export const config = {
  port: parseInt(process.env.PORT || '3000'),
  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
  nodeEnv: process.env.NODE_ENV || 'development',

  minio: {
    endpoint: process.env.MINIO_ENDPOINT || 'minio',
    port: parseInt(process.env.MINIO_PORT || '9000'),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    bucket: process.env.MINIO_BUCKET || 'sharedrive',
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://redis:6379',
  },

  clamav: {
    host: process.env.CLAMAV_HOST || 'clamav',
    port: parseInt(process.env.CLAMAV_PORT || '3310'),
  },
}
