import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Request,
} from "@nestjs/common";
import {
  RecordInteractionDto,
  UserPreferencesDto,
  UserProfileResponseDto,
} from "../common/dto/user.dto";
import { UserService } from "./user-preferences.service";

@Controller("users")
export class UserController {
  constructor(private readonly UserService: UserService) {}

  @Get("profile")
  async getProfile(@Request() req: any): Promise<UserProfileResponseDto> {
    const userId = req.user?.id || "anonymous";
    const profile = await this.UserService.getUserProfile(userId);

    return {
      userId: profile.userId,
      preferences: profile.preferences,
      favoriteCategories: profile.favoriteCategories,
      searchHistory: profile.searchHistory,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

  @Put("preferences")
  async updatePreferences(
    @Body() dto: UserPreferencesDto,
    @Request() req: any,
  ): Promise<UserProfileResponseDto> {
    const userId = req.user?.id || "anonymous";
    const profile = await this.UserService.updatePreferences(userId, dto);

    return {
      userId: profile.userId,
      preferences: profile.preferences,
      favoriteCategories: profile.favoriteCategories,
      searchHistory: profile.searchHistory,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

  @Post("favorites/:category")
  async addFavoriteCategory(
    @Param("category") category: string,
    @Request() req: any,
  ): Promise<void> {
    const userId = req.user?.id || "anonymous";
    return this.UserService.addFavoriteCategory(userId, category);
  }

  @Post("interactions")
  async recordInteraction(
    @Body() dto: RecordInteractionDto,
    @Request() req: any,
  ): Promise<void> {
    const userId = req.user?.id || "anonymous";
    return this.UserService.recordInteraction(
      userId,
      dto.asin,
      dto.interactionType,
      dto.metadata,
    );
  }

  @Get("recommendations")
  async getRecommendations(
    @Request() req: any,
  ): Promise<{ recommendations: string[] }> {
    const userId = req.user?.id || "anonymous";
    const recommendations =
      await this.UserService.getPersonalizedRecommendations(userId);

    return { recommendations };
  }
}
