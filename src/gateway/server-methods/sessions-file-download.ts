import { detectMime } from "@openclaw/media-core/mime";
import { canCreateArtifactDownload, createArtifactDownload } from "../artifact-download-grants.js";
import { WORKSPACE_DOWNLOAD_MAX_BYTES } from "../workspace-file-limits.js";
import {
  collectSessionFileDownload,
  readSessionFileDownloadWindow,
  sessionFileByteResponse,
} from "./session-file-download.js";
import type { createSessionFileReadAuthority } from "./session-file-read-authority.js";
import { sessionFilesError } from "./session-files-errors.js";
import { readGatewayRequestMutationAuthority } from "./session-mutation-guards.js";
import { downloadRepositoryArtifact } from "./session-repository-artifacts.js";
import type { resolveRepositoryWorkspaceAccess } from "./session-repository-workspace-access.js";
import type { GatewayRequestHandlerOptions } from "./types.js";
import type { LoadedSessionFiles } from "./workspace-files.js";

/** Byte transport borrows the file-route owner's exact session, repository and host grants. */
export async function respondSessionFileDownload(params: {
  options: GatewayRequestHandlerOptions;
  path: string;
  loaded: LoadedSessionFiles;
  repository: Awaited<ReturnType<typeof resolveRepositoryWorkspaceAccess>>;
  hostRead: ReturnType<typeof createSessionFileReadAuthority>;
  assertSessionCurrent: () => void;
  release: () => void;
  onGrantCreated: () => void;
}): Promise<void> {
  const { options, repository, hostRead } = params;
  const { respond } = options;
  if (!canCreateArtifactDownload(options.client)) {
    respond(
      false,
      undefined,
      sessionFilesError(
        "session_file_download_unavailable",
        "File downloads require a live Gateway connection.",
      ),
    );
    return;
  }
  const authority = readGatewayRequestMutationAuthority(options);
  const assertDownloadCurrent = () => {
    authority.assertCurrent();
    params.assertSessionCurrent();
    repository?.assertCurrent();
    hostRead.assertCurrent();
  };
  const filePath = params.path;
  const readBytes = () =>
    repository?.kind === "stored"
      ? downloadRepositoryArtifact(repository, filePath)
      : collectSessionFileDownload((offset, identity) =>
          repository?.kind === "active"
            ? repository.inspect("download", {
                files: params.loaded.files,
                path: filePath,
                offset,
                identity,
              })
            : readSessionFileDownloadWindow({
                ...params.loaded,
                path: filePath,
                offset,
                identity,
                authorizeHostRead: hostRead.authorizeHostRead,
                assertCurrent: assertDownloadCurrent,
              }),
        );
  const initial = await readBytes();
  assertDownloadCurrent();
  if (initial.status === "missing") {
    respond(
      false,
      undefined,
      sessionFilesError("session_file_not_found", "session file not found", { path: filePath }),
    );
    return;
  }
  if (initial.status === "too-large") {
    respond(
      false,
      undefined,
      sessionFilesError(
        "session_file_download_too_large",
        "Session file exceeds the 8 MiB download limit.",
        {
          path: filePath,
          size: initial.size,
          maxDownloadBytes: WORKSPACE_DOWNLOAD_MAX_BYTES,
        },
      ),
    );
    return;
  }
  const { digest, filename } = initial;
  const mimeType =
    (await detectMime({
      buffer: Buffer.from(initial.bytes.subarray(0, 4100)),
      filePath: filename,
    })) ?? "application/octet-stream";
  const artifact = {
    id: digest,
    type: "file",
    title: filename,
    mimeType,
    sizeBytes: initial.bytes.length,
    download: { mode: "url" as const },
  };
  const publish = () => {
    assertDownloadCurrent();
    const download = createArtifactDownload({
      client: options.client,
      prepared: { artifact, digest },
      assertCurrent: assertDownloadCurrent,
      release: params.release,
      read: async (response) => {
        assertDownloadCurrent();
        const current = await readBytes();
        assertDownloadCurrent();
        if (current.status !== "ok" || current.digest !== response.expectedDigest) {
          return undefined;
        }
        const prepare = () => ({
          artifact,
          ...sessionFileByteResponse(current.bytes, response),
        });
        return hostRead.hasHostRead() ? hostRead.withCurrent(prepare) : prepare();
      },
    });
    params.onGrantCreated();
    respond(true, { filename, mimeType, ...download });
  };
  if (hostRead.hasHostRead()) {
    await hostRead.withCurrent(publish);
  } else {
    publish();
  }
}
