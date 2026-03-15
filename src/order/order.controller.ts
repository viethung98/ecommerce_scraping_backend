import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import { CheckoutDto } from "./dto/order.dto";
import { OrderService } from "./order.service";

@Controller("")
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  /**
   * POST /api/checkout
   * Create a new order from cart
   */
  @Post("checkout")
  checkout(@Body() dto: CheckoutDto) {
    return this.orderService.checkout(dto);
  }

  /**
   * GET /api/orders?user_id=...
   */
  @Get("orders")
  getOrders(@Query("user_id") userId: string) {
    return this.orderService.getOrdersByUser(userId);
  }

  /**
   * GET /api/orders/:orderId
   */
  @Get("orders/:orderId")
  getOrder(@Param("orderId", ParseUUIDPipe) orderId: string) {
    return this.orderService.getOrderById(orderId);
  }
}
