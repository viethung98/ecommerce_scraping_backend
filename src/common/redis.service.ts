import {
	Inject,
	Injectable,
	Logger,
	OnModuleDestroy,
	OnModuleInit,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import Redis from 'ioredis';
import redisConfig from '../config/redis.config';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(RedisService.name);
	private client: Redis;

	constructor(
		@Inject(redisConfig.KEY)
		private readonly redis: ConfigType<typeof redisConfig>,
	) {}

	async onModuleInit(): Promise<void> {
		const redisOptions: any = {
			host: this.redis.host,
			port: this.redis.port,
			maxRetriesPerRequest: 3,
			lazyConnect: true,
		};

		if (this.redis.password) {
			redisOptions.password = this.redis.password;
		}

		this.client = new Redis(redisOptions);

		this.client.on('connect', () => {
			this.logger.log('Connected to Redis');
		});

		this.client.on('error', (error) => {
			this.logger.error('Redis connection error:', error);
		});

		try {
			await this.client.connect();
		} catch (error) {
			this.logger.error('Failed to connect to Redis:', error);
		}
	}

	async onModuleDestroy(): Promise<void> {
		if (this.client) {
			await this.client.quit();
			this.logger.log('Disconnected from Redis');
		}
	}

	async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
		try {
			if (ttlSeconds) {
				await this.client.setex(key, ttlSeconds, value);
			} else {
				await this.client.set(key, value);
			}
		} catch (error) {
			this.logger.error(`Redis SET error for key ${key}:`, error);
			throw error;
		}
	}

	async get(key: string): Promise<string | null> {
		try {
			return await this.client.get(key);
		} catch (error) {
			this.logger.error(`Redis GET error for key ${key}:`, error);
			throw error;
		}
	}

	async del(key: string): Promise<number> {
		try {
			return await this.client.del(key);
		} catch (error) {
			this.logger.error(`Redis DEL error for key ${key}:`, error);
			throw error;
		}
	}

	async exists(key: string): Promise<boolean> {
		try {
			const result = await this.client.exists(key);
			return result === 1;
		} catch (error) {
			this.logger.error(`Redis EXISTS error for key ${key}:`, error);
			throw error;
		}
	}

	async setnx(
		key: string,
		value: string,
		ttlSeconds?: number,
	): Promise<boolean> {
		try {
			const result = await this.client.setnx(key, value);
			if (result === 1 && ttlSeconds) {
				await this.client.expire(key, ttlSeconds);
			}
			return result === 1;
		} catch (error) {
			this.logger.error(`Redis SETNX error for key ${key}:`, error);
			throw error;
		}
	}

	async acquireLock(
		lockKey: string,
		ttlSeconds: number = 30,
	): Promise<string | null> {
		try {
			const lockValue = `lock:${Date.now()}:${Math.random()}`;
			const acquired = await this.client.set(
				lockKey,
				lockValue,
				'EX',
				ttlSeconds,
				'NX',
			);
			return acquired === 'OK' ? lockValue : null;
		} catch (error) {
			this.logger.error(`Redis lock acquisition error for key ${lockKey}:`, error);
			throw error;
		}
	}

	async releaseLock(lockKey: string, lockValue: string): Promise<boolean> {
		try {
			const script = `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          return redis.call("DEL", KEYS[1])
        else
          return 0
        end
      `;
			const result = await this.client.eval(script, 1, lockKey, lockValue);
			return result === 1;
		} catch (error) {
			this.logger.error(`Redis lock release error for key ${lockKey}:`, error);
			throw error;
		}
	}

	async extendLock(
		lockKey: string,
		lockValue: string,
		ttlSeconds: number,
	): Promise<boolean> {
		try {
			const script = `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          return redis.call("EXPIRE", KEYS[1], ARGV[2])
        else
          return 0
        end
      `;
			const result = await this.client.eval(
				script,
				1,
				lockKey,
				lockValue,
				ttlSeconds.toString(),
			);
			return result === 1;
		} catch (error) {
			this.logger.error(`Redis lock extension error for key ${lockKey}:`, error);
			throw error;
		}
	}

	getClient(): Redis {
		return this.client;
	}
}
