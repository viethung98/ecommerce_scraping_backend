import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import {
  MPP_CHARGE_METADATA_KEY,
  MPP_SESSION_METADATA_KEY,
  MppChargeOptions,
  MppSessionOptions,
} from './mpp.decorator';
import { MppService } from './mpp.service';

/**
 * NestJS guard that enforces MPP payments using the mppx SDK.
 *
 * Reads @MppCharge() or @MppSession() decorator metadata and uses
 * the mppx charge/session handler to issue 402 challenges or verify
 * payment credentials via the standard MPP protocol.
 */
@Injectable()
export class MppGuard implements CanActivate {
  private readonly logger = new Logger(MppGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly mppService: MppService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.mppService.isInitialized()) {
      return true;
    }

    const chargeOptions = this.reflector.getAllAndOverride<MppChargeOptions>(
      MPP_CHARGE_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    const sessionOptions = this.reflector.getAllAndOverride<MppSessionOptions>(
      MPP_SESSION_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!chargeOptions && !sessionOptions) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const mppx = this.mppService.instance;

    // Build a Web Request from the Express request
    const webRequest = new globalThis.Request(
      `${req.protocol}://${req.hostname}${req.originalUrl}`,
      {
        method: req.method,
        headers: req.headers as Record<string, string>,
      },
    );

    try {
      let result: any;

      if (chargeOptions) {
        result = await mppx.charge({
          amount: chargeOptions.amount,
          description: chargeOptions.description,
        })(webRequest);
      } else if (sessionOptions) {
        result = await mppx.session({
          amount: sessionOptions.amount,
          unitType: sessionOptions.unitType,
          description: sessionOptions.description,
        })(webRequest);
      }

      if (result.status === 402) {
        const challenge = result.challenge as globalThis.Response;
        res.status(challenge.status);
        for (const [key, value] of challenge.headers) {
          res.setHeader(key, value);
        }
        res.send(await challenge.text());
        return false;
      }

      // Attach withReceipt to the request so controllers can use it
      (req as any).mppPayment = {
        withReceipt: result.withReceipt,
      };

      // Monkey-patch res.json to attach Payment-Receipt header
      const originalJson = res.json.bind(res);
      res.json = (body: any) => {
        try {
          const wrapped = result.withReceipt(
            globalThis.Response.json(body),
          ) as globalThis.Response;
          const receipt = wrapped.headers.get('Payment-Receipt');
          if (receipt) {
            res.setHeader('Payment-Receipt', receipt);
          }
        } catch (error) {
          this.logger.warn(
            `Failed to attach Payment-Receipt: ${error?.message ?? error}`,
          );
        }
        return originalJson(body);
      };

      return true;
    } catch (error) {
      this.logger.error(
        `MPP guard error: ${error?.message ?? error}`,
      );
      // On mppx error, fail open to avoid blocking requests
      return true;
    }
  }
}
