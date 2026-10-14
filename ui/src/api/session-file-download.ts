import type {
  SessionsFilesDownloadParams,
  SessionsFilesDownloadResult,
} from "../../../packages/gateway-protocol/src/schema/sessions.js";
import { normalizeBasePath } from "../app-route-paths.ts";
import { fetchControlUiResource } from "../app/browser-http.ts";
import { isHttpArtifactDownloadUrl } from "./artifact-download.ts";
import type { GatewayBrowserClient } from "./gateway.ts";

type FileDownloadHost = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  connectionEpoch: number;
  sessionKey: string;
  resourceBasePath?: string;
};

/** Files chooses and authorizes the bytes; the browser never converts a preview into a download. */
export async function downloadSessionFile(
  state: FileDownloadHost,
  params: SessionsFilesDownloadParams,
  signal: AbortSignal,
): Promise<Blob | null> {
  const { client, connectionEpoch, sessionKey, resourceBasePath } = state;
  const current = () =>
    !signal.aborted &&
    state.connected &&
    state.client === client &&
    state.connectionEpoch === connectionEpoch &&
    state.sessionKey === sessionKey;
  if (!client || !current()) {
    return null;
  }
  const result = await client.request<SessionsFilesDownloadResult>(
    "sessions.files.download",
    params,
  );
  if (!current()) {
    return null;
  }
  const url = normalizeBasePath(resourceBasePath ?? "") + result.url;
  if (!isHttpArtifactDownloadUrl(url, resourceBasePath)) {
    throw new Error("Invalid file download URL");
  }
  const response = await fetchControlUiResource(url, {
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    signal,
  });
  if (!response.ok) {
    throw new Error("HTTP " + response.status);
  }
  if (
    response.headers.get("content-disposition")?.split(";", 1)[0]?.trim().toLowerCase() !==
    "attachment"
  ) {
    throw new Error("File download returned an unexpected content disposition");
  }
  const blob = await response.blob();
  if (
    blob.type.split(";", 1)[0]?.trim().toLowerCase() !==
    result.mimeType.split(";", 1)[0]?.trim().toLowerCase()
  ) {
    throw new Error("File download returned an unexpected content type");
  }
  return current() ? blob : null;
}
