import { For, createSignal, untrack } from "solid-js";
import { registerFilePreviewEnglish } from "../../../i18n/locales/en-file-preview.ts";
import { copyToClipboard } from "../../../lib/clipboard.ts";
import { downloadTextFile } from "../../../lib/download.ts";
import { t } from "../../../lib/reactive/i18n.ts";
import type { FileDraft } from "./file-draft-recovery-dialog.ts";

registerFilePreviewEnglish();

export function FileDraftRecoveryDialog(props: {
  drafts: readonly FileDraft[];
  settled: () => boolean;
  finish: () => void;
}) {
  const [remaining, setRemaining] = createSignal([...props.drafts]);
  const [error, setError] = createSignal("");
  const [copied, setCopied] = createSignal<FileDraft>();
  const current = (draft: FileDraft) => {
    if (props.settled()) {
      return false;
    }
    if (!remaining().includes(draft) || !draft.isCurrent()) {
      setError(t("chat.detailPanel.draftRecovery.changed"));
      return false;
    }
    return true;
  };
  const action = (label: string, run: () => void | Promise<void>, danger = false) => (
    <button type="button" class={danger ? "btn danger" : "btn"} onClick={run}>
      {label}
    </button>
  );
  return (
    <openclaw-modal-dialog
      label={t("chat.detailPanel.draftRecovery.review")}
      description={t("chat.detailPanel.draftRecovery.description")}
      onModal-cancel={props.finish}
    >
      <section class="exec-approval-card exec-approval-modal-stack">
        <div class="exec-approval-header">
          <div>
            <div class="exec-approval-title">{t("chat.detailPanel.draftRecovery.review")}</div>
            <div class="exec-approval-sub">{t("chat.detailPanel.draftRecovery.description")}</div>
          </div>
        </div>
        <For each={remaining()} keyed={(draft) => draft}>
          {(draft) => {
            // The object is the row key; async actions retain it after the row is disposed.
            const entry = untrack(draft);
            return (
              <section
                role="group"
                style="overflow-wrap: anywhere"
                aria-label={[
                  entry.path,
                  entry.context?.sessionTitle,
                  entry.context?.paneLabel,
                  entry.context?.sessionKey,
                ]
                  .filter(Boolean)
                  .join(" — ")}
              >
                {entry.context ? (
                  <>
                    <div class="exec-approval-title">{entry.context.sessionTitle}</div>
                    <div class="exec-approval-sub">{entry.context.paneLabel}</div>
                    <div class="exec-approval-sub">{entry.context.sessionKey}</div>
                  </>
                ) : undefined}
                <label class="field">
                  <span>{entry.path}</span>
                  <textarea readonly rows="6" value={entry.content} />
                </label>
                <div class="exec-approval-actions">
                  {action(
                    copied() === entry
                      ? t("common.copied")
                      : t("chat.detailPanel.draftRecovery.copy", { name: entry.name }),
                    async () => {
                      if (!current(entry)) {
                        return;
                      }
                      const ok = await copyToClipboard(entry.content, () => current(entry));
                      if (current(entry)) {
                        setCopied(ok ? entry : undefined);
                        setError(ok ? "" : t("chat.detailPanel.draftRecovery.copyFailed"));
                      }
                    },
                  )}
                  {action(
                    t("chat.detailPanel.draftRecovery.download", { name: entry.name }),
                    () => {
                      if (current(entry)) {
                        downloadTextFile(entry.name, entry.content);
                      }
                    },
                  )}
                  {action(
                    t("chat.detailPanel.draftRecovery.discard", { name: entry.name }),
                    () => {
                      if (!current(entry) || !entry.discard()) {
                        return;
                      }
                      const next = remaining().filter((item) => item !== entry);
                      setRemaining(next);
                      setError("");
                      if (!next.length) {
                        props.finish();
                      }
                    },
                    true,
                  )}
                </div>
              </section>
            );
          }}
        </For>
        {error() ? <p role="alert">{error()}</p> : undefined}
        <div class="exec-approval-actions">
          <button type="button" class="btn" autofocus onClick={props.finish}>
            {t("chat.detailPanel.draftRecovery.keep")}
          </button>
        </div>
      </section>
    </openclaw-modal-dialog>
  );
}
