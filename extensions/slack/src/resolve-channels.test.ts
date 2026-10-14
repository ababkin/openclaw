// Slack tests cover resolve channels plugin behavior.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveSlackChannelAllowlist } from "./resolve-channels.js";

const slackClientMocks = vi.hoisted(() => ({
  conversationsList: vi.fn(),
  createSlackLookupClient: vi.fn(),
}));

vi.mock("./client.js", () => ({
  createSlackLookupClient: slackClientMocks.createSlackLookupClient,
}));

describe("resolveSlackChannelAllowlist", () => {
  beforeEach(() => {
    slackClientMocks.conversationsList.mockReset();
    slackClientMocks.createSlackLookupClient.mockReset().mockReturnValue({
      conversations: { list: slackClientMocks.conversationsList },
    });
  });

  it("returns stable channel ids without listing a workspace", async () => {
    const list = vi.fn();
    const res = await resolveSlackChannelAllowlist({
      token: "xoxb-test",
      entries: ["C01CU3R54A1", "channel:G0AFBKXS3CP", "<#C0AG61APJ3B|general>"],
      client: { conversations: { list } } as never,
    });

    expect(res.map((entry) => entry.id)).toEqual(["C01CU3R54A1", "G0AFBKXS3CP", "C0AG61APJ3B"]);
    expect(list).not.toHaveBeenCalled();
  });

  it("keeps folded letter-second ids as ids when a namesake channel exists", async () => {
    const client = {
      conversations: {
        list: vi.fn().mockResolvedValue({
          channels: [
            { id: "C0AG61APJ3B", name: "general", is_archived: false },
            { id: "C09876543", name: "ca1234567", is_archived: false },
          ],
        }),
      },
    };

    const res = await resolveSlackChannelAllowlist({
      token: "xoxb-test",
      entries: ["general", "ca1234567", "channel:ga1234567", "#ca1234567"],
      client: client as never,
    });

    expect(res.map((entry) => entry.id)).toEqual([
      "C0AG61APJ3B",
      "CA1234567",
      "GA1234567",
      "C09876543",
    ]);
  });

  it.each([
    { input: "team:T11111111:user:U01234567", resolved: false },
    { input: "team:T11111111:channel:%ZZ", resolved: false },
  ])(
    "keeps qualified target ordering and lookup boundaries for $input",
    async ({ input, resolved }) => {
      slackClientMocks.conversationsList.mockResolvedValue({ channels: [] });
      const first = "team:T22222222:channel:C01234567";
      const last = "team:T33333333:channel:C01234567";

      const result = await resolveSlackChannelAllowlist({
        token: "lookup-fixture",
        entries: [first, input, last],
      });

      expect(result).toEqual([
        { input: first, resolved: true, id: first },
        resolved
          ? { input, resolved: true, id: "team:T11111111:channel:C01234567" }
          : { input, resolved: false },
        { input: last, resolved: true, id: last },
      ]);
      expect(slackClientMocks.createSlackLookupClient).toHaveBeenCalledTimes(resolved ? 0 : 1);
      expect(slackClientMocks.conversationsList).toHaveBeenCalledTimes(resolved ? 0 : 1);
    },
  );
});
