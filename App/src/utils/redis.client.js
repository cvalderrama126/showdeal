const { createClient } = require('redis');

let redisClientPromise = null;

function hasRedisConfig() {
  return Boolean(process.env.REDIS_URL);
}

async function getRedisClient() {
  if (!hasRedisConfig()) return null;

  if (!redisClientPromise) {
    const client = createClient({
      url: process.env.REDIS_URL,
      socket: {
        connectTimeout: 1500,
      },
    });

    client.on('error', (error) => {
      console.error('Redis client error:', error?.message || error);
    });

    redisClientPromise = client.connect()
      .then(() => client)
      .catch((error) => {
        console.error('Redis connection failed:', error?.message || error);
        redisClientPromise = null;
        return null;
      });
  }

  return redisClientPromise;
}

async function incrementWithTTL(key, ttlSeconds) {
  const client = await getRedisClient();
  if (!client) return null;

  try {
    const value = await client.incr(key);
    if (value === 1) {
      await client.expire(key, ttlSeconds);
    }
    return value;
  } catch (error) {
    console.error('Redis incrementWithTTL failed:', error?.message || error);
    return null;
  }
}

async function setIfNotExistsWithTTL(key, value, ttlSeconds) {
  const client = await getRedisClient();
  if (!client) return null;

  try {
    const result = await client.set(String(key), String(value), {
      NX: true,
      EX: ttlSeconds,
    });
    return result === 'OK';
  } catch (error) {
    console.error('Redis setIfNotExistsWithTTL failed:', error?.message || error);
    return null;
  }
}

module.exports = {
  getRedisClient,
  incrementWithTTL,
  setIfNotExistsWithTTL,
};
