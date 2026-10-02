/**
 * Start-on-existing-persona "Run on" selection (production seam).
 *
 * Starting an existing persona creates its first managed instance. Before this
 * pin, that path always mapped to a local instance, even when a
 * `buzz-backend-*` provider was installed — the only way to get a
 * provider-backed instance was the create dialog's Advanced "Run on" field.
 *
 * These tests mount the real `AgentsView`, click the persona card's real
 * Start badge, and observe the `create_managed_agent` IPC boundary:
 *
 *  - no discovered provider → no dialog, exactly one local create (today's
 *    behavior, byte-for-byte the same input shape);
 *  - provider discovered → a confirmation dialog reusing WhereToRunSection;
 *    choosing the provider and filling its required config creates the FIRST
 *    instance provider-backed (never a local create that is converted later);
 *  - submit is blocked until required provider config is filled;
 *  - keeping "This computer" yields the same local create;
 *  - Cancel creates nothing.
 *
 * Removing the dialog gate from AgentsView, or dropping the BackendIntent on
 * its way into `handleStartPersona` → `buildInstanceInputForDefinition`, turns
 * these RED.
 */

import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
  pretendToBeVisual: true,
});

const clients = [];
const ipcCalls = [];
const ipcHandlers = new Map();

let act;
let cleanup;
let fireEvent;
let render;
let renderHook;
let waitFor;
let createElement;
let QueryClient;
let QueryClientProvider;
let CommunitiesProvider;
let ThemeProvider;
let TooltipProvider;
let AgentsView;
let useStartPersonaRunOn;

const PERSONA_ID = "persona-scout";
const AGENT_PK = "e".repeat(64);

const PROVIDER = {
  id: "fixture-cloud",
  binaryPath: "/mock/buzz-backend-fixture-cloud",
};

const PROBE_RESULT = {
  ok: true,
  name: "fixture-cloud",
  version: "0.0.0-test",
  config_schema: {
    type: "object",
    properties: {
      region: {
        type: "string",
        title: "Region",
      },
      replicas: {
        type: "integer",
        title: "Replicas",
        default: 2,
      },
    },
    required: ["region"],
  },
};

