import { createComponent } from "solid-js";
import { expect, it, vi } from "vitest";
import { mountSolid } from "../test-helpers/mount-solid.ts";
import { flush } from "../test-helpers/solid-settle.ts";
import { AgentEmojiPicker } from "./agent-emoji-picker.tsx";

it("filters emoji choices, selects their value, and resets on remount", () => {
  const onSelect = vi.fn();
  const view = mountSolid(() => createComponent(AgentEmojiPicker, { onSelect }));
  flush();
  const search = view.container.querySelector<HTMLInputElement>(".agent-emoji-picker__search")!;
  search.value = "rocket";
  search.dispatchEvent(new Event("input", { bubbles: true }));
  flush();
  const choice = view.container.querySelector<HTMLButtonElement>(".agent-emoji-picker__choice")!;
  expect(choice.textContent).toBe("🚀");
  choice.click();
  expect(onSelect).toHaveBeenCalledExactlyOnceWith("🚀");
  view.unmount();
  const remounted = mountSolid(() => createComponent(AgentEmojiPicker, { onSelect }));
  flush();
  expect(remounted.container.querySelectorAll(".agent-emoji-picker__choice")).toHaveLength(24);
});
