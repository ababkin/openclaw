import { solidContent } from "../lit/solid-content.tsx";
import type { PickerOption, PickerParams } from "./select-picker-types.ts";
import { ChannelPicker } from "./solid/channel-picker.tsx";

export type ChannelPickerOption = PickerOption & {
  /** Neutral choices such as "last" or "all" are routing policy, not transports. */
  kind?: "channel" | "neutral";
};

export function renderChannelPicker(params: PickerParams<ChannelPickerOption>) {
  return solidContent(ChannelPicker, params);
}
