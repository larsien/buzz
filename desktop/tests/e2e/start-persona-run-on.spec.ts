/**
 * E2E spec for "Start" on an existing agent definition offering "Run on".
 *
 * Starting a persona creates its first managed instance. With a
 * `buzz-backend-*` provider installed, both persona Start entry points (the
 * Agents card badge and the persona profile panel's "Start agent") must ask
 * where to run before creating anything, and the first instance must be
 * created on the chosen backend. With no provider, Start must keep today's
 * immediate local start with no dialog.
 *
 * The create input itself is pinned at the IPC boundary in
 * `src/features/agents/ui/startPersonaRunOn.test.mjs`; this spec covers the
 * profile-panel wiring and reads the persisted backend back from the mock
 * bridge.
 */
import { expect, test } from "@playwright/test";

import { installMockBridge } from "../helpers/bridge";

type Page = import("@playwright/test").Page;

const PERSONA = {
  id: "run-on-persona",
  displayName: "Courier",
  isActive: true,
  systemPrompt: "Deliver things.",
};

const PROVIDER = {
  id: "fixture-cloud",
  binaryPath: "/mock/buzz-backend-fixture-cloud",
};

const PROBE_RESULT = {
  ok: true,
  name: "fixture-cloud",
  version: "0.0.0-mock",
  config_schema: {
    type: "object",
    properties: {
      region: { type: "string", title: "Region" },
    },
    required: ["region"],
  },
};

type MockBackend =
  | { type: "local" }
  | { type: "provider"; id: string; config: Record<string, unknown> };

async function createdBackends(page: Page): Promise<MockBackend[]> {
  return page.evaluate(async (personaId) => {
    const invoke = (
      window as Window & {
        __BUZZ_E2E_INVOKE_MOCK_COMMAND__?: (
          command: string,
        ) => Promise<Array<{ persona_id: string | null; backend: unknown }>>;
      }
    ).__BUZZ_E2E_INVOKE_MOCK_COMMAND__;
    if (!invoke) throw new Error("Mock bridge is not installed.");
    const agents = await invoke("list_managed_agents");
    return agents
      .filter((agent) => agent.persona_id === personaId)
      .map((agent) => agent.backend as MockBackend);
  }, PERSONA.id);
}

async function openPersonaProfile(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("open-agents-view").click();
  await page.getByTestId(`persona-agent-row-${PERSONA.id}`).click();
  await expect(page.getByTestId("user-profile-start-agent")).toBeVisible({
    timeout: 10_000,
  });
}

test("profile Start without a backend provider starts locally with no dialog", async ({
  page,
}) => {
  await installMockBridge(page, { personas: [PERSONA], backendProviders: [] });
  await openPersonaProfile(page);

  await page.getByTestId("user-profile-start-agent").click();

  await expect.poll(() => createdBackends(page)).toEqual([{ type: "local" }]);
  await expect(page.getByRole("dialog", { name: /Start Courier/ })).toHaveCount(
    0,
  );
});

test("profile Start with a provider creates the first instance on that provider", async ({
  page,
}) => {
  await installMockBridge(page, {
    personas: [PERSONA],
    backendProviders: [PROVIDER],
    backendProviderProbeResult: PROBE_RESULT,
  });
  await openPersonaProfile(page);

  await page.getByTestId("user-profile-start-agent").click();
  const dialog = page.getByRole("dialog", { name: "Start Courier" });
  await expect(dialog).toBeVisible();
  const runOn = dialog.locator("#agent-run-on");
  await expect(runOn).toHaveText("This computer");

  await runOn.press("Enter");
  await page
    .getByRole("menuitemradio", { exact: true, name: PROVIDER.id })
    .press("Enter");
  const region = dialog.locator("#provider-cfg-region");
  await expect(region).toBeVisible({ timeout: 10_000 });
  const start = dialog.getByRole("button", { exact: true, name: "Start" });
  await expect(start).toBeDisabled();

  await region.fill("eu-north");
  await expect(start).toBeEnabled();
  await start.click();

  await expect(dialog).toHaveCount(0);
  await expect
    .poll(() => createdBackends(page))
    .toEqual([
      { type: "provider", id: PROVIDER.id, config: { region: "eu-north" } },
    ]);
});

test("Agents card Start with a provider: Cancel creates nothing", async ({
  page,
}) => {
  await installMockBridge(page, {
    personas: [PERSONA],
    backendProviders: [PROVIDER],
    backendProviderProbeResult: PROBE_RESULT,
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("open-agents-view").click();

  await page.getByTestId(`persona-runtime-start-${PERSONA.id}`).click();
  const dialog = page.getByRole("dialog", { name: "Start Courier" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { exact: true, name: "Cancel" }).click();

  await expect(dialog).toHaveCount(0);
  expect(await createdBackends(page)).toEqual([]);
});
