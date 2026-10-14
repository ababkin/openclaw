import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { awaitGateBeforeSettlement, createDeferred } from "../../../test/helpers/promise.js";
import { closeStateDatabaseForTest } from "../../test-utils/database-cleanup.js";
import { WorkerNodeLostError } from "../../worker/worker-node-loss.js";
import type { WorkerSessionTurnClaim } from "./placement-store.js";
import type { WorkerTurnTunnelHandle } from "./tunnel-contract.js";
import {
  SESSION_ID,
  SESSION_KEY,
  attachedEnvironment,
  cleanupWorkerTurnLauncherTest,
  createWorkerSessionTurnPlacementProvider,
  createWorkerTurnTunnel,
  credential,
  placements,
  reconcileUnchangedLocalWorkspace,
  seedActivePlacement,
  setupWorkerTurnLauncherTest,
  turn,
  unusedEnvironments,
  type WorkerTurnEnvironmentService,
  type WorkerTurnLauncherOptions,
} from "./worker-turn-launcher.test-support.js";

afterAll(closeStateDatabaseForTest);

describe("worker turn launcher node-loss continuation", () => {
  beforeEach(setupWorkerTurnLauncherTest);
  afterEach(() => cleanupWorkerTurnLauncherTest({ reuseReadWorkers: true }));

  it("retains an interrupted workspace and waits for reconnect before allowing continuation", async () => {
    await seedActivePlacement();
    const loss = new WorkerNodeLostError();
    const reconnect = createDeferred();
    const waiting = createDeferred();
    const order: string[] = [];
    let interruptedClaim: WorkerSessionTurnClaim | undefined;
    const launchTurn = vi.fn(
      async (request: Parameters<WorkerTurnTunnelHandle["launchTurn"]>[0]) => {
        interruptedClaim = request.turnClaim;
        request.onDispatchReady?.();
        throw loss;
      },
    );
    const persistAbandonedPartial = vi.fn<
      NonNullable<WorkerTurnLauncherOptions["persistAbandonedPartial"]>
    >(async (claim) => {
      expect(claim.missingToolResultText).toBe(loss.message);
      order.push("transcript saved");
    });
    const environment = {
      ...attachedEnvironment(),
      nodeDeviceId: "paired-node",
      sshEndpoint: null,
    };
    const environments: WorkerTurnEnvironmentService = {
      ...unusedEnvironments(),
      get: () => environment,
      acquireTurnCredential: async () => credential(),
      acknowledgeCredentialDelivery: async () => true,
      startTunnel: async () =>
        createWorkerTurnTunnel({
          reconcileWorkspace: reconcileUnchangedLocalWorkspace,
          launchTurn,
        }),
      stopTunnel: async () => {
        order.push("tunnel stopped");
      },
    };
    const reconcileActivePlacement = vi.fn(async () => {
      expect(interruptedClaim).toBeDefined();
      await placements.acceptWorkspaceResult(interruptedClaim!);
      await placements.completeWorkspaceResultAndReleaseTurn(interruptedClaim!);
      order.push("workspace settled");
    });
    const provider = createWorkerSessionTurnPlacementProvider({
      placements,
      environments,
      persistAbandonedPartial,
      reconcileActivePlacement,
      waitForAdmissionNode: async ({ signal, assertCurrent }) => {
        expect(signal.aborted).toBe(false);
        expect(await placements.listPendingWorkspaceResultsAsync()).toMatchObject([
          { runId: "node-loss-reconnect", recoveryRequestedAtMs: expect.any(Number) },
        ]);
        waiting.resolve();
        await reconnect.promise;
        assertCurrent();
        order.push("node reconnected");
      },
    });
    const runLocal = vi.fn();
    const attempt = provider
      .executeTurn(
        {
          sessionId: SESSION_ID,
          sessionKey: SESSION_KEY,
          agentId: "main",
          runId: "node-loss-reconnect",
        },
        turn("node-loss-reconnect"),
        runLocal,
      )
      .catch((error: unknown) => error);
    try {
      await awaitGateBeforeSettlement(
        waiting.promise,
        attempt,
        "node loss settled before reconnect admission",
      );
      expect(loss.canContinue).toBe(false);
      expect(reconcileActivePlacement).not.toHaveBeenCalled();
      reconnect.resolve();
      expect(await attempt).toBe(loss);
      expect(loss.canContinue).toBe(true);
      expect(order).toEqual([
        "transcript saved",
        "tunnel stopped",
        "node reconnected",
        "workspace settled",
      ]);
      expect(launchTurn).toHaveBeenCalledOnce();
      expect(runLocal).not.toHaveBeenCalled();
      expect(await placements.listPendingWorkspaceResultsAsync()).toEqual([]);
      expect(placements.get(SESSION_ID)).toMatchObject({ state: "active", turnClaim: null });
    } finally {
      reconnect.resolve();
      await attempt;
    }
  });

  it.each([
    "partial persistence failed",
    "node never reconnects",
    "retained workspace and no reconnect",
  ] as const)("does not allow continuation when %s", async (failure) => {
    await seedActivePlacement();
    const loss = new WorkerNodeLostError();
    const waitForAdmissionNode = vi.fn(async () => {
      throw new Error("node admission expired");
    });
    const reconcileActivePlacement = vi.fn();
    const destroy = vi.fn(async () => attachedEnvironment());
    const launchTurn = vi.fn(
      async (request: Parameters<WorkerTurnTunnelHandle["launchTurn"]>[0]) => {
        request.onDispatchReady?.();
        if (failure !== "retained workspace and no reconnect") {
          await placements.markWorkspaceResultPending(request.turnClaim);
        }
        throw loss;
      },
    );
    const provider = createWorkerSessionTurnPlacementProvider({
      placements,
      waitForAdmissionNode,
      reconcileActivePlacement,
      persistAbandonedPartial: async () => {
        if (failure === "partial persistence failed") {
          throw new Error("transcript unavailable");
        }
      },
      environments: {
        ...unusedEnvironments(),
        get: () => attachedEnvironment(),
        stopTunnel: async () => {},
        destroy,
        acquireTurnCredential: async () => credential(),
        acknowledgeCredentialDelivery: async () => true,
        startTunnel: async () =>
          createWorkerTurnTunnel({
            reconcileWorkspace: reconcileUnchangedLocalWorkspace,
            launchTurn,
          }),
      },
    });
    await expect(
      provider.executeTurn(
        {
          sessionId: SESSION_ID,
          sessionKey: SESSION_KEY,
          agentId: "main",
          runId: "node-loss-unavailable",
        },
        turn("node-loss-unavailable"),
        vi.fn(),
      ),
    ).rejects.toBe(loss);
    expect(loss.canContinue).toBe(false);
    expect(waitForAdmissionNode).toHaveBeenCalledTimes(
      failure === "partial persistence failed" ? 0 : 1,
    );
    expect(launchTurn).toHaveBeenCalledOnce();
    expect(await placements.listPendingWorkspaceResultsAsync()).toHaveLength(1);
    expect(destroy).not.toHaveBeenCalled();
    if (failure === "retained workspace and no reconnect") {
      expect(placements.get(SESSION_ID)).toMatchObject({ state: "active" });
      expect(await placements.listPendingWorkspaceResultsAsync()).toMatchObject([
        { recoveryRequestedAtMs: expect.any(Number) },
      ]);
    }
  });
});
