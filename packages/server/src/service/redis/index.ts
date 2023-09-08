import Redis from 'ioredis';
import type { Cluster } from 'ioredis';

import { RedisSetupException } from '@/service/redis/exceptions';
import { REDIS_ADDR } from '@/common/env-vars';

export const REDIS_KEY_NAMESPACE_PREFIX = `sandbox:`;
const CLUSTER_DISABLED = true;

const connect2Client = async (redisRawNodes: string, plainPassword?: string, c?: boolean) => {
  let redisClient: Redis | Cluster;

  const nodes = redisRawNodes
    ?.split(',')
    .filter((u) => !!u)
    .map((u) => {
      const [host, port] = u.replace('redis://', '').split(':');
      return {
        host: host,
        port: Number(port),
        password: plainPassword,
      };
    });

  let natMap;

  if (c) {
    redisClient = new Redis.Cluster(nodes, {
      keyPrefix: REDIS_KEY_NAMESPACE_PREFIX,
      natMap,
      redisOptions: {
        // need to connect to each nodes
        password: plainPassword,
      },
      clusterRetryStrategy(times, reason) {
        if (times > MAX_CONNECT_TIMES) {
          return null;
        }
        return Math.min(100 + times * 2, 2000);
      },
    });
  } else {
    redisClient = new Redis({
      ...nodes[0],
      keyPrefix: REDIS_KEY_NAMESPACE_PREFIX,
    });
  }

  await redisClient.ping();

  return redisClient;
};

let connectedClient: Cluster | Redis;
const MAX_CONNECT_TIMES = 30;
export const setUpRedis = async () => {
  try {
    // let redisRawNodes = 'localhost:7000';
    const redisRawNodes: string = REDIS_ADDR;

    if (!(redisRawNodes)) {
      throw new Error('----redis info error');
    }

    connectedClient = await connect2Client(redisRawNodes, '', !CLUSTER_DISABLED);

    return connectedClient;
  } catch (error: any) {
    throw new RedisSetupException(
      `redis setup timeout`,
    );
  }
};

export const getClient = () => {
  if (!connectedClient) {
    throw new Error('do not invoke redis before setup');
  }
  return connectedClient;
};
