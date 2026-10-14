import { html, render } from "lit";
import { createComponent } from "solid-js";
import { renderCopyButton } from "../components/copy-button.ts";
import { brandIconData } from "../components/icon-data-brand.ts";
import { renderIconRegistry } from "../components/icons-tools.ts";
import { icons } from "../components/icons.ts";
import { renderKbd } from "../components/kbd.ts";
import { renderAgentStartupState, renderLazyViewError } from "../components/lazy-view-error.ts";
import { renderLoadingState } from "../components/loading-state.ts";
import {
  renderPanelLoadingSkeleton,
  type PanelLoadingSkeletonVariant,
} from "../components/panel-loading-skeleton.ts";
import {
  renderProviderBrandIcon,
  renderProviderFallbackIcon,
  resolveCloudProfileIcon,
} from "../components/provider-icon.ts";
import { Icon } from "../components/solid/icon.tsx";
import { KeyboardShortcut } from "../components/solid/kbd.tsx";
import { ConnectingSplash } from "../components/solid/loading-skeleton.tsx";
import { PanelIconButton } from "../components/solid/panel-icon-button.tsx";
import { PanelRefreshStatus } from "../components/solid/panel-refresh-status.tsx";
import "../components/solid/panel-empty-state.tsx";
import { solidContent } from "../lit/solid-content.tsx";
import { finishFixture, group, recordAction, root } from "./presentation-primitives-fixture.ts";
import kbdStyles from "../components/kbd.css?inline";

const brandIcons = renderIconRegistry(brandIconData);
const keyboardStyles = document.createElement("style");
keyboardStyles.textContent = kbdStyles;
document.head.append(keyboardStyles);
const button = (label: string, action = label) =>
  html`<button class="btn" @click=${() => recordAction(action)}>${label}</button>`;
function card(label: string, content: unknown, kind = "") {
  return html`<section class="presentation-fixture__card" data-example=${label}>
    <h2>${label}</h2>
    <div class=${`presentation-fixture__body${kind ? ` presentation-fixture__body--${kind}` : ""}`}>
      ${content}
    </div>
  </section>`;
}
function feedback() {
  return [
    card(
      "Empty with action",
      html`<openclaw-panel-empty-state
        .heading=${"No files"}
        .description=${"Add a file to begin working in this panel."}
      >
        ${icons.folder}
        <span slot="action">${button("Add file", "add-file")}</span>
      </openclaw-panel-empty-state>`,
      "empty",
    ),
    card(
      "Refresh stale",
      solidContent(PanelRefreshStatus, {
        status: { error: null, hasLoaded: true, stale: true, awaitingGateway: false },
      }),
    ),
    card(
      "Refresh failed",
      solidContent(PanelRefreshStatus, {
        status: {
          error: "Synthetic refresh failure",
          hasLoaded: true,
          stale: true,
          awaitingGateway: false,
        },
      }),
    ),
    card(
      "Lazy error",
      renderLazyViewError({
        error: new Error("Synthetic module failure"),
        subtitle: "Files could not open.",
        onRetry: () => recordAction("retry"),
        onClose: () => recordAction("close"),
      }),
    ),
    card(
      "Stale module",
      renderLazyViewError({
        error: new Error("Synthetic stale module"),
        stale: true,
        onRetry: () => recordAction("reload"),
      }),
    ),
    card(
      "Inline error",
      renderLazyViewError({
        error: "Synthetic inline error",
        render: () => html`<p>Existing panel content remains visible.</p>`,
        onRetry: () => recordAction("inline-retry"),
      }),
    ),
    card(
      "Actions and shortcuts",
      html`<div class="presentation-fixture__inline">
        ${renderCopyButton("synthetic clipboard text", "Copy text")}${renderCopyButton("", "Copy unavailable text")}${solidContent(PanelIconButton, { label: "Refresh panel", icon: createComponent(Icon, { name: "refresh" }), class: "btn btn--icon", onClick: () => recordAction("refresh") })}${solidContent(PanelIconButton, { label: "Busy panel", icon: createComponent(Icon, { name: "refresh" }), class: "btn btn--icon", onClick: () => recordAction("unexpected"), disabled: true, busy: true })}${renderKbd(["⌘", "↵"])}${solidContent(KeyboardShortcut, { combo: { key: "k", modifiers: ["mod"] }, applePlatform: false })}
      </div>`,
    ),
  ];
}
function iconGallery() {
  const names = [
    "copy",
    "check",
    "info",
    "refresh",
    "alertTriangle",
    "folder",
    "mark",
    "lobster",
    "github",
  ] as const;
  return card(
    "Icon families",
    html`<div class="presentation-fixture__icons">
      ${names.map((name) => html`<div>${icons[name]}<span>${name}</span></div>`)}
      ${Object.entries(brandIcons).map(([name, svg]) => html`<div>${svg}<span>${name}</span></div>`)}
      ${["google", "acp-copilot", "anthropic", "unknown"].map((provider) => html`<div>${renderProviderBrandIcon(provider)}<span>${provider}</span></div>`)}
      <div>${renderProviderFallbackIcon("👨‍👩‍👧‍👦")}<span>Emoji fallback</span></div>
      <div>${resolveCloudProfileIcon({ providerId: "google" }).icon}<span>Cloud profile</span></div>
    </div>`,
  );
}
function skeletons() {
  const variants: PanelLoadingSkeletonVariant[] =
    group === "skeleton-structure"
      ? ["board", "browser", "desktop"]
      : group === "skeleton-content"
        ? ["files", "file-list", "document", "review"]
        : ["chat", "discussion", "terminal"];
  return [
    variants.map((variant) =>
      card(variant, renderPanelLoadingSkeleton(variant, `Loading ${variant}`), "panel"),
    ),
    group === "skeleton-conversation"
      ? [
          card("compact", renderPanelLoadingSkeleton("terminal", "Loading compact terminal", true)),
          card(
            "overlay",
            html`<p>Retained content</p>
              ${renderPanelLoadingSkeleton("files", "Refreshing files", false, true)}`,
            "panel",
          ),
        ]
      : undefined,
  ];
}
const content =
  group === "feedback"
    ? feedback()
    : group === "icons"
      ? iconGallery()
      : group === "loading"
        ? [
            card("Loading route", renderLoadingState(), "loading"),
            card(
              "Connecting",
              solidContent(ConnectingSplash, { status: "Connecting to Gateway" }),
              "loading",
            ),
            card("Starting agent", renderAgentStartupState()),
          ]
        : skeletons();
render(
  html`<h1>${group}</h1>
    <div class="presentation-fixture__grid">${content}</div>`,
  root,
);
finishFixture();
