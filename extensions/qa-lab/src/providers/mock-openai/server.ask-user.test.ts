import { describe, expect, it } from "vitest";
import {
  createMockServerTestHarness,
  expectNonStreamingResponsesJson,
  makeToolOutputWithCallId,
  makeUserInput,
  outputText,
} from "./server.test-harness.js";

const { startMockServer } = createMockServerTestHarness();

describe("mock provider ask_user summaries", () => {
  it.each([
    [
      "keeps single-question summaries ahead of the full roundtrip",
      [
        makeUserInput("tool search qa check target=ask_user ask_user_fixture=single."),
        makeToolOutputWithCallId(
          "call_ask_user_single",
          'Deploy: Production 🚀\nChecks: Lint\nNote: urgent\n{"status":"answered"}',
        ),
      ],
      "ASK-USER-SINGLE-OK | deploy=Production 🚀",
    ],
    [
      "keeps multi-select summaries ahead of the full roundtrip",
      [
        makeUserInput("tool search qa check target=ask_user ask_user_fixture=multi."),
        makeToolOutputWithCallId(
          "call_ask_user_multi",
          'Deploy: Canary\nChecks: Unit (Recommended), Lint\nNote: urgent\n{"status":"answered"}',
        ),
      ],
      "ASK-USER-MULTI-OK | checks=Unit,Lint",
    ],
  ] as const)("%s", async (_name, input, expected) => {
    const payload = await expectNonStreamingResponsesJson(await startMockServer(), { input });
    expect(outputText(payload)).toBe(expected);
  });
});
