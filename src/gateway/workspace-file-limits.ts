/** Shared preview cap for workspace readers and staged worker results. */
export const WORKSPACE_PREVIEW_MAX_BYTES = 256 * 1024;

/** Bounded original-byte downloads; not the inline preview cap. */
export const WORKSPACE_DOWNLOAD_MAX_BYTES = 8 * 1024 * 1024;
/** Base64 windows stay below the 2 MiB workspace inspection envelope. */
export const WORKSPACE_DOWNLOAD_CHUNK_BYTES = 512 * 1024;
