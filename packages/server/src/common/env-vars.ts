import { EnvNotFoundException } from '@/common/exceptions';

if (
  !(
    process.env.PORT &&
    process.env.OSS_DOMAIN_NAME &&
    process.env.REDIS_ADDR &&
    process.env.SERVICE_DOMAIN_NAME
  )
) {
  throw new EnvNotFoundException(JSON.stringify(process.env));
}

export const {
  PORT,
  SENTRY_DSN,
  OSS_DOMAIN_NAME,
  SERVICE_DOMAIN_NAME,
  REDIS_ADDR,
} = process.env;
