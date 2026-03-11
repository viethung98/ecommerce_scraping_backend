import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from "@nestjs/common";
import { CartService } from "./cart.service";
import { AddCartItemDto, UpdateCartItemDto } from "./dto/cart.dto";

@Controller("cart")
export class CartController {
  constructor(private readonly cartService: CartService) {}

  /**
   * GET /api/cart/:userId
   */
  @Get(":userId")
  getCart(@Param("userId") userId: string) {
    return this.cartService.getCart(userId);
  }

  /**
   * POST /api/cart/:userId/items
   */
  @Post(":userId/items")
  addItem(@Param("userId") userId: string, @Body() dto: AddCartItemDto) {
    return this.cartService.addItem(userId, dto);
  }

  /**
   * PUT /api/cart/:userId/items/:productId
   */
  @Put(":userId/items/:productId")
  updateItem(
    @Param("userId") userId: string,
    @Param("productId") productId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItem(userId, productId, dto);
  }

  /**
   * DELETE /api/cart/:userId/items/:productId
   */
  @Delete(":userId/items/:productId")
  @HttpCode(HttpStatus.OK)
  removeItem(
    @Param("userId") userId: string,
    @Param("productId") productId: string,
  ) {
    return this.cartService.removeItem(userId, productId);
  }

  /**
   * DELETE /api/cart/:userId
   */
  @Delete(":userId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async clearCart(@Param("userId") userId: string): Promise<void> {
    return this.cartService.clearCart(userId);
  }
}
