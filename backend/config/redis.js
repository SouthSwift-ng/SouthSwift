const { createClient } = require('redis');

let redisClient;

const initRedis = async () => {
  try {
    redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      retry_strategy: (options) => {
        if (options.error && options.error.code === 'ECONNREFUSED') {
          console.warn('⚠️  Redis server refused connection. Using memory fallback.');
          return null;
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
          console.warn('⚠️  Redis retry time exhausted. Using memory fallback.');
          return null;
        }
        return Math.min(options.attempt * 100, 3000);
      }
    });

    redisClient.on('error', (err) => {
      console.warn('⚠️  Redis client error (using memory fallback):', err.message);
    });

    redisClient.on('connect', () => {
      console.log('✅ Redis connected successfully');
    });

    await redisClient.connect();
  } catch (error) {
    console.warn('⚠️  Failed to connect to Redis, using memory fallback:', error.message);
    redisClient = null;
  }
};

// In-memory fallback for when Redis is unavailable
const memoryStore = new Map();

// Redis wrapper with memory fallback
const redis = {
  async setEx(key, seconds, value) {
    if (redisClient && redisClient.isReady) {
      try {
        return await redisClient.setEx(key, seconds, value);
      } catch (error) {
        console.warn('Redis setEx failed, using memory:', error.message);
      }
    }
    
    // Memory fallback
    memoryStore.set(key, { value, expires: Date.now() + (seconds * 1000) });
    setTimeout(() => memoryStore.delete(key), seconds * 1000);
    return 'OK';
  },

  async get(key) {
    if (redisClient && redisClient.isReady) {
      try {
        return await redisClient.get(key);
      } catch (error) {
        console.warn('Redis get failed, using memory:', error.message);
      }
    }
    
    // Memory fallback
    const item = memoryStore.get(key);
    if (item && Date.now() < item.expires) {
      return item.value;
    }
    if (item) {
      memoryStore.delete(key);
    }
    return null;
  },

  async del(key) {
    if (redisClient && redisClient.isReady) {
      try {
        return await redisClient.del(key);
      } catch (error) {
        console.warn('Redis del failed, using memory:', error.message);
      }
    }
    
    // Memory fallback
    return memoryStore.delete(key) ? 1 : 0;
  },

  async exists(key) {
    if (redisClient && redisClient.isReady) {
      try {
        return await redisClient.exists(key);
      } catch (error) {
        console.warn('Redis exists failed, using memory:', error.message);
      }
    }
    
    // Memory fallback
    const item = memoryStore.get(key);
    if (item && Date.now() < item.expires) {
      return 1;
    }
    if (item) {
      memoryStore.delete(key);
    }
    return 0;
  },

  async ttl(key) {
    if (redisClient && redisClient.isReady) {
      try {
        return await redisClient.ttl(key);
      } catch (error) {
        console.warn('Redis ttl failed, using memory:', error.message);
      }
    }

    // Memory fallback
    const item = memoryStore.get(key);
    if (!item) return -2;

    const remaining = Math.round((item.expires - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  }
};

module.exports = { initRedis, redis };