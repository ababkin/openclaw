import { createSignal, onCleanup } from "solid-js";
import { Icon } from "../../../components/solid/icon.tsx";
import "../../../components/tooltip.ts";
import { registerFilePreviewEnglish } from "../../../i18n/locales/en-file-preview.ts";
import { downloadBlobFile } from "../../../lib/download.ts";
import { formatUiError } from "../../../lib/format-error.ts";
import { t } from "../../../lib/reactive/i18n.ts";
import { showToast } from "../../../lib/toast.ts";

registerFilePreviewEnglish();

export function FileDownloadButton(props: {
  filename: string;
  scopeKey: string;
  download: (signal: AbortSignal) => Promise<Blob | null>;
  class: string;
  disabled?: boolean;
}) {
  const [pending, setPending] = createSignal(false);
  let request: AbortController | null = null;
  let disposed = false;
  onCleanup(() => {
    disposed = true;
    request?.abort();
  });
  const download = async () => {
    if (request || props.disabled) {
      return;
    }
    const controller = new AbortController();
    const scopeKey = props.scopeKey;
    const filename = props.filename;
    request = controller;
    setPending(true);
    const current = () =>
      !disposed &&
      request === controller &&
      !controller.signal.aborted &&
      props.scopeKey === scopeKey &&
      props.filename === filename;
    try {
      const blob = await props.download(controller.signal);
      if (!blob) {
        return;
      }
      if (current()) {
        downloadBlobFile(filename, blob);
      }
    } catch (error) {
      if (current()) {
        showToast({
          message: t("chat.detailPanel.downloadFailed", { error: formatUiError(error) }),
        });
      }
    } finally {
      if (request === controller) {
        request = null;
        if (!disposed) {
          setPending(false);
        }
      }
    }
  };
  const label = () =>
    t(pending() ? "chat.detailPanel.downloading" : "chat.detailPanel.downloadFile");
  return (
    <openclaw-tooltip prop:content={label()}>
      <button
        class={props.class}
        type="button"
        aria-label={label()}
        disabled={props.disabled || pending()}
        ref={(button) =>
          button.addEventListener("click", (event) => {
            event.stopPropagation();
            void download();
          })
        }
      >
        <Icon name="download" />
      </button>
    </openclaw-tooltip>
  );
}
