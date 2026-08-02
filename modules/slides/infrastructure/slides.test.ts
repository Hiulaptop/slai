import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../database/infrastructure/client", () => ({ db: {} }));

describe("slide composition", () => {
  afterEach(() => { vi.resetModules(); vi.unstubAllEnvs(); });
  it("selects a configured provider", async () => {
    vi.stubEnv("CLIPROXY_PROVIDER", "openai"); vi.stubEnv("CLIPROXY_BASE_URL", "https://proxy.test"); vi.stubEnv("CLIPROXY_API_KEY", "secret"); vi.stubEnv("SLIDE_MODEL_ID", "model");
    const { slideService } = await import("./slides");
    expect(slideService).toMatchObject({ provider: "openai", modelId: "model" });
  });
  it("rejects invalid configuration without exposing the key", async () => {
    vi.stubEnv("CLIPROXY_PROVIDER", "unsupported"); vi.stubEnv("CLIPROXY_BASE_URL", "https://proxy.test"); vi.stubEnv("CLIPROXY_API_KEY", "very-secret-key"); vi.stubEnv("SLIDE_MODEL_ID", "model");
    await expect(import("./slides")).rejects.not.toThrow("very-secret-key");
  });
});
