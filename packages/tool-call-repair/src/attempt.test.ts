import { describe, expect, it } from "vitest";
import { isPlainTextToolCallAttempt } from "./attempt.js";

const names = new Set(["write", "read"]);
const call = '{"name":"write","arguments":{"path":"proof.txt","content":"OK"}}';
const fenced = `\`\`\`json\n${call}\n\`\`\``;

describe("non-executing text tool-call detection", () => {
  it.each([
    call,
    fenced,
    `I'll create the file now.\n${fenced}`,
    `[{"function":{"name":"read","arguments":"{}"}}]`,
    '{"tool_calls":[{"function":{"name":"read","arguments":{}}}]}',
    '<invoke name="read"><parameter name="path">proof.txt</parameter></invoke>',
    'card\n<invoke name="read"><parameter name="path">proof.txt</parameter></invoke>',
    `<tool_call>${call}</tool_call>`,
    "```xml\n<function=read><parameter=path>proof.txt</parameter></function>\n```",
  ])("recognizes a structured attempt: %s", (text) => {
    expect(isPlainTextToolCallAttempt(text, names)).toBe(true);
  });

  it.each([
    "I will call write to create the file.",
    '{"name":"write","description":"an available tool"}',
    '{"name":"unregistered","arguments":{}}',
    `Here is an example of the API:\n${fenced}`,
    `I'll show an example.\n${fenced}`,
    `The file format has two properties. You can adapt this sample to your application.\n${fenced}`,
    `${fenced}\nThis is an example; it has not run.`,
    `\`\`\`text\ncall write proof.txt\n\`\`\``,
    '```json\n{"name":"write","arguments":{}}',
  ])("preserves prose, examples, and unknown tools: %s", (text) => {
    expect(isPlainTextToolCallAttempt(text, names)).toBe(false);
  });

  it("uses only the current offered tool names", () => {
    expect(isPlainTextToolCallAttempt(fenced, new Set(["read"]))).toBe(false);
    expect(isPlainTextToolCallAttempt(fenced, new Set())).toBe(false);
  });
});
