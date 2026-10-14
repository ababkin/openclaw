import { afterEach, expect, it, vi } from "vitest";
import { PluginInstance } from "./plugin-instance.js";
import { withPluginRuntimePluginScope } from "./runtime/gateway-request-scope.js";
import { getPluginSdkDeprecationUsage } from "./sdk-deprecation-usage.js";
import { warnPluginSdkDeprecation } from "./sdk-deprecation.js";

afterEach(() => vi.restoreAllMocks());

it("attributes legacy use to its runtime owner and gives each family an independent budget", async () => {
  const warning = vi.spyOn(process, "emitWarning").mockImplementation(() => {});
  const first = new PluginInstance("sdk-warning-owner");
  const reloaded = new PluginInstance("sdk-warning-owner");
  const useLegacy = (family: string) =>
    warnPluginSdkDeprecation({ family, method: "store.write", replacement: "store.writeAsync" });
  try {
    await first.run(async () => {
      await Promise.resolve();
      useLegacy("writer");
      useLegacy("writer");
      useLegacy("transcript");
    });
    reloaded.run(() => useLegacy("writer"));
    withPluginRuntimePluginScope({ pluginId: "sdk-warning-other" }, () => useLegacy("writer"));
    reloaded.run(() =>
      warnPluginSdkDeprecation({
        family: "writer",
        method: "store.read",
        replacement: "store.readAsync",
      }),
    );
    expect(warning).toHaveBeenCalledTimes(3);
    expect(getPluginSdkDeprecationUsage("sdk-warning-owner").map((api) => api.id)).toEqual([
      "writer:store.write",
      "transcript:store.write",
      "writer:store.read",
    ]);
    expect(getPluginSdkDeprecationUsage("sdk-warning-other")).toEqual([
      { id: "writer:store.write", displayName: "store.write", replacement: "store.writeAsync" },
    ]);
    expect(warning.mock.calls.map(([message]) => String(message).split(":")[0])).toEqual([
      "Plugin sdk-warning-owner",
      "Plugin sdk-warning-owner",
      "Plugin sdk-warning-other",
    ]);
    for (const [message] of warning.mock.calls) {
      expect(message).toContain("store.writeAsync");
      expect(message).toContain("remains supported during its deprecation period");
      expect(message).toContain("removed in a later release after stable deprecation");
    }
  } finally {
    await Promise.all([first.dispose(), reloaded.dispose()]);
  }
});

it("bounds unscoped warnings and never prints path-like caller labels", () => {
  const warning = vi.spyOn(process, "emitWarning").mockImplementation(() => {});
  for (const pluginId of [
    undefined,
    "/private/synthetic-plugin",
    "synthetic\ncredential",
    undefined,
  ]) {
    warnPluginSdkDeprecation({
      family: "unknown-writer",
      method: "store.write",
      replacement: "store.writeAsync",
      pluginId,
    });
  }
  expect(warning).toHaveBeenCalledExactlyOnceWith(
    "Plugin SDK: store.write is deprecated; use store.writeAsync instead. The legacy contract remains supported during its deprecation period. It will be removed in a later release after stable deprecation.",
    { code: "DEP_PLUGIN_SDK", type: "DeprecationWarning" },
  );
  expect(getPluginSdkDeprecationUsage("/private/synthetic-plugin")).toEqual([]);
});
