import { createComponent } from "solid-js";
import { withPromiseModalHost } from "../../../components/promise-modal-host.ts";
import type { FileSidebarContent } from "./chat-sidebar-content-types.ts";
import { FileDraftRecoveryDialog } from "./file-draft-recovery-dialog-view.tsx";

export type FileDraft = {
  name: string;
  path: string;
  context: FileSidebarContent["draftContext"];
  content: string;
  isCurrent: () => boolean;
  discard: () => boolean;
};

export function reviewFileDrafts(drafts: readonly FileDraft[]): Promise<void> {
  return withPromiseModalHost<void>(undefined, (modal) => {
    modal.render(() =>
      createComponent(FileDraftRecoveryDialog, {
        drafts,
        settled: () => modal.settled,
        finish: modal.finish,
      }),
    );
  });
}
