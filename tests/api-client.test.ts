import {
  battleContractHeader,
  battleContractVersion,
} from "../packages/contracts/battle-player";
import { expect, it } from "vitest";
import { createApi } from "../packages/api-client/index";
import apiFunction from "../services/functions/api";
import {
  playerContractHeader,
  playerContractVersion,
} from "../packages/contracts/player";

it("negotiates the required contract on every player route", async () => {
  const requests: Headers[] = [];
  const api = createApi(
    async (_input, init) => {
      requests.push(new Headers(init?.headers));
      return Response.json({});
    },
    async () => "token",
  );
  await api("/playthroughs");
  await api("/playthroughs?cursor=next");
  await api("/playthroughs/run/events");
  await api("/playthroughs/run/choices", { intent: true });
  await api("/catalogue");
  expect(
    requests
      .slice(0, 4)
      .every(
        (headers) =>
          headers.get(playerContractHeader) === playerContractVersion &&
          headers.get(battleContractHeader) === battleContractVersion,
      ),
  ).toBe(true);
  expect(requests[4].has(playerContractHeader)).toBe(false);
});

it.each([
  new Response(
    JSON.stringify({ errorType: "Error", errorMessage: "Startup failed" }),
    { status: 502 },
  ),
  new Response("<html>Bad gateway</html>", { status: 502 }),
  new Response("null", { status: 503 }),
])(
  "handles hosting failures without crashing while reading error.code",
  async (response) => {
    const api = createApi(
      async () => response,
      async () => null,
    );
    await expect(api("/catalogue")).rejects.toMatchObject({
      code: "UNAVAILABLE",
      message: "The story service is unavailable. Please try again shortly.",
    });
  },
);

it("preserves stale-save errors needed for recovery", async () => {
  const api = createApi(
    async () =>
      Response.json(
        {
          error: {
            code: "STALE_REVISION",
            message: "Reload current progress.",
          },
        },
        { status: 409 },
      ),
    async () => null,
  );
  await expect(api("/playthroughs/save/choices", {})).rejects.toMatchObject({
    code: "STALE_REVISION",
    message: "Reload current progress.",
  });
});

it("returns a readable configuration error before loading an unconfigured backend", async () => {
  const previous = process.env.STORYBRANCH_MODE;
  delete process.env.STORYBRANCH_MODE;
  try {
    const response = await apiFunction(
      new Request("https://storybranch.com/api/catalogue"),
    );
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("UNAVAILABLE");
  } finally {
    if (previous === undefined) delete process.env.STORYBRANCH_MODE;
    else process.env.STORYBRANCH_MODE = previous;
  }
});