function rawPersona(overrides = {}) {
  return {
    id: PERSONA_ID,
    display_name: "Scout",
    avatar_url: null,
    system_prompt: "Scout the codebase.",
    runtime: "goose",
    model: null,
    provider: null,
    name_pool: [],
    is_builtin: false,
    is_active: true,
    shared: false,
    source_team: null,
    env_vars: {},
    respond_to: null,
    respond_to_allowlist: [],
    parallelism: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function rawRuntime(id) {
  return {
    id,
    label: id,
    avatar_url: "",
    availability: "available",
    command: id,
    binary_path: `/usr/local/bin/${id}`,
    default_args: [],
    mcp_command: null,
    install_hint: "",
    install_instructions_url: "",
    can_auto_install: false,
    underlying_cli_path: null,
    node_required: false,
    auth_status: { status: "logged_in" },
    source: "builtin",
  };
}

function rawCreatedAgent(input) {
  return {
    pubkey: AGENT_PK,
    name: input.name,
    persona_id: input.personaId ?? null,
    runtime: "goose",
    relay_url: "wss://relay.example",
    acp_command: input.acpCommand ?? "buzz-acp",
    agent_command: input.agentCommand ?? "goose",
    agent_command_override: null,
    agent_args: [],
    mcp_command: input.mcpCommand ?? "",
    turn_timeout_seconds: 300,
    idle_timeout_seconds: null,
    max_turn_duration_seconds: null,
    parallelism: 1,
    system_prompt: input.systemPrompt ?? null,
    avatar_url: null,
    model: null,
    provider: null,
    persona_out_of_date: false,
    persona_orphaned: false,
    needs_restart: false,
    env_vars: {},
    status: input.backend?.type === "provider" ? "deployed" : "stopped",
    pid: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    last_started_at: null,
    last_stopped_at: null,
    last_exit_code: null,
    last_error: null,
    last_error_code: null,
    log_path: "/tmp/agent.log",
    start_on_app_launch: input.startOnAppLaunch ?? false,
    auto_restart_on_config_change: true,
    backend: input.backend ?? { type: "local" },
    backend_agent_id: null,
    respond_to: "mentions",
    respond_to_allowlist: [],
  };
}

// Commands AgentsView issues on mount that are irrelevant to this flow but
// must settle so the page renders without unhandled rejections.
const PASSIVE_DEFAULTS = {
  "plugin:event|listen": () => 1,
  "plugin:event|unlisten": () => null,
  get_global_agent_config: () => ({
    env_vars: {},
    provider: null,
    model: null,
    preferred_runtime: null,
  }),
  get_baked_build_env: () => [],
  get_baked_build_env_keys: () => [],
  get_runtime_file_config: () => null,
  agent_access_owner_only: () => false,
  get_identity: () => ({ pubkey: "f".repeat(64), npub: "npub1test" }),
  list_archived_identities: () => [],
  get_presence: () => ({}),
  get_users_batch: () => ({ profiles: {}, missing: [] }),
  get_user_profile: () => null,
  get_relay_agents: () => [],
  get_channels: () => [],
  list_teams: () => [],
  list_persona_catalog: () => [],
  list_team_catalog: () => [],
};

function installIpc({ providers }) {
  for (const [command, handler] of Object.entries(PASSIVE_DEFAULTS)) {
    ipcHandlers.set(command, handler);
  }
  ipcHandlers.set("list_personas", () => [rawPersona()]);
  ipcHandlers.set("list_managed_agents", () => []);
  ipcHandlers.set("discover_acp_providers", () => [rawRuntime("goose")]);
  ipcHandlers.set("discover_backend_providers", () => providers);
  ipcHandlers.set("probe_backend_provider", () => PROBE_RESULT);
  ipcHandlers.set("create_managed_agent", ({ input }) => ({
    agent: rawCreatedAgent(input),
    private_key_nsec: null,
    profile_sync_error: null,
    spawn_error: null,
  }));
}

function createCalls() {
  return ipcCalls.filter((call) => call.cmd === "create_managed_agent");
}

function renderAgentsView() {
  const client = new QueryClient({
    defaultOptions: {
      mutations: { gcTime: 0, retry: false },
      queries: { gcTime: 0, retry: false },
    },
  });
  clients.push(client);
  return render(
    createElement(
      ThemeProvider,
      { defaultTheme: "buzz" },
      createElement(
        QueryClientProvider,
        { client },
        createElement(
          CommunitiesProvider,
          null,
          createElement(TooltipProvider, null, createElement(AgentsView)),
        ),
      ),
    ),
  );
}

async function clickPersonaStart() {
  const start = await waitFor(() => {
    const node = dom.window.document.querySelector(
      `[data-testid="persona-runtime-start-${PERSONA_ID}"]`,
    );
    assert.ok(
      node,
      "persona card must offer Start for a persona without instances",
    );
    return node;
  });
  await act(async () => {
    fireEvent.click(start);
  });
}

function startDialog() {
  return dom.window.document.querySelector('[role="dialog"]');
}

async function selectRunOn(label) {
  const trigger = dom.window.document.getElementById("agent-run-on");
  assert.ok(trigger, "the Start dialog must render the shared Run on selector");
  await act(async () => {
    fireEvent.pointerDown(
      trigger,
      new dom.window.MouseEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    fireEvent.click(trigger);
  });
  const option = [
    ...dom.window.document.querySelectorAll('[role="menuitemradio"]'),
  ].find((node) => node.textContent?.trim() === label);
  assert.ok(option, `Run on option "${label}" must be offered`);
  await act(async () => {
    fireEvent.click(option);
  });
}

function dialogStartButton() {
  const dialog = startDialog();
  assert.ok(dialog, "Start dialog must be open");
  const button = [...dialog.querySelectorAll("button")].find(
    (node) => node.textContent?.trim() === "Start",
  );
  assert.ok(button, "Start dialog must render a Start button");
  return button;
}

before(async () => {
  Object.assign(globalThis, {
    document: dom.window.document,
    window: dom.window,
    localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  for (const key of Object.getOwnPropertyNames(dom.window)) {
    if (key === "window" || key === "document" || key === "globalThis")
      continue;
    const value = dom.window[key];
    if (
      typeof value === "function" &&
      /^(HTML|SVG)|Element$|Event$|EventTarget$|^Node|^Document|Observer$/.test(
        key,
      )
    ) {
      globalThis[key] = value;
    }
  }
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: dom.window.navigator,
    writable: true,
  });
  dom.window.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });
  globalThis.matchMedia = dom.window.matchMedia;
  dom.window.HTMLElement.prototype.hasPointerCapture = () => false;
  dom.window.HTMLElement.prototype.releasePointerCapture = () => {};
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  dom.window.ResizeObserver = globalThis.ResizeObserver;
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };
  dom.window.IntersectionObserver = globalThis.IntersectionObserver;
  dom.window.__TAURI_INTERNALS__ = {
    invoke: async (cmd, args) => {
      ipcCalls.push({ cmd, args });
      const handler = ipcHandlers.get(cmd);
      if (handler) return handler(args);
      throw new Error(`unmocked Tauri command: ${cmd}`);
    },
    transformCallback: () => Math.random(),
  };

  ({ act, cleanup, fireEvent, render, renderHook, waitFor } = await import(
    "@testing-library/react"
  ));
  ({ createElement } = await import("react"));
  ({ QueryClient, QueryClientProvider } = await import(
    "@tanstack/react-query"
  ));
  ({ CommunitiesProvider } = await import(
    "@/features/communities/useCommunities.tsx"
  ));
  ({ ThemeProvider } = await import("@/shared/theme/ThemeProvider"));
  ({ TooltipProvider } = await import("@/shared/ui/tooltip.tsx"));
  ({ AgentsView } = await import("./AgentsView.tsx"));
  ({ useStartPersonaRunOn } = await import("./StartPersonaRunOnDialog.tsx"));
});

