import { createComponent } from "solid-js";
import { expect, onTestFinished, vi } from "vitest";
import type { ApplicationContext } from "../../app/context.ts";
import { i18n } from "../../i18n/index.ts";
import { createRuntimeConfigCapability } from "../../lib/config/runtime-config-capability.ts";
import {
  createApplicationContextProvider,
  createApplicationGateway,
} from "../../test-helpers/application-context.ts";
import { createSolidApplicationContextProvider } from "../../test-helpers/solid-application-context.tsx";
import { mountSolid } from "../../test-helpers/solid-render.tsx";
import { renderChatQueueSolid } from "./components/chat-composer-queue.tsx";
import { ChatComposer, resetChatComposerState } from "./components/chat-composer.tsx";

type ComposerProps = Parameters<typeof ChatComposer>[0];
const composerViews = new Map<HTMLElement, ReturnType<typeof mountSolid<ComposerProps>>>();
const composerWrappers = new WeakMap<
  HTMLElement,
  ReturnType<typeof createSolidApplicationContextProvider>["wrapper"]
>();
type QueueProps = Parameters<typeof renderChatQueueSolid>[0];
const queueViews = new Map<HTMLElement, ReturnType<typeof mountSolid<QueueProps>>>();

export function renderComposerQueueInto(props: QueueProps, container: HTMLElement) {
  const previous = queueViews.get(container);
  if (previous) {
    previous.update({ ...props });
    return;
  }
  queueViews.set(container, mountSolid(renderChatQueueSolid, { ...props }, container));
  onTestFinished(() => unmountComposerQueue(container));
}

export function unmountComposerQueue(container: HTMLElement) {
  const view = queueViews.get(container);
  queueViews.delete(container);
  view?.dispose();
}

export function renderComposerInto(props: ComposerProps, container: HTMLElement) {
  const next = { ...props, renderRevision: {} };
  const previous = composerViews.get(container);
  if (previous) {
    previous.update(next);
    return;
  }
  const wrapper = composerWrappers.get(container);
  const view = mountSolid(
    (current: ComposerProps) =>
      wrapper
        ? createComponent(wrapper, {
            get children() {
              return createComponent(ChatComposer, current);
            },
          })
        : createComponent(ChatComposer, current),
    next,
    container,
  );
  composerViews.set(container, view);
  onTestFinished(() => unmountComposer(container));
}

export function unmountComposer(container: HTMLElement) {
  const view = composerViews.get(container);
  composerViews.delete(container);
  view?.dispose();
}

export function createComposerProps(overrides: Partial<ComposerProps> = {}): ComposerProps {
  return {
    paneId: crypto.randomUUID(),
    sessionKey: "main",
    currentAgentId: "main",
    connected: true,
    canSend: true,
    disabledReason: null,
    sending: false,
    messages: [],
    stream: null,
    queue: [],
    draft: "",
    modelCatalog: [],
    modelSwitching: false,
    sessions: null,
    selectedSession: overrides.sessions?.sessions.find(
      (row) => row.key === (overrides.sessionKey ?? "main"),
    ),
    assistantName: "OpenClaw",
    onDraftChange: vi.fn(),
    onSend: vi.fn(),
    onQueueRemove: vi.fn(),
    ...overrides,
  };
}

export function renderComposerFixture(overrides: Partial<ComposerProps> = {}) {
  const container = createComposerContainer();
  const props = createComposerProps(overrides);
  renderComposerInto(props, container);
  return { container, props };
}

export function createComposerContainer() {
  const gateway = createApplicationGateway().gateway;
  const runtimeConfig = createRuntimeConfigCapability(gateway);
  onTestFinished(() => runtimeConfig.dispose());
  const context: Pick<ApplicationContext, "gateway" | "agentSelection" | "runtimeConfig"> = {
    gateway,
    runtimeConfig,
    agentSelection: {
      state: { selectedId: "main", scopeId: "main" },
      intentRevision: 0,
      set: () => {},
      setScope: () => {},
      subscribe: () => () => {},
    },
  };
  // SAFETY: Disconnected composer and transcript fixtures only consume these capabilities.
  const application = context as ApplicationContext;
  const container = createApplicationContextProvider(application);
  composerWrappers.set(container, createSolidApplicationContextProvider(application).wrapper);
  return container;
}

export function findComposerButton(container: Element, label: string): HTMLButtonElement {
  const result = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!result) {
    throw new Error(`expected button ${label}`);
  }
  return result;
}

export function findPrimaryButton(container: Element): HTMLButtonElement {
  const actions = container.querySelector(".agent-chat__composer-actions");
  const result = actions?.querySelector<HTMLButtonElement>(
    ":scope > .chat-desktop-primary-action > openclaw-tooltip > button",
  );
  if (!result) {
    throw new Error("expected one primary composer button");
  }
  expect(
    actions?.querySelectorAll(":scope > .chat-desktop-primary-action > openclaw-tooltip > button"),
  ).toHaveLength(1);
  return result;
}

export async function resetComposerFixture(afterStateReset?: () => void): Promise<void> {
  for (const container of composerViews.keys()) {
    unmountComposer(container);
  }
  for (const container of queueViews.keys()) {
    unmountComposerQueue(container);
  }
  resetChatComposerState();
  afterStateReset?.();
  localStorage.clear();
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await i18n.setLocale("en");
  vi.restoreAllMocks();
}
