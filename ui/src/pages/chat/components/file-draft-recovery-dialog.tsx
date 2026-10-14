import { render } from "@solidjs/web";
import { createSignal, For, untrack } from "solid-js";
import { withPromiseModalHost } from "../../../components/promise-modal-host.ts";
import { registerFilePreviewEnglish } from "../../../i18n/locales/en-file-preview.ts";
import { copyToClipboard } from "../../../lib/clipboard.ts";
import { downloadTextFile } from "../../../lib/download.ts";
import { registerEnglishCatalog, t } from "../../../lib/reactive/i18n.ts";
import type { FileSidebarContent } from "./chat-sidebar-content-types.ts";

registerEnglishCatalog(registerFilePreviewEnglish);

type FileDraft = {
  name: string;
  path: string;
  context: FileSidebarContent["draftContext"];
  content: string;
  isCurrent: () => boolean;
  discard: () => boolean;
};

function FileDraftRecoveryDialog(props: {
  drafts: readonly FileDraft[];
  settled: () => boolean;
  finish: () => void;
}) {
  const [remaining, setRemaining] = createSignal(untrack(() => props.drafts));
  const [error, setError] = createSignal("");
  const [copied, setCopied] = createSignal<FileDraft>();
  const current = (draft: FileDraft) => {
    if (props.settled()) {
      return false;
    }
    if (!untrack(remaining).includes(draft) || !draft.isCurrent()) {
      setError(t("chat.detailPanel.draftRecovery.changed"));
      return false;
    }
    return true;
  };
  const copy = async (draft: FileDraft) => {
    if (!current(draft)) {
      return;
    }
    const ok = await copyToClipboard(draft.content, () => current(draft));
    if (current(draft)) {
      setCopied(ok ? draft : undefined);
      setError(ok ? "" : t("chat.detailPanel.draftRecovery.copyFailed"));
    }
  };
  const discard = (draft: FileDraft) => {
    if (!current(draft) || !draft.discard()) {
      return;
    }
    const next = remaining().filter((item) => item !== draft);
    setRemaining(next);
    setError("");
    if (!next.length) {
      props.finish();
    }
  };
  return (
    <openclaw-modal-dialog
      label={t("chat.detailPanel.draftRecovery.review")}
      description={t("chat.detailPanel.draftRecovery.description")}
      onModal-cancel={() => props.finish()}
    >
      <section class="exec-approval-card exec-approval-modal-stack">
        <div class="exec-approval-header">
          <div>
            <div class="exec-approval-title">{t("chat.detailPanel.draftRecovery.review")}</div>
            <div class="exec-approval-sub">{t("chat.detailPanel.draftRecovery.description")}</div>
          </div>
        </div>
        <For each={remaining()} keyed={(draft) => draft}>
          {(draft) => (
            <section
              role="group"
              style={{ "overflow-wrap": "anywhere" }}
              aria-label={[
                draft().path,
                draft().context?.sessionTitle,
                draft().context?.paneLabel,
                draft().context?.sessionKey,
              ]
                .filter(Boolean)
                .join(" — ")}
            >
              {draft().context ? (
                <>
                  <div class="exec-approval-title">{draft().context?.sessionTitle}</div>
                  <div class="exec-approval-sub">{draft().context?.paneLabel}</div>
                  <div class="exec-approval-sub">{draft().context?.sessionKey}</div>
                </>
              ) : null}
              <label class="field">
                <span>{draft().path}</span>
                <textarea readonly rows="6" value={draft().content} />
              </label>
              <div class="exec-approval-actions">
                <button type="button" class="btn" onClick={() => void copy(draft())}>
                  {copied() === draft()
                    ? t("common.copied")
                    : t("chat.detailPanel.draftRecovery.copy", { name: draft().name })}
                </button>
                <button
                  type="button"
                  class="btn"
                  onClick={() => {
                    if (current(draft())) {
                      downloadTextFile(draft().name, draft().content);
                    }
                  }}
                >
                  {t("chat.detailPanel.draftRecovery.download", { name: draft().name })}
                </button>
                <button type="button" class="btn danger" onClick={() => discard(draft())}>
                  {t("chat.detailPanel.draftRecovery.discard", { name: draft().name })}
                </button>
              </div>
            </section>
          )}
        </For>
        {error() ? <p role="alert">{error()}</p> : null}
        <div class="exec-approval-actions">
          <button type="button" class="btn" autofocus onClick={() => props.finish()}>
            {t("chat.detailPanel.draftRecovery.keep")}
          </button>
        </div>
      </section>
    </openclaw-modal-dialog>
  );
}

export function reviewFileDrafts(drafts: readonly FileDraft[]): Promise<void> {
  return withPromiseModalHost<void, ReturnType<typeof FileDraftRecoveryDialog>>(
    undefined,
    (modal) =>
      modal.render(() => (
        <FileDraftRecoveryDialog
          drafts={drafts}
          settled={() => modal.settled}
          finish={() => modal.finish()}
        />
      )),
    (content, host) => render(content, host),
  );
}
