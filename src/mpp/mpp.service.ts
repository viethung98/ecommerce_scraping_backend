import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import mppConfig from '../config/mpp.config';
import tempoConfig from '../config/tempo.config';

/**
 * Manages the mppx server instance for the MPP (Machine Payment Protocol) integration.
 *
 * Uses dynamic import because mppx is an ESM-only package.
 */
@Injectable()
export class MppService implements OnModuleInit {
	private readonly logger = new Logger(MppService.name);
	private mppxInstance: any;
	private initialized = false;

	constructor(
		@Inject(mppConfig.KEY)
		private readonly mpp: ConfigType<typeof mppConfig>,
		@Inject(tempoConfig.KEY)
		private readonly tempo: ConfigType<typeof tempoConfig>,
	) {}

	async onModuleInit(): Promise<void> {
		if (!this.mpp.secretKey) {
			this.logger.warn(
				'MPP_SECRET_KEY is missing. MPP payment guard is disabled.',
			);
			return;
		}

		if (!this.tempo.merchantAddress) {
			this.logger.warn(
				'TEMPO_MERCHANT_ADDRESS is missing. MPP payment guard is disabled.',
			);
			return;
		}

		try {
			const importDynamic = new Function('specifier', 'return import(specifier)');
			const { Mppx, tempo } = await importDynamic('mppx/server');

			const isTestnet = this.tempo.network.includes('testnet');

			this.mppxInstance = Mppx.create({
				methods: [
					tempo.charge({
						currency: this.tempo.pathUsdAddress as `0x${string}`,
						recipient: this.tempo.merchantAddress as `0x${string}`,
						testnet: isTestnet,
					}),
				],
				realm: this.mpp.realm,
				secretKey: this.mpp.secretKey,
			});

			this.initialized = true;
			this.logger.log(
				`MPP service initialized (${this.tempo.network}, realm: ${this.mpp.realm})`,
			);
		} catch (error) {
			this.logger.error(
				`Failed to initialize MPP service: ${error?.message ?? error}`,
			);
		}
	}

	get instance(): any {
		return this.mppxInstance;
	}

	isInitialized(): boolean {
		return this.initialized;
	}
}
