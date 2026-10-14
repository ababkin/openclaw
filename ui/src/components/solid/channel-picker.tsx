import { createMemo } from "solid-js";
import { renderChannelIcon } from "../channel-icon.ts";
import type { ChannelPickerOption } from "../channel-picker.ts";
import { Picker, type PickerParams } from "../select-picker.ts";

export function ChannelPicker(props: PickerParams<ChannelPickerOption>) {
  const params = createMemo<PickerParams<ChannelPickerOption>>(() => ({
    ...props,
    className: "channel-picker",
    renderLeading: (option) =>
      option.kind === "neutral"
        ? undefined
        : renderChannelIcon(option.value, option.label, "picker"),
  }));
  return <Picker params={params()} />;
}
