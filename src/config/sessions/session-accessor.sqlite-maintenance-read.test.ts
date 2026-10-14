import path from "node:path";
import { expect, it } from "vitest";
import { runOpenClawAgentWriteTransaction } from "../../state/openclaw-agent-db.js";
import { withOpenClawTestState } from "../../test-utils/openclaw-test-state.js";
import { writeSessionEntry } from "./session-accessor.sqlite-entry-store.js";
import type { SqliteSessionReclamationPlan } from "./session-accessor.sqlite-lifecycle-types.js";
import { runSqliteSessionReclamation } from "./session-accessor.sqlite-reclamation-run.js";
import { resolveSessionReclamationDatabaseOptions } from "./session-accessor.sqlite-reclamation.js";
import { resolveMaintenanceConfigFromInput } from "./store-maintenance.js";

it.each(["durable", "warm durable", "direct active", "runtime"] as const)(
  "preserves %s capacity rows through prepared maintenance",
  async (protection) => {
    await withOpenClawTestState({ scenario: "minimal" }, async (state) => {
      const options = { agentId: "main", env: state.env };
      const keys = ["agent:main:capacity-protected-0", "agent:main:capacity-protected-1"] as const;
      const write = (indexes: Array<0 | 1>) =>
        runOpenClawAgentWriteTransaction((database) => {
          for (const index of indexes) {
            const key = keys[index];
            writeSessionEntry(database, key, {
              sessionId: `capacity-protected-${index}`,
              updatedAt: Date.now(),
              modelSelectionLocked: protection === "durable" || protection === "warm durable",
            });
          }
        }, options);
      write(protection === "warm durable" ? [0] : [0, 1]);
      const plan = {
        kind: "maintenance-plan",
        databaseOptions: resolveSessionReclamationDatabaseOptions(options),
        materializedPlans: [],
        input: {
          activeSessionKeys:
            protection === "direct active" ? keys.map((key) => key.toUpperCase()) : [],
          archiveDirectory: state.sessionsDir(),
          storePath: path.join(state.sessionsDir(), "sessions.json"),
          maintenance: resolveMaintenanceConfigFromInput({
            mode: "enforce",
            maxEntries: 1,
            pruneAfter: "1d",
          }),
          preservation: {
            providerKeys: protection === "runtime" ? [...keys] : [],
            workIdentities: [],
            lifecycleIdentities: [],
          },
        },
      } satisfies SqliteSessionReclamationPlan;
      if (protection === "warm durable") {
        await expect(runSqliteSessionReclamation({ plan })).resolves.toMatchObject({
          kind: "maintenance-plan",
          ageFact: { entryCount: 1 },
        });
        write([1]);
      }
      if (protection === "durable" || protection === "warm durable") {
        await expect(runSqliteSessionReclamation({ plan })).resolves.toMatchObject({
          kind: "maintenance-plan",
          value: { archived: 0, durableNoCandidates: true },
        });
      } else {
        if (protection === "direct active") {
          const result = await runSqliteSessionReclamation({ plan });
          expect(result).toMatchObject({
            kind: "maintenance-plan",
            value: { archived: 0 },
          });
          if (result.kind === "maintenance-plan") {
            expect(result.value.durableNoCandidates).not.toBe(true);
          }
          plan.input.activeSessionKeys = [];
        }
        const result = await runSqliteSessionReclamation({ plan });
        expect(result.kind).toBe("maintenance-plan");
        if (result.kind === "maintenance-plan") {
          expect(result.value.archived).toBe(protection === "runtime" ? 0 : 1);
          expect(result.value.durableNoCandidates).not.toBe(true);
        }
      }
    });
  },
);
