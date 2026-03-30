import { SearchFilters } from '@/common/interfaces';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { ApifyClient } from 'apify-client';
import servicesConfig from '../config/services.config';

interface ApifyDatasetItem {
	title: string;
	price: number;
	originalPrice?: number;
	rating?: number;
	reviewCount?: number;
	asin: string;
	imageUrl: string;
	productUrl: string;
	category?: string;
	brand?: string;
	availability: boolean;
	// other fields from Apify
}

interface ApifySearchInput {
	keyword?: string;
	listingUrls?: Array<{ url: string }>;
	marketplaces?: string[];
	maxProductResults: number;
	countryCode: string;
	scrapeMode: string;
	additionalProperties: boolean;
	additionalPropertiesSearchEngine: boolean;
	additionalReviewProperties: boolean;
	scrapeInfluencerProducts: boolean;
	scrapeReviewsDelivery: boolean;
	sortReview: string;
}

@Injectable()
export class ApifyClientService {
	private readonly logger = new Logger(ApifyClientService.name);
	private readonly actorId = 'apify/e-commerce-scraping-tool';
	private readonly client: ApifyClient;

	constructor(
		@Inject(servicesConfig.KEY)
		private readonly services: ConfigType<typeof servicesConfig>,
	) {
		this.client = new ApifyClient({
			token: this.services.apifyApiToken,
		});
	}

	/**
	 * Search Amazon via Apify e-commerce scraping tool.
	 * Uses Amazon listing URLs with query parameters for native filtering
	 * (sort, price range) when filters are provided, falling back to
	 * keyword-only search otherwise.
	 */
	async searchAmazon(
		query: string,
		filters: SearchFilters,
		options?: {
			limit?: number;
			page?: number;
		},
	): Promise<{
		success: boolean;
		data: {
			items: any[];
			total?: number;
		};
		timestamp: string;
		source: string;
	}> {
		try {
			const { limit = 20, page = 1 } = options || {};
			const amazonSearchUrl = this.buildAmazonSearchUrl(query, filters, page);

			const input: ApifySearchInput = {
				listingUrls: [{ url: amazonSearchUrl }],
				maxProductResults: limit,
				countryCode: 'vn',
				scrapeMode: 'AUTO',
				additionalProperties: true,
				additionalPropertiesSearchEngine: true,
				additionalReviewProperties: false,
				scrapeInfluencerProducts: false,
				scrapeReviewsDelivery: false,
				sortReview: 'Most recent',
			};

			const run = await this.client.actor(this.actorId).call(input);

			const dataset = await this.client.dataset(run.defaultDatasetId || run.id);
			const results = await dataset.listItems();

			this.logger.log(`Apify search completed: ${results.items.length} results`);

			return {
				success: true,
				data: results,
				timestamp: new Date().toISOString(),
				source: 'apify',
			};
		} catch (error) {
			this.logger.error(`Apify search failed: ${error.message}`, error.stack);
			throw new Error(`Apify search failed: ${error.message}`);
		}
	}

	/**
	 * Build an Amazon search URL with native query parameters for filtering.
	 * This lets the Apify actor scrape a pre-filtered Amazon results page
	 * instead of relying on post-processing.
	 */
	buildAmazonSearchUrl(
		query: string,
		filters: SearchFilters,
		page: number = 1,
	): string {
		const keywordParts = [query];

		if (filters.category) keywordParts.push(filters.category);
		if (filters.brand) keywordParts.push(filters.brand);
		if (filters.color) keywordParts.push(filters.color);
		if (filters.size) keywordParts.push(filters.size);

		const params = new URLSearchParams();
		params.set('k', keywordParts.join(' '));

		// Amazon sort parameter
		if (filters.sortBy) {
			const sortMap: Record<string, string> = {
				price_asc: 'price-asc-rank',
				price_desc: 'price-desc-rank',
				rating: 'review-rank',
				newest: 'date-desc-rank',
				popular: 'exact-aware-popularity-rank',
				relevance: 'relevanceblender',
			};
			const sortValue = sortMap[filters.sortBy];
			if (sortValue) {
				params.set('s', sortValue);
			}
		}

		// Amazon price range filter (rh parameter)
		if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
			const min = filters.minPrice ?? 0;
			const max = filters.maxPrice ?? '';
			// Amazon uses cents for price range in the rh parameter
			const minCents = Math.round(min * 100);
			const maxCents = max !== '' ? Math.round((max as number) * 100) : '';
			params.set('rh', `p_36:${minCents}-${maxCents}`);
		}

		// Amazon Prime filter
		if (filters.prime) {
			params.append('rh', 'p_85:2470955011');
		}

		// Amazon condition filter
		if (filters.condition) {
			const conditionMap: Record<string, string> = {
				new: 'p_n_condition-type:6461716011',
				used: 'p_n_condition-type:6461718011',
				refurbished: 'p_n_condition-type:6461717011',
			};
			const conditionValue = conditionMap[filters.condition];
			if (conditionValue) {
				params.append('rh', conditionValue);
			}
		}

		// Pagination
		if (page > 1) {
			params.set('page', String(page));
		}

		return `https://www.amazon.com/s?${params.toString()}`;
	}

	/**
	 * Get product details by ASIN via Apify using direct product URL
	 */
	async getProductByAsin(asin: string): Promise<any> {
		try {
			this.logger.log(`Apify product request: ${asin}`);
			const input = {
				detailsUrls: [{ url: `https://www.amazon.com/dp/${asin}` }],
				maxProductResults: 1,
				countryCode: 'vn',
				scrapeMode: 'AUTO',
				additionalProperties: true,
				additionalPropertiesSearchEngine: false,
				additionalReviewProperties: false,
				scrapeInfluencerProducts: false,
				scrapeReviewsDelivery: false,
				sortReview: 'Most recent',
			};

			const run = await this.client.actor(this.actorId).call(input);

			this.logger.log(`Apify run started: ${run.id}`);

			const dataset = await this.client.dataset(run.defaultDatasetId || run.id);
			const results = await dataset.listItems();

			if (results.items.length === 0) {
				throw new Error(`Product ${asin} not found`);
			}

			return results.items[0];
		} catch (error) {
			this.logger.error(`Apify product fetch failed: ${error.message}`);
			throw new Error(`Apify product fetch failed: ${error.message}`);
		}
	}

	/**
	 * Check Apify API health
	 */
	async healthCheck(): Promise<boolean> {
		try {
			await this.client.user().get();
			return true;
		} catch (error) {
			this.logger.warn(`Apify health check failed: ${error.message}`);
			return false;
		}
	}
}