afterEach(() => {
  cleanup?.();
  for (const client of clients.splice(0)) {
    client.cancelQueries();
    client.clear();
  }
  ipcHandlers.clear();
  ipcCalls.length = 0;
});

after(() => dom.window.close());

test("no discovered provider: Start creates one local instance with no dialog", async () => {
  installIpc({ providers: [] });
  await act(async () => {
    renderAgentsView();
  });

  await clickPersonaStart();

  await waitFor(() => assert.equal(createCalls().length, 1));
  assert.equal(
    startDialog(),
    null,
    "no Run on dialog when no backend provider is installed",
  );
  const { input } = createCalls()[0].args;
  assert.deepEqual(input.backend, { type: "local" });
  assert.equal(input.personaId, PERSONA_ID);
  assert.equal(input.agentCommand, "goose");
  assert.equal(input.acpCommand, "buzz-acp");
  assert.equal(input.spawnAfterCreate, true);
  assert.equal(input.startOnAppLaunch, true);
});

test("provider discovered: Start opens a Run on dialog defaulting to This computer", async () => {
  installIpc({ providers: [PROVIDER] });
  await act(async () => {
    renderAgentsView();
  });

  await clickPersonaStart();

  const dialog = await waitFor(() => {
    const node = startDialog();
    assert.ok(node, "Start must open the Run on dialog when a provider exists");
    return node;
  });
  assert.match(dialog.textContent ?? "", /Start Scout/);
  assert.equal(
    dom.window.document.getElementById("agent-run-on")?.textContent?.trim(),
    "This computer",
  );
  assert.equal(createCalls().length, 0, "opening the dialog creates nothing");
});

