import { Controller, Get, Param, Query } from "@nestjs/common";
import { SearchResponseDto } from "../common/dto/response.dto";
import { SearchQueryDto } from "../common/dto/search.dto";
import { RealtimeSearchService } from "./realtime-search.service";

@Controller("search/realtime")
export class RealtimeSearchController {
  constructor(private readonly realtimeSearch: RealtimeSearchService) {}

  @Get()
  async search(@Query() query: SearchQueryDto): Promise<SearchResponseDto> {
    const filters = {
      category: query.category,
      brand: query.brand,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      minRating: query.minRating,
    };

    const result = await this.realtimeSearch.search(
      query.q,
      filters,
      query.page,
      query.limit,
    );

    return result;
  }

  @Get("product/:asin")
  async getProduct(@Param("asin") asin: string) {
    const product = await this.realtimeSearch.getProductByAsin(asin);

    return {
      success: true,
      data: product,
      source: "realtime",
    };
  }

  @Get("health")
  async health() {
    const available = await this.realtimeSearch.isAvailable();

    return {
      status: available ? "healthy" : "unavailable",
      service: "realtime-search",
      timestamp: new Date().toISOString(),
    };
  }
}
