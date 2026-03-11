import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import { ChatService } from "./chat.service";
import { SendMessageDto } from "./dto/chat.dto";

@Controller("chat")
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * POST /api/chat
   * Send a message and receive AI response
   */
  @Post()
  async sendMessage(@Body() dto: SendMessageDto) {
    return this.chatService.sendMessage(dto);
  }

  /**
   * GET /api/chat/history?session_id=...
   */
  @Get("history")
  async getHistory(@Query("session_id", ParseUUIDPipe) sessionId: string) {
    return this.chatService.getHistory(sessionId);
  }

  /**
   * DELETE /api/chat/:session_id
   */
  @Delete(":session_id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSession(
    @Param("session_id", ParseUUIDPipe) sessionId: string,
  ): Promise<void> {
    return this.chatService.deleteSession(sessionId);
  }
}
