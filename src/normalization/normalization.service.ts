import { Injectable, Logger } from '@nestjs/common';
import { NormalizedProduct, RawAmazonProduct } from '../common/interfaces';
import {
	calculateDiscount,
	cleanText,
	extractAsin,
	isAvailable,
	parsePrice,
	parseRating,
	parseReviewCount,
} from '../common/utils/helpers';

@Injectable()
export class NormalizationService {
	private readonly logger = new Logger(NormalizationService.name);

	/**
	 * Normalize a single raw product
	 */
	normalize(raw: any): NormalizedProduct | null {
		try {
			// Detect Apify response format:
			// - Detail/keyword results have `additionalProperties` as object
			// - Listing URL results may use flat fields like `name`, `offers`, `image`
			const isApifyFormat =
				(raw.additionalProperties &&
					typeof raw.additionalProperties === 'object') ||
				raw.offers !== undefined ||
				(raw.name !== undefined && raw.image !== undefined);

			let asin: string;
			let title: string;
			let price: any;
			let listPrice: any;
			let rating: any;
			let reviewsCount: any;
			let availability: any;
			let brand: string;
			let category: string;
			let description: string;
			let url: string;
			let images: any[];

			if (isApifyFormat) {
				// Extract ASIN from multiple possible locations
				asin =
					raw.additionalProperties?.asin ||
					raw.asin ||
					raw.id ||
					(raw.url ? extractAsin(raw.url) : null) ||
					(raw.productUrl ? extractAsin(raw.productUrl) : null);

				title = cleanText(raw.name || raw.title);

				// Price can be in offers object or flat
				price =
					raw.offers?.price ??
					raw.price ??
					raw.currentPrice ??
					raw.salePrice;
				listPrice =
					raw.additionalProperties?.listPrice?.value ??
					raw.listPrice ??
					raw.originalPrice ??
					raw.wasPrice;

				rating =
					raw.additionalProperties?.stars ??
					raw.stars ??
					raw.rating ??
					raw.aggregateRating?.ratingValue;
				reviewsCount =
					raw.additionalProperties?.reviewsCount ??
					raw.reviewsCount ??
					raw.reviewCount ??
					raw.aggregateRating?.reviewCount;

				availability =
					raw.additionalProperties?.inStock ??
					raw.inStock ??
					raw.availability ??
					(raw.offers?.availability
						? raw.offers.availability.includes('InStock')
						: true);

				brand = cleanText(
					raw.brand?.name || raw.brand?.slogan || raw.brand,
				);
				category = this.extractCategoryFromBreadcrumbs(
					raw.additionalProperties?.breadCrumbs || raw.breadcrumbs,
				);
				description = cleanText(raw.description);
				url = raw.url || raw.productUrl;
				images = this.extractApifyImages(raw);
			} else {
				// Original / legacy format
				asin = raw.asin || (raw.url ? extractAsin(raw.url) : null);
				title = cleanText(raw.title);
				price = raw.price;
				listPrice = raw.listPrice || raw.price;
				rating = raw.rating;
				reviewsCount = raw.reviewsCount;
				availability = raw.availability;
				brand = cleanText(raw.brand);
				category = raw.category;
				description = cleanText(raw.description);
				url = raw.url;
				images = raw.images || [];
			}

			if (!asin) {
				this.logger.warn('Product missing ASIN, skipping');
				return null;
			}

			// Parse prices
			const currentPrice = parsePrice(price);
			const originalPrice = parsePrice(listPrice);

			// Parse rating and reviews
			const parsedRating = parseRating(rating);
			const reviewCount = parseReviewCount(reviewsCount);

			// Calculate discount
			const discountPercent =
				currentPrice && originalPrice
					? calculateDiscount(originalPrice, currentPrice)
					: 0;

			// Parse availability
			const available = isAvailable(availability);

			// Extract images (use Apify images if available)
			const extractedImages = isApifyFormat ? images : this.extractImages(raw);

			// Extract features and specifications
			const features = isApifyFormat
				? this.extractFeaturesFromApify(raw.additionalProperties?.features)
				: this.extractFeatures(raw);

			const specifications = isApifyFormat
				? this.extractSpecificationsFromAttributes(
						raw.additionalProperties?.attributes || [],
					)
				: this.extractSpecifications(raw);

			// Build normalized product
			const normalized: NormalizedProduct = {
				asin,
				title: title || 'Unknown Product',
				description: description || undefined,
				brand: brand || undefined,
				category: category || undefined,
				price: currentPrice,
				originalPrice: currentPrice !== originalPrice ? originalPrice : undefined,
				discountPercent: discountPercent > 0 ? discountPercent : undefined,
				rating: parsedRating,
				reviewCount: reviewCount || undefined,
				available,
				images: extractedImages,
				productUrl: url || `https://www.amazon.com/dp/${asin}`,
				seller: cleanText(raw.seller?.name || raw.seller) || undefined,
				fulfillment: raw.isPrime ? 'Prime' : undefined,
				features: features && features.length > 0 ? features : undefined,
				specifications:
					specifications && Object.keys(specifications).length > 0
						? specifications
						: undefined,
				lastUpdated: new Date(),
			};

			return normalized;
		} catch (error) {
			this.logger.error(
				`Failed to normalize product: ${error.message}`,
				error.stack,
			);
			return null;
		}
	}

	/**
	 * Normalize multiple raw products
	 */
	normalizeBatch(rawProducts: any[]): NormalizedProduct[] {
		this.logger.log(`Normalizing ${rawProducts.length} products...`);

		const normalized: NormalizedProduct[] = [];
		for (const raw of rawProducts) {
			const product = this.normalize(raw);
			if (product) {
				normalized.push(product);
			} else {
				this.logger.debug(
					`Failed to normalize item: ${JSON.stringify({ name: raw.name, title: raw.title, url: raw.url, keys: Object.keys(raw).slice(0, 10) })}`,
				);
			}
		}

		this.logger.log(
			`Successfully normalized ${normalized.length}/${rawProducts.length} products`,
		);

		return normalized;
	}

