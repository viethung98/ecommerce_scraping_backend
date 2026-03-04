import { Controller, Get, Query } from "@nestjs/common";
import { SearchResponseDto } from "../common/dto/response.dto";
import { SearchQueryDto } from "../common/dto/search.dto";
import { HybridOrchestratorService } from "./hybrid-orchestrator.service";

@Controller("search")
export class HybridOrchestratorController {
  constructor(private readonly orchestrator: HybridOrchestratorService) {}

  /**
   * Main search endpoint with smart routing
   */
  @Get()
  async search(@Query() query: SearchQueryDto): Promise<SearchResponseDto> {
    const filters = {
      category: query.category,
      brand: query.brand,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      minRating: query.minRating,
    };

    const result = await this.orchestrator.search(
      query.q,
      filters,
      query.page,
      query.limit,
      query.forceRealtime,
    );

    return result;
  }

  /**
   * Get system status
   */
  @Get("status")
  async getStatus() {
    const status = await this.orchestrator.getStatus();

    return {
      success: true,
      data: status,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get popular queries
   */
  @Get("popular")
  async getPopularQueries(@Query("limit") limit?: number) {
    const popular = this.orchestrator.getPopularQueries(
      limit ? Number(limit) : 10,
    );

    return {
      success: true,
      data: popular,
    };
  }
}
