import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Metadata, TypeRegistry } from "@polkadot/types";
import { hexToU8a, u8aToHex } from "@polkadot/util";
import { cryptoWaitReady, decodeAddress } from "@polkadot/util-crypto";
import { readFile } from "node:fs/promises";
import { AppConfigService } from "../config/app-config.service";

const SYSTEM_EVENTS_STORAGE_KEY =
  "0x26aa394eea5630e07c48ae0c9558cef70a98fdbe9ce6c55837576c60c7af3850";

@Injectable()
export class X402SmoldotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(X402SmoldotService.name);

  private smoldotClient: any;
  private chain: any;
  private enabled = false;
  private lastHealthCheckAt = 0;
  private lastHealthResult = false;
  private healthLock: Promise<boolean> | null = null;
  private rpcQueue: Promise<unknown> = Promise.resolve();

  constructor(private readonly config: AppConfigService) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.x402SmoldotChainSpecPath) {
      this.logger.warn(
        "X402_SMOLDOT_CHAIN_SPEC_PATH is missing. Smoldot validation is disabled.",
      );
      return;
    }

    try {
      await cryptoWaitReady();

      const chainSpec = await readFile(
        this.config.x402SmoldotChainSpecPath,
        "utf8",
      );
      const smoldot = await import("smoldot");

      this.smoldotClient = smoldot.start();
      this.chain = await this.smoldotClient.addChain({ chainSpec });
      this.enabled = true;

      this.logger.log("smoldot light client initialized for x402 middleware");
      await this.assertHealthy();
    } catch (error) {
      this.enabled = false;
      this.logger.error(
        `Unable to initialize smoldot light client: ${error?.message ?? error}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      if (this.chain) {
        this.chain.remove();
      }
      if (this.smoldotClient) {
        this.smoldotClient.terminate();
      }
    } catch (error) {
      this.logger.warn(
        `Failed to gracefully terminate smoldot client: ${error?.message ?? error}`,
      );
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async verifyPaymentProof(input: {
    blockHash: string;
    recipient: string;
    minAmountPlanck: string;
  }): Promise<{
    ok: boolean;
    reason?: string;
    payment?: {
      from?: string;
      to: string;
      amountPlanck: string;
      blockHash: string;
    };
  }> {
    if (!this.enabled || !this.chain) {
      return { ok: false, reason: "smoldot verifier is not initialized" };
    }

    const blockHash = input.blockHash.trim();
    const recipientHex = this.normalizeAccountHex(input.recipient);
    const minAmountPlanck = this.safeBigInt(input.minAmountPlanck);

    if (!blockHash || !recipientHex || minAmountPlanck === null) {
      return { ok: false, reason: "Invalid payment proof format" };
    }

    this.logger.debug(`[VERIFY] Looking for payment in block: ${blockHash}`);
    this.logger.debug(`[VERIFY] Expected recipient (hex): ${recipientHex}`);
    this.logger.debug(`[VERIFY] Minimum amount: ${minAmountPlanck}`);

    try {
      const finalizedHead = await this.rpc<string>(
        "chain_getFinalizedHead",
        [],
      );
      const proofHeader = await this.rpc<any>("chain_getHeader", [blockHash]);
      const finalizedHeader = await this.rpc<any>("chain_getHeader", [
        finalizedHead,
      ]);

      const proofNumber = this.hexToNumber(proofHeader?.number);
      const finalizedNumber = this.hexToNumber(finalizedHeader?.number);
      if (proofNumber === null || finalizedNumber === null) {
        return { ok: false, reason: "Unable to determine block finality" };
      }

      if (proofNumber > finalizedNumber) {
        return { ok: false, reason: "Payment block is not finalized yet" };
      }

      const canonicalHash = await this.rpc<string>("chain_getBlockHash", [
        proofNumber,
      ]);
      if (
        !canonicalHash ||
        canonicalHash.toLowerCase() !== blockHash.toLowerCase()
      ) {
        return {
          ok: false,
          reason: "Payment block is not finalized on the canonical chain",
        };
      }

      const metadataHex = await this.rpc<string>("state_getMetadata", [
        blockHash,
      ]);
      const rawEvents = await this.rpc<string | null>("state_getStorage", [
        SYSTEM_EVENTS_STORAGE_KEY,
        blockHash,
      ]);

      if (!metadataHex || !rawEvents) {
        return { ok: false, reason: "Unable to load block events" };
      }

      const registry = new TypeRegistry();
      registry.setMetadata(
        new Metadata(registry, metadataHex as `0x${string}`),
      );
      const allEvents = Array.from(
        registry.createType("Vec<EventRecord>", rawEvents) as Iterable<any>,
      );

      const transfers = allEvents.filter((record) => {
        const section = String(record.event.section).toLowerCase();
        const method = String(record.event.method).toLowerCase();
        return section === "balances" && method === "transfer";
      });

      this.logger.debug(
        `[VERIFY] Found ${transfers.length} Balances.Transfer events`,
      );

      for (let i = 0; i < transfers.length; i++) {
        const eventData = transfers[i].event.data;
        this.logger.debug(
          `[VERIFY] Transfer #${i}: raw fields = ${JSON.stringify(eventData.toJSON())}`,
        );

        // Access fields by name when available, fall back to positional
        // to_raw = t.fields.get("to"), from_raw = t.fields.get("from"), amount = t.fields.get("amount", 0)
        const json = eventData.toJSON() as any;
        const toRaw = Array.isArray(json) ? json[1] : (json?.to ?? null);
        const fromRaw = Array.isArray(json) ? json[0] : (json?.from ?? null);
        const amountRaw = Array.isArray(json) ? json[2] : (json?.amount ?? 0);

        // Convert to hex
        const toHex =
          this.bytesToHex(toRaw) ??
          this.normalizeAccountHex(eventData?.[1]?.toString() ?? "");
        const fromHex =
          this.bytesToHex(fromRaw) ??
          this.normalizeAccountHex(eventData?.[0]?.toString() ?? "");
        const amountPlanck = this.safeBigInt(
          String(amountRaw ?? eventData?.[2] ?? 0),
        );

        this.logger.debug(`[VERIFY] from (hex): ${fromHex}`);
        this.logger.debug(`[VERIFY] to (hex): ${toHex}`);
        this.logger.debug(`[VERIFY] amount: ${amountPlanck}`);

        const match =
          toHex &&
          recipientHex &&
          toHex.toLowerCase() === recipientHex.toLowerCase();
        const amountOk =
          amountPlanck !== null && amountPlanck >= minAmountPlanck;

        this.logger.debug(
          `[VERIFY] Match: ${toHex} == ${recipientHex}: ${match}`,
        );
        this.logger.debug(
          `[VERIFY] Amount ok: ${amountPlanck} >= ${minAmountPlanck}: ${amountOk}`,
        );

        if (match && amountOk) {
          this.logger.log(`[VERIFY] MATCH FOUND!`);
          return {
            ok: true,
            payment: {
              from: fromHex ?? undefined,
              to: toHex!,
              amountPlanck: amountPlanck!.toString(),
              blockHash,
            },
          };
        }
      }

      this.logger.debug(`[VERIFY] No matching transfer found`);
      return { ok: false, reason: "No matching transfer event found in block" };
    } catch (error) {
      this.logger.warn(`verifyPaymentProof failed: ${error?.message ?? error}`);
      return { ok: false, reason: "Unable to verify payment proof on chain" };
    }
  }

  async assertHealthy(): Promise<boolean> {
    if (!this.enabled || !this.chain) {
      return false;
    }

    const now = Date.now();
    if (
      now - this.lastHealthCheckAt < this.config.x402SmoldotHealthCacheMs &&
      this.lastHealthResult
    ) {
      return true;
    }

    if (this.healthLock) {
      return this.healthLock;
    }

    this.healthLock = this.checkOnce();
    try {
      return await this.healthLock;
    } finally {
      this.healthLock = null;
    }
  }

  private async checkOnce(): Promise<boolean> {
    const requestId = Date.now();

    try {
      this.chain.sendJsonRpc(
        JSON.stringify({
          jsonrpc: "2.0",
          id: requestId,
          method: "system_health",
          params: [],
        }),
      );

      const responseRaw = await this.withTimeout(
        this.chain.nextJsonRpcResponse(),
        this.config.x402SmoldotHealthTimeoutMs,
      );

      const response = JSON.parse(String(responseRaw));
      const ok =
        response?.id === requestId &&
        !response?.error &&
        typeof response?.result === "object";

      this.lastHealthCheckAt = Date.now();
      this.lastHealthResult = ok;
      return ok;
    } catch (error) {
      this.lastHealthCheckAt = Date.now();
      this.lastHealthResult = false;
      this.logger.warn(
        `smoldot health check failed: ${error?.message ?? error}`,
      );
      return false;
    }
  }

  private async rpc<T>(method: string, params: any[]): Promise<T> {
    const task = async () => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      this.chain.sendJsonRpc(
        JSON.stringify({
          jsonrpc: "2.0",
          id,
          method,
          params,
        }),
      );

      const responseRaw = await this.withTimeout(
        this.chain.nextJsonRpcResponse(),
        this.config.x402SmoldotHealthTimeoutMs,
      );
      const response = JSON.parse(String(responseRaw));

      if (response?.id !== id) {
        throw new Error(`Unexpected rpc id for ${method}`);
      }
      if (response?.error) {
        throw new Error(response.error?.message ?? `RPC ${method} failed`);
      }

      return response?.result as T;
    };

    const result = this.rpcQueue.then(task, task) as Promise<T>;
    this.rpcQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /**
   * Convert various raw field representations to a 0x-prefixed hex string.
   *   - Nested list [[1, 2, 3, ...]] or flat list [1, 2, 3, ...] of bytes
   *   - Hex string without 0x prefix (64 chars = 32-byte AccountId)
   *   - Already 0x-prefixed hex string
   */
  private bytesToHex(value: unknown): string | null {
    if (Array.isArray(value)) {
      let arr: unknown[] = value;
      // Handle nested list [[1, 2, 3, ...]]
      if (arr.length === 1 && Array.isArray(arr[0])) {
        arr = arr[0] as unknown[];
      }
      if (arr.every((b) => typeof b === "number")) {
        return "0x" + Buffer.from(arr as number[]).toString("hex");
      }
    }
    if (typeof value === "string") {
      if (value.startsWith("0x")) return value;
      // 64-char hex string = 32-byte pubkey without 0x prefix
      if (/^[0-9a-fA-F]{64}$/.test(value)) return "0x" + value;
    }
    return null;
  }

  private hexToNumber(value?: string): number | null {
    if (!value || typeof value !== "string") {
      return null;
    }

    const normalized = value.startsWith("0x") ? value : `0x${value}`;
    const num = Number.parseInt(normalized, 16);
    return Number.isFinite(num) ? num : null;
  }

  private safeBigInt(value: unknown): bigint | null {
    try {
      if (typeof value === "bigint") {
        return value;
      }
      if (typeof value === "number") {
        return BigInt(value);
      }
      if (typeof value === "string" && value.trim().length > 0) {
        return BigInt(value.trim());
      }
      return null;
    } catch {
      return null;
    }
  }

  private normalizeAccountHex(value: unknown): string | null {
    if (typeof value !== "string" || value.trim().length === 0) {
      return null;
    }

    const normalized = value.trim();
    if (normalized.startsWith("0x")) {
      return normalized.toLowerCase();
    }

    try {
      return u8aToHex(decodeAddress(normalized)).toLowerCase();
    } catch {
      try {
        return u8aToHex(hexToU8a(normalized)).toLowerCase();
      } catch {
        return null;
      }
    }
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }
}
