import type { CliProxyProvider } from "./adapter.types";

export class CliProxyError extends Error {
  readonly provider: CliProxyProvider;
  readonly status?: number;

  constructor(
    provider: CliProxyProvider,
    message: string,
    status?: number,
    secrets: readonly string[] = [],
  ) {
    super(redactSecrets(message, secrets));
    this.name = "CliProxyError";
    this.provider = provider;
    this.status = status;
  }
}

export class UnsupportedCliProxyProviderError extends Error {
  readonly provider: string;

  constructor(provider: string) {
    super(`Unsupported CLIProxy provider: ${provider}`);
    this.name = "UnsupportedCliProxyProviderError";
    this.provider = provider;
  }
}

export function redactSecrets(
  message: string,
  secrets: readonly string[],
): string {
  return secrets
    .filter((secret) => secret.length > 0)
    .reduce(
      (redacted, secret) => redacted.split(secret).join("[REDACTED]"),
      message,
    );
}