	/**
	 * Extract images from Apify response (handles multiple field shapes)
	 */
	private extractApifyImages(raw: any): string[] {
		const images: string[] = [];

		// Single image field
		if (typeof raw.image === 'string' && raw.image) {
			images.push(raw.image);
		}

		// Array of images
		if (Array.isArray(raw.images)) {
			for (const img of raw.images) {
				if (typeof img === 'string' && img) images.push(img);
				else if (typeof img === 'object' && img?.url) images.push(img.url);
			}
		}

		// Thumbnail
		if (typeof raw.thumbnail === 'string' && raw.thumbnail && images.length === 0) {
			images.push(raw.thumbnail);
		}

		// additionalProperties images
		if (Array.isArray(raw.additionalProperties?.images)) {
			for (const img of raw.additionalProperties.images) {
				if (typeof img === 'string' && img) images.push(img);
				else if (typeof img === 'object' && img?.url) images.push(img.url);
			}
		}

		return [...new Set(images)]; // deduplicate
	}

	/**
	 * Extract images from raw product
	 */
	private extractImages(raw: RawAmazonProduct): string[] {
		if (Array.isArray(raw.images)) {
			return raw.images.filter((img) => typeof img === 'string' && img.length > 0);
		}

		if (typeof raw.images === 'string') {
			return [raw.images];
		}

		// Check for common image field variations
		const imageFields = ['image', 'imageUrl', 'thumbnail', 'mainImage'];
		for (const field of imageFields) {
			if (raw[field] && typeof raw[field] === 'string') {
				return [raw[field]];
			}
		}

		return [];
	}

	/**
	 * Extract features from raw product
	 */
	private extractFeatures(raw: RawAmazonProduct): string[] | undefined {
		if (Array.isArray(raw.features) && raw.features.length > 0) {
			const cleaned = raw.features
				.map((f) => cleanText(f))
				.filter((f) => f && f.length > 0);
			return cleaned.length > 0 ? cleaned : undefined;
		}

		if (Array.isArray(raw.bulletPoints) && raw.bulletPoints.length > 0) {
			const cleaned = raw.bulletPoints
				.map((f) => cleanText(f))
				.filter((f) => f && f.length > 0);
			return cleaned.length > 0 ? cleaned : undefined;
		}

		return undefined;
	}

	/**
	 * Extract specifications from raw product
	 */
	private extractSpecifications(
		raw: RawAmazonProduct,
	): Record<string, any> | undefined {
		if (
			raw.specifications &&
			typeof raw.specifications === 'object' &&
			Object.keys(raw.specifications).length > 0
		) {
			return raw.specifications;
		}

		if (
			raw.productDetails &&
			typeof raw.productDetails === 'object' &&
			Object.keys(raw.productDetails).length > 0
		) {
			return raw.productDetails;
		}

		return undefined;
	}

	/**
	 * Validate normalized product
	 */
	validate(product: NormalizedProduct): boolean {
		if (!product.asin || product.asin.length === 0) {
			this.logger.warn(`Missing ASIN, skipping product: ${product.title}`);
			return false;
		}

		if (!product.title || product.title.length < 3) {
			this.logger.warn(`Invalid title for ASIN ${product.asin}`);
			return false;
		}

		if (
			product.rating !== undefined &&
			product.rating !== null &&
			(product.rating < 0 || product.rating > 5)
		) {
			this.logger.warn(
				`Invalid rating for ASIN ${product.asin}: ${product.rating}`,
			);
			return false;
		}

		return true;
	}

	/**
	 * Extract category from breadcrumbs (Apify format)
	 */
	private extractCategoryFromBreadcrumbs(
		breadCrumbs?: string,
	): string | undefined {
		if (!breadCrumbs) return undefined;

		// Split by common separators and get the last meaningful category
		const categories = breadCrumbs
			.split(/[>|,]/)
			.map((cat) => cleanText(cat.trim()));

		// Filter out generic terms and get the most specific category
		const meaningfulCategories = categories.filter(
			(cat) =>
				cat &&
				cat.length > 2 &&
				!cat.toLowerCase().includes('amazon') &&
				!cat.toLowerCase().includes('all'),
		);

		return meaningfulCategories.length > 0
			? meaningfulCategories[meaningfulCategories.length - 1]
			: undefined;
	}

	/**
	 * Extract specifications from attributes array (Apify format)
	 */
	private extractSpecificationsFromAttributes(
		attributes?: any[],
	): Record<string, any> | undefined {
		if (!Array.isArray(attributes) || attributes.length === 0) return undefined;

		const specs: Record<string, any> = {};

		for (const attr of attributes) {
			if (attr && attr.key && attr.value !== undefined && attr.value !== null) {
				specs[cleanText(attr.key)] = attr.value;
			}
		}

		return Object.keys(specs).length > 0 ? specs : undefined;
	}

	/**
	 * Extract features from Apify format
	 */
	private extractFeaturesFromApify(features?: any[]): string[] | undefined {
		if (!Array.isArray(features) || features.length === 0) return undefined;

		const cleanedFeatures = features
			.map((f) => cleanText(f))
			.filter((f) => f && f.length > 0);

		return cleanedFeatures.length > 0 ? cleanedFeatures : undefined;
	}

	/**
	 * Normalize and validate batch
	 */
	normalizeAndValidate(rawProducts: any[]): NormalizedProduct[] {
		const normalized = this.normalizeBatch(rawProducts);
		return normalized.filter((product) => this.validate(product));
	}
}
