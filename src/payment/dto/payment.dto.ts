import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export class GeneratePaymentRequestDto {
	@IsUUID()
	order_id: string;

	@IsString()
	user_id: string;

	@IsOptional()
	@IsString()
	network?: string;
}

export class PaymentWebhookDto {
	@IsString()
	payment_id: string;

	@IsString()
	block_hash: string;

	@IsEnum(['confirmed', 'failed'])
	status: 'confirmed' | 'failed';
}
