import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildEmbeddedRunnerAssistant,
  makeEmbeddedRunnerAttempt,
} from "../../test-helpers/embedded-agent-runner-e2e-fixtures.js";
import { resolveEmbeddedRunTerminal } from "./terminal-resolution.js";
import { makeTerminalInput } from "./terminal-resolution.test-support.js";

vi.mock("./auth-profile-success.js", () => ({
  markEmbeddedRunAuthProfileSuccess: vi.fn(),
  reportEmbeddedRunSuccessfulAuthBinding: vi.fn(),
}));

const text = '```json\n{"name":"write","arguments":{"path":"proof.txt","content":"OK"}}\n```';

function makeTextCallInput() {
  const assistant = buildEmbeddedRunnerAssistant({
    stopReason: "stop",
    content: [{ type: "text", text }],
  });
  return makeTerminalInput({
    attempt: makeEmbeddedRunnerAttempt({
      assistantTexts: [text],
      lastAssistant: assistant,
      currentAttemptAssistant: assistant,
      textToolCallAttempt: true,
    }),
    payloadsWithToolMedia: [{ text }],
  });
}

describe("terminal resolution for a tool call written as text", () => {
  beforeEach(() => vi.clearAllMocks());

  it("nudges once, then returns a visible failure instead of successful JSON text", async () => {
    const input = makeTextCallInput();
    input.retryState.emptyResponseAttempts = 1;
    await expect(resolveEmbeddedRunTerminal(input)).resolves.toEqual({ action: "retry" });
    expect(input.sessionPromptState.activateInternalPrompt).toHaveBeenCalledWith(
      expect.stringContaining("call the tool natively"),
    );
    expect(input.retryState.textToolCallAttempts).toBe(1);

    const repeated = await resolveEmbeddedRunTerminal(input);
    expect(repeated.action).toBe("complete");
    if (repeated.action !== "complete") {
      throw new Error("expected bounded terminal failure");
    }
    expect(repeated.result.meta.error).toMatchObject({ kind: "incomplete_turn" });
    expect(repeated.result.payloads).toEqual([
      {
        text: "⚠️ The model wrote a tool call as text instead of calling the tool. No tool ran for that call. Please try again or use a model with native tool calling.",
        isError: true,
      },
    ]);
  });

  it("accepts a real answer after the corrective retry", async () => {
    const input = makeTextCallInput();
    await resolveEmbeddedRunTerminal(input);
    const assistant = buildEmbeddedRunnerAssistant({
      stopReason: "stop",
      content: [{ type: "text", text: "Created and read proof.txt: OK" }],
    });
    const recovered = await resolveEmbeddedRunTerminal(
      makeTerminalInput({
        retryState: input.retryState,
        attempt: makeEmbeddedRunnerAttempt({
          assistantTexts: ["Created and read proof.txt: OK"],
          currentAttemptAssistant: assistant,
          toolMetas: [{ toolName: "write", isError: false, replaySafe: false }],
          replayMetadata: { replaySafe: false, hadPotentialSideEffects: true },
        }),
        payloadsWithToolMedia: [{ text: "Created and read proof.txt: OK" }],
      }),
    );
    expect(recovered.action).toBe("complete");
    if (recovered.action !== "complete") {
      throw new Error("expected normal answer");
    }
    expect(recovered.result.meta.error).toBeUndefined();
    expect(recovered.result.payloads).toEqual([{ text: "Created and read proof.txt: OK" }]);
  });
});
