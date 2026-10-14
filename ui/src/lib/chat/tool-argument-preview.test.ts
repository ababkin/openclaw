import { describe, expect, it } from "vitest";
import { resolveCollapsedToolArgumentPreview } from "./tool-cards.ts";

describe("collapsed tool argument preview", () => {
  it("skips blank priority fields and preserves the first meaningful CRLF line", () => {
    expect(
      resolveCollapsedToolArgumentPreview({
        message: " \t\r\n\u00a0",
        prompt: "\r\n\t with   Review the change  \r\nDo not include this line",
        task: "Lower-priority task",
      }),
    ).toBe("Review the change");
  });

  it("keeps Unicode intact at the compact preview limit", () => {
    expect(
      resolveCollapsedToolArgumentPreview({ text: `\n${"a".repeat(119)}😀\nLater line` }),
    ).toBe("a".repeat(119));
  });
});
