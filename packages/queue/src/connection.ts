import type { ConnectionOptions } from "bullmq";
import { Redis } from "ioredis";

export type RedisConnection = Redis;

/** Cast shared ioredis instance for BullMQ (duplicate nested ioredis types). */
export function toBullConnection(conn: RedisConnection): ConnectionOptions {
  return conn as ConnectionOptions;
}

/** Shared Redis connection for BullMQ (requires maxRetriesPerRequest: null). */
export function makeRedisConnection(redisUrl: string): RedisConnection {
  return new Redis(redisUrl, { maxRetriesPerRequest: null });
}
