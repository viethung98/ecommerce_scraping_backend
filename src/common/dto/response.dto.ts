import { NormalizedProduct } from "../interfaces";
import { PaginationResponseDto } from "./pagination.dto";

export class SearchResponseDto extends PaginationResponseDto {
  products: NormalizedProduct[];
  source: "cached" | "realtime" | "hybrid";
  query: string;
  executionTime: number;
}

export class AiQueryResponseDto {
  message: string;
  products: NormalizedProduct[];
  intent: any;
  suggestions?: string[];
}

export class HealthResponseDto {
  status: string;
  uptime: number;
  timestamp: string;
  environment: string;
  services: {
    database?: string;
    search?: string;
    mcp?: string;
    apify?: string;
  };
}