test("provider discovered: provider choice + required config creates the first instance provider-backed", async () => {
  installIpc({ providers: [PROVIDER] });
  await act(async () => {
    renderAgentsView();
  });
  await clickPersonaStart();
  await waitFor(() => assert.ok(startDialog()));

  await selectRunOn(PROVIDER.id);

  const region = await waitFor(() => {
    const node = dom.window.document.getElementById("provider-cfg-region");
    assert.ok(node, "probed provider config fields must render");
    return node;
  });
  assert.equal(
    dialogStartButton().disabled,
    true,
    "Start stays blocked until required provider config is filled",
  );
  await act(async () => {
    fireEvent.click(dialogStartButton());
  });
  assert.equal(createCalls().length, 0, "blocked submit must not create");

  await act(async () => {
    fireEvent.change(region, { target: { value: "eu-north" } });
  });
  assert.equal(dialogStartButton().disabled, false);
  await act(async () => {
    fireEvent.click(dialogStartButton());
  });

  await waitFor(() => assert.equal(createCalls().length, 1));
  const { input } = createCalls()[0].args;
  assert.deepEqual(input.backend, {
    type: "provider",
    id: PROVIDER.id,
    config: { region: "eu-north", replicas: 2 },
  });
  assert.equal(input.personaId, PERSONA_ID);
  assert.equal(input.startOnAppLaunch, false);
  assert.equal(input.spawnAfterCreate, true);
  assert.equal(
    input.agentCommand,
    undefined,
    "a provider-backed instance must not carry local spawn commands",
  );
  await waitFor(() => assert.equal(startDialog(), null));
});

test("provider discovered: confirming This computer creates the same local instance", async () => {
  installIpc({ providers: [PROVIDER] });
  await act(async () => {
    renderAgentsView();
  });
  await clickPersonaStart();
  await waitFor(() => assert.ok(startDialog()));

  await act(async () => {
    fireEvent.click(dialogStartButton());
  });

  await waitFor(() => assert.equal(createCalls().length, 1));
  const { input } = createCalls()[0].args;
  assert.deepEqual(input.backend, { type: "local" });
  assert.equal(input.agentCommand, "goose");
  assert.equal(input.startOnAppLaunch, true);
  assert.equal(
    ipcCalls.filter((call) => call.cmd === "probe_backend_provider").length,
    0,
    "a local start never probes a provider",
  );
});

test("provider discovered: Cancel creates nothing", async () => {
  installIpc({ providers: [PROVIDER] });
  await act(async () => {
    renderAgentsView();
  });
  await clickPersonaStart();
  await waitFor(() => assert.ok(startDialog()));
  await selectRunOn(PROVIDER.id);

  const cancel = [...startDialog().querySelectorAll("button")].find(
    (node) => node.textContent?.trim() === "Cancel",
  );
  assert.ok(cancel, "Start dialog must render Cancel");
  await act(async () => {
    fireEvent.click(cancel);
  });

  await waitFor(() => assert.equal(startDialog(), null));
  // Let any stray async start settle before asserting nothing happened.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  assert.equal(createCalls().length, 0, "Cancel must not create an instance");
});

// ── In-flight guard (the gate hook itself) ───────────────────────────────────
//
// Profile Start (UserProfilePanel) has no guard of its own, and its button is
// only disabled once the create mutation runs. requestStart awaits discovery
// first, so a double click while discovery is unsettled used to reach
// startPersona twice and create two local instances. These drive the real
// hook with a gated `discover_backend_providers`.

const SCOUT = { id: PERSONA_ID, displayName: "Scout" };

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderStartGate(startPersona) {
  const client = new QueryClient({
    defaultOptions: {
      mutations: { gcTime: 0, retry: false },
      queries: { gcTime: 0, retry: false },
    },
  });
  clients.push(client);
  const wrapper = ({ children }) =>
    createElement(QueryClientProvider, { client }, children);
  return renderHook(() => useStartPersonaRunOn(startPersona), { wrapper });
}

