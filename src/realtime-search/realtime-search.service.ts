import { Injectable, Logger } from '@nestjs/common';
import {
	NormalizedProduct,
	SearchFilters,
	SearchResult,
} from '../common/interfaces';
import { NormalizationService } from '../normalization/normalization.service';
import { ApifyClientService } from './apify-client.service';

@Injectable()
export class RealtimeSearchService {
	private readonly logger = new Logger(RealtimeSearchService.name);

	constructor(
		private readonly apifyClient: ApifyClientService,
		private readonly normalization: NormalizationService,
	) {}

	/**
	 * Perform realtime search via Apify e-commerce scraping tool
	 */
	async search(
		query: string,
		filters?: SearchFilters,
		page: number = 1,
		limit: number = 20,
	): Promise<SearchResult> {
		const startTime = Date.now();

		try {
			// Call Apify e-commerce scraping tool
			const apifyResponse = await this.apifyClient.searchAmazon(query, filters, {
				limit,
				page,
			});
			this.logger.debug(`Apify raw items: ${apifyResponse.data.items.length}`);
			if (apifyResponse.data.items.length > 0) {
				this.logger.debug(
					`Sample item keys: ${Object.keys(apifyResponse.data.items[0]).join(', ')}`,
				);
			}

			// Normalize results
			let normalizedProducts = this.normalization.normalizeAndValidate(
				apifyResponse.data.items,
			);
			this.logger.debug(
				`After normalization: ${normalizedProducts.length} products`,
			);

			// Apply price filtering as post-processing
			// The Apify actor does not support price range parameters natively
			normalizedProducts = this.applyPriceFilter(normalizedProducts, filters);

			const executionTime = Date.now() - startTime;
			const total = normalizedProducts.length;
			const totalPage = Math.ceil(total / limit);

			return {
				products: normalizedProducts,
				total,
				page,
				limit,
				totalPage,
				source: 'realtime',
				query,
				executionTime,
			};
		} catch (error) {
			this.logger.error(`Realtime search failed: ${error.message}`, error.stack);
			throw error;
		}
	}

	/**
	 * Get product by ASIN (realtime)
	 */
	async getProductByAsin(asin: string): Promise<any> {
		try {
			this.logger.log(`Realtime product fetch: ${asin}`);

			const rawProduct = await this.apifyClient.getProductByAsin(asin);
			const normalized = this.normalization.normalize(rawProduct);

			if (!normalized) {
				throw new Error(`Failed to normalize product ${asin}`);
			}

			return normalized;
		} catch (error) {
			this.logger.error(`Realtime product fetch failed: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Filter products by price range after normalization.
	 * Applied as post-processing because the Apify actor does not support
	 * price range input parameters natively.
	 */
	private applyPriceFilter(
		products: NormalizedProduct[],
		filters?: SearchFilters,
	): NormalizedProduct[] {
		if (!filters) return products;

		const { minPrice, maxPrice } = filters;
		if (minPrice === undefined && maxPrice === undefined) return products;

		return products.filter((product) => {
			if (product.price === undefined || product.price === null) return false;
			if (minPrice !== undefined && product.price < minPrice) return false;
			if (maxPrice !== undefined && product.price > maxPrice) return false;
			return true;
		});
	}

	/**
	 * Check if Apify service is available
	 */
	async isAvailable(): Promise<boolean> {
		try {
			return await this.apifyClient.healthCheck();
		} catch (error) {
			return false;
		}
	}
}
