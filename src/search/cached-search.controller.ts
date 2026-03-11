import { Controller, Get, Param, Query } from "@nestjs/common";
import { AdvancedSearchDto } from "../common/dto/advanced-search.dto";
import { SearchResponseDto } from "../common/dto/response.dto";
import { CachedSearchService } from "./cached-search.service";

@Controller("search/cached")
export class CachedSearchController {
  constructor(private readonly cachedSearch: CachedSearchService) {}

  @Get()
  async search(@Query() query: AdvancedSearchDto): Promise<SearchResponseDto> {
    const filters = {
      category: query.category,
      brand: query.brand,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      minRating: query.minRating,
      brands: query.brands,
      categories: query.categories,
      freeShipping: query.freeShipping,
      prime: query.prime,
      onSale: query.onSale,
      maxRating: query.maxRating,
      features: query.features,
      condition: query.condition,
      sortBy: query.sortBy,
    };

    const result = await this.cachedSearch.search(
      query.q,
      filters,
      query.page,
      query.limit,
    );

    return result;
  }

  @Get("product/:asin")
  async getProduct(@Param("asin") asin: string) {
    const product = await this.cachedSearch.getProductByAsin(asin);

    return {
      success: true,
      data: product,
      source: "cached",
    };
  }

  @Get("health")
  async health() {
    const available = await this.cachedSearch.isAvailable();

    return {
      status: available ? "healthy" : "unavailable",
      service: "cached-search",
      timestamp: new Date().toISOString(),
    };
  }

  @Get("stats")
  async stats() {
    const stats = await this.cachedSearch.getStats();

    return {
      success: true,
      data: stats,
    };
  }
}