test("no provider: a double Start while discovery is pending starts once", async () => {
  installIpc({ providers: [] });
  const gate = deferred();
  ipcHandlers.set("discover_backend_providers", () => gate.promise);
  const calls = [];
  const { result } = renderStartGate(async (persona, intent) => {
    calls.push([persona.id, intent]);
  });

  let pending;
  await act(async () => {
    pending = [
      result.current.requestStart(SCOUT),
      result.current.requestStart(SCOUT),
    ];
  });
  assert.equal(calls.length, 0, "nothing starts before discovery settles");

  await act(async () => {
    gate.resolve([]);
    await Promise.all(pending);
  });
  assert.deepEqual(
    calls,
    [[PERSONA_ID, null]],
    "concurrent Starts must collapse to a single local start",
  );
  assert.equal(result.current.dialogProps.persona, null, "no dialog");
});

test("a Start while the previous start is still running is ignored, then released", async () => {
  installIpc({ providers: [] });
  const starts = [];
  const { result } = renderStartGate(() => {
    const start = deferred();
    starts.push(start);
    return start.promise;
  });

  let first;
  await act(async () => {
    first = result.current.requestStart(SCOUT);
  });
  await waitFor(() => assert.equal(starts.length, 1));

  await act(async () => {
    await result.current.requestStart(SCOUT);
  });
  assert.equal(starts.length, 1, "second Start during the start is ignored");

  await act(async () => {
    starts[0].resolve();
    await first;
  });
  let third;
  await act(async () => {
    third = result.current.requestStart(SCOUT);
  });
  await waitFor(() =>
    assert.equal(starts.length, 2, "the guard is released on completion"),
  );
  await act(async () => {
    starts[1].resolve();
    await third;
  });
});

test("a failed start releases the guard", async () => {
  installIpc({ providers: [] });
  let attempts = 0;
  const { result } = renderStartGate(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("create failed");
  });

  await act(async () => {
    await result.current.requestStart(SCOUT).catch(() => {});
  });
  await act(async () => {
    await result.current.requestStart(SCOUT);
  });
  assert.equal(attempts, 2, "Start works again after a failed start");
});

test("provider discovered: double Start opens one dialog, double confirm starts once, Cancel releases", async () => {
  installIpc({ providers: [PROVIDER] });
  const gate = deferred();
  ipcHandlers.set("discover_backend_providers", () => gate.promise);
  const calls = [];
  const { result } = renderStartGate(async (persona, intent) => {
    calls.push([persona.id, intent]);
  });

  let pending;
  await act(async () => {
    pending = [
      result.current.requestStart(SCOUT),
      result.current.requestStart(SCOUT),
    ];
  });
  await act(async () => {
    gate.resolve([PROVIDER]);
    await Promise.all(pending);
  });
  assert.equal(result.current.dialogProps.persona?.id, PERSONA_ID);
  assert.equal(calls.length, 0, "opening the dialog starts nothing");

  const { onConfirm } = result.current.dialogProps;
  await act(async () => {
    onConfirm(SCOUT, null);
    onConfirm(SCOUT, null);
  });
  assert.deepEqual(calls, [[PERSONA_ID, null]], "double confirm starts once");
  assert.equal(result.current.dialogProps.persona, null);

  await act(async () => {
    await result.current.requestStart(SCOUT);
  });
  assert.equal(result.current.dialogProps.persona?.id, PERSONA_ID);
  await act(async () => {
    result.current.dialogProps.onCancel();
  });
  assert.equal(result.current.dialogProps.persona, null);
  await act(async () => {
    await result.current.requestStart(SCOUT);
  });
  assert.equal(
    result.current.dialogProps.persona?.id,
    PERSONA_ID,
    "Start reopens the dialog after Cancel",
  );
  assert.equal(calls.length, 1, "Cancel starts nothing");
});
