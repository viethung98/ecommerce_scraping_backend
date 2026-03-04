import { Injectable, Logger } from "@nestjs/common";
import { SearchFilters, SearchResult } from "../common/interfaces";
import { ProductRepository } from "../database/repositories/product.repository";
import { MeilisearchService } from "./meilisearch.service";

@Injectable()
export class CachedSearchService {
  private readonly logger = new Logger(CachedSearchService.name);

  constructor(
    private readonly meilisearch: MeilisearchService,
    private readonly productRepo: ProductRepository,
  ) {}

  /**
   * Search products from cache (Meilisearch)
   */
  async search(
    query: string,
    filters?: SearchFilters,
    page: number = 1,
    limit: number = 20,
  ): Promise<SearchResult> {
    const startTime = Date.now();

    try {
      this.logger.log(`Cached search: "${query}"`);

      // Build filter string for Meilisearch
      const filterString = this.buildFilterString(filters);

      // Build sort array
      const sort = this.buildSort(filters);

      // Calculate offset
      const offset = (page - 1) * limit;

      // Search
      const results = await this.meilisearch.search(query, {
        filters: filterString,
        sort,
        limit,
        offset,
      });

      const executionTime = Date.now() - startTime;
      const total = results.estimatedTotalHits || results.hits.length;
      const totalPage = Math.ceil(total / limit);

      return {
        products: results.hits,
        total,
        page,
        limit,
        totalPage,
        source: "cached",
        query,
        executionTime,
      };
    } catch (error) {
      this.logger.error(`Cached search failed: ${error.message}`, error.stack);

      // Fallback to database search
      return this.fallbackSearch(query, limit);
    }
  }

  /**
   * Get product by ASIN from cache
   */
  async getProductByAsin(asin: string): Promise<any> {
    try {
      const product = await this.meilisearch.getProduct(asin);

      if (!product) {
        // Fallback to database
        return await this.productRepo.findByAsin(asin);
      }

      return product;
    } catch (error) {
      this.logger.error(`Failed to get product ${asin}: ${error.message}`);
      return null;
    }
  }

  /**
   * Build filter string for Meilisearch
   */
  private buildFilterString(filters?: SearchFilters): string | undefined {
    if (!filters) return undefined;

    const conditions: string[] = [];

    if (filters.category) {
      conditions.push(`category = "${filters.category}"`);
    }

    if (filters.brand) {
      conditions.push(`brand = "${filters.brand}"`);
    }

    if (filters.minPrice !== undefined) {
      conditions.push(`price >= ${filters.minPrice}`);
    }

    if (filters.maxPrice !== undefined) {
      conditions.push(`price <= ${filters.maxPrice}`);
    }

    if (filters.minRating !== undefined) {
      conditions.push(`rating >= ${filters.minRating}`);
    }

    if (filters.minReviewCount !== undefined) {
      conditions.push(`reviewCount >= ${filters.minReviewCount}`);
    }

    if (filters.available !== undefined) {
      conditions.push(`available = ${filters.available}`);
    }

    if (filters.fulfillment) {
      conditions.push(`fulfillment = "${filters.fulfillment}"`);
    }

    return conditions.length > 0 ? conditions.join(" AND ") : undefined;
  }

  /**
   * Build sort array
   */
  private buildSort(filters?: SearchFilters): string[] | undefined {
    // Default: sort by relevance, then rating, then review count
    return ["rating:desc", "reviewCount:desc"];
  }

  /**
   * Fallback to database search
   */
  private async fallbackSearch(
    query: string,
    limit: number,
  ): Promise<SearchResult> {
    this.logger.warn("Falling back to database search");

    const startTime = Date.now();
    const products = await this.productRepo.search(query, limit);
    const executionTime = Date.now() - startTime;
    const totalPage = Math.ceil(products.length / limit);

    return {
      products: products as any,
      total: products.length,
      page: 1,
      limit,
      totalPage,
      source: "cached",
      query,
      executionTime,
    };
  }

  /**
   * Check if service is available
   */
  async isAvailable(): Promise<boolean> {
    return await this.meilisearch.isHealthy();
  }

  /**
   * Get search engine stats
   */
  async getStats(): Promise<any> {
    return await this.meilisearch.getStats();
  }
}
