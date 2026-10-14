import { createHash } from "node:crypto";
import { readFileWindowFully } from "@openclaw/fs-safe/advanced";
import type { ArtifactDownloadResponseRequest } from "../artifact-download-projection.js";
import { resolveByteResponse } from "../http-byte-range.js";
import {
  WORKSPACE_DOWNLOAD_CHUNK_BYTES,
  WORKSPACE_DOWNLOAD_MAX_BYTES,
} from "../workspace-file-limits.js";
import { resolveSessionFileReadTarget } from "./session-file-read.js";
import { getSessionWorkspaceFile, type LoadedSessionFiles } from "./workspace-files.js";
import { openWorkspaceRoot, readWorkspaceFile } from "./workspace-fs.js";

export type SessionFileDownloadWindow =
  | { status: "missing" }
  | { status: "too-large"; size: number }
  | { status: "ok"; filename: string; size: number; identity: string; data: string };

/** Selection stays with the preview owner; this reader only changes the byte budget. */
export async function readSessionFileDownloadWindow(
  params: LoadedSessionFiles & {
    path: string;
    offset: number;
    identity?: string;
    assertCurrent: () => void;
  },
): Promise<SessionFileDownloadWindow> {
  const selected = await getSessionWorkspaceFile({ ...params, includeContent: false });
  params.assertCurrent();
  const file = selected.file;
  if (!file || file.missing || !file.workspacePath) {
    return { status: "missing" };
  }
  const target = await resolveSessionFileReadTarget(
    { ...params, fileRoot: params.root },
    file.workspacePath,
  );
  params.assertCurrent();
  if (!target || target === "outside_session_boundary") {
    return { status: "missing" };
  }
  const root = typeof target.root === "string" ? await openWorkspaceRoot(target.root) : target.root;
  if (!root) {
    return { status: "missing" };
  }
  let bytes: Buffer;
  let size: number;
  let identity: string;
  if ("access" in root) {
    const read = await readWorkspaceFile(root, target.path, {
      maxBytes: WORKSPACE_DOWNLOAD_MAX_BYTES,
      assertCurrent: params.assertCurrent,
    });
    params.assertCurrent();
    if (read === "too-large") {
      return { status: "too-large", size: file.size ?? WORKSPACE_DOWNLOAD_MAX_BYTES + 1 };
    }
    if (!read) {
      return { status: "missing" };
    }
    size = read.buffer.length;
    identity = createHash("sha256").update(read.buffer).digest("hex");
    bytes = read.buffer.subarray(params.offset, params.offset + WORKSPACE_DOWNLOAD_CHUNK_BYTES);
  } else {
    const opened = await root.open(target.path);
    await using handle = opened.handle;
    params.assertCurrent();
    const before = await handle.stat();
    size = before.size;
    if (size > WORKSPACE_DOWNLOAD_MAX_BYTES) {
      return { status: "too-large", size };
    }
    const key = (stat: typeof before) =>
      JSON.stringify([opened.realPath, stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs]);
    identity = key(before);
    if (params.identity !== undefined && params.identity !== identity) {
      throw new Error("Session file changed during download; retry the download.");
    }
    bytes = Buffer.alloc(
      Math.min(WORKSPACE_DOWNLOAD_CHUNK_BYTES, Math.max(0, size - params.offset)),
    );
    if (
      (await readFileWindowFully(handle, bytes, params.offset)) !== bytes.length ||
      key(await handle.stat()) !== identity
    ) {
      throw new Error("Session file changed during download; retry the download.");
    }
  }
  params.assertCurrent();
  if (params.identity !== undefined && params.identity !== identity) {
    throw new Error("Session file changed during download; retry the download.");
  }
  return { status: "ok", filename: file.name, size, identity, data: bytes.toString("base64") };
}

/** A single bounded allocation; every worker window must name the same opened-file identity. */
export async function collectSessionFileDownload(
  read: (offset: number, identity?: string) => Promise<SessionFileDownloadWindow>,
) {
  let first = await read(0);
  if (first.status !== "ok") {
    return first;
  }
  const { size, filename, identity } = first;
  const bytes = new Uint8Array(size);
  for (let offset = 0; ;) {
    const window = Buffer.from(first.data, "base64");
    const expected = Math.min(WORKSPACE_DOWNLOAD_CHUNK_BYTES, size - offset);
    if (first.size !== size || first.identity !== identity || window.length !== expected) {
      throw new Error("Session file download returned an inconsistent byte window.");
    }
    bytes.set(window, offset);
    offset += window.length;
    if (offset === size) {
      break;
    }
    first = await read(offset, identity);
    if (first.status !== "ok") {
      throw new Error("Session file became unavailable during download.");
    }
  }
  return {
    status: "ok" as const,
    filename,
    bytes,
    digest: createHash("sha256").update(bytes).digest("hex"),
  };
}

export function sessionFileByteResponse(
  bytes: Uint8Array<ArrayBuffer>,
  request: ArtifactDownloadResponseRequest,
) {
  const response = resolveByteResponse({
    file: { size: bytes.length },
    method: request.method,
    request: { headers: request.headers, headersDistinct: {} },
  });
  return {
    response,
    body:
      request.method === "HEAD" ||
      response.kind === "not-modified" ||
      response.kind === "unsatisfiable"
        ? undefined
        : response.kind === "partial"
          ? bytes.subarray(response.range.start, response.range.end + 1)
          : bytes,
  };
}
