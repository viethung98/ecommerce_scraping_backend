/**
 * Type declarations for mppx (ESM-only package).
 *
 * The project uses CJS module resolution which cannot resolve mppx's
 * package.json exports map. These declarations provide minimal types
 * for the dynamic import() used in MppService.
 */

declare module 'mppx/server' {
  export namespace Mppx {
    interface CreateConfig {
      methods: any[];
      realm?: string;
      secretKey?: string;
    }

    function create(config: CreateConfig): any;
  }

  export function tempo(params?: {
    currency?: string;
    recipient?: string;
    testnet?: boolean;
  }): any;
}
