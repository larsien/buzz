import * as React from "react";

import { useBackendProvidersQuery } from "@/features/agents/hooks";
import type { AgentPersona } from "@/shared/api/types";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";

import type { BackendIntent } from "../lib/instanceInputForDefinition";
import { WhereToRunSection } from "./WhereToRunSection";
import {
  canSubmitWhereToRun,
  emptyWhereToRunDraft,
  resolveBackendIntent,
  type WhereToRunDraft,
} from "./whereToRunIntent";

export type StartPersonaWithBackend = (
  persona: AgentPersona,
  backendIntent: BackendIntent | null,
) => Promise<void>;

/**
 * Gate for "Start" on an existing definition. With no `buzz-backend-*`
 * provider installed, Start calls through immediately with a null intent
 * (today's local start, no dialog). With at least one provider, Start opens
 * the shared "Run on" selector first so the FIRST instance is created on the
 * chosen backend — never created locally and converted afterwards.
 *
 * Discovery is refetch-aware like `availableRuntimesForStart`: an unsettled
 * query is fetched rather than read as "no providers", so an early click
 * cannot silently skip the selector. A failed discovery reads as none.
 *
 * One Start per persona at a time: a persona's slot is held from
 * `requestStart` until its start settles (success or error) or its dialog is
 * cancelled, so a double click while discovery or the start is pending
 * collapses to one start. Callers without their own guard (the profile panel)
 * rely on this.
 */
export function useStartPersonaRunOn(
  startPersona: StartPersonaWithBackend,
  options?: { enabled?: boolean },
) {
  const providersQuery = useBackendProvidersQuery({
    enabled: options?.enabled ?? true,
  });
  const [persona, setPersona] = React.useState<AgentPersona | null>(null);
  const [draft, setDraft] =
    React.useState<WhereToRunDraft>(emptyWhereToRunDraft);
  const inFlightRef = React.useRef(new Set<string>());
  const choosingIdRef = React.useRef<string | null>(null);

  async function runStart(next: AgentPersona, intent: BackendIntent | null) {
    try {
      await startPersona(next, intent);
    } finally {
      inFlightRef.current.delete(next.id);
    }
  }

  function closeChooser() {
    if (choosingIdRef.current !== null) {
      inFlightRef.current.delete(choosingIdRef.current);
      choosingIdRef.current = null;
    }
  }

  async function requestStart(next: AgentPersona) {
    if (inFlightRef.current.has(next.id)) return;
    inFlightRef.current.add(next.id);
    let providers: typeof providersQuery.data;
    try {
      providers = providersQuery.isFetched
        ? providersQuery.data
        : (await providersQuery.refetch()).data;
    } catch (error) {
      inFlightRef.current.delete(next.id);
      throw error;
    }
    if (!providers || providers.length === 0) {
      await runStart(next, null);
      return;
    }
    // The open dialog keeps the slot until Start or Cancel.
    closeChooser();
    choosingIdRef.current = next.id;
    setDraft(emptyWhereToRunDraft);
    setPersona(next);
  }

  return {
    requestStart,
    dialogProps: {
      draft,
      persona,
      onCancel: () => {
        closeChooser();
        setPersona(null);
      },
      onConfirm: (selected: AgentPersona, intent: BackendIntent | null) => {
        if (choosingIdRef.current !== selected.id) return;
        choosingIdRef.current = null;
        setPersona(null);
        // runStart releases the guard in `finally` and the caller's
        // startPersona surfaces its own errors; nothing awaits this promise,
        // so swallow the rethrow instead of leaving an unhandled rejection.
        void runStart(selected, intent).catch(() => {});
      },
      onDraftChange: setDraft,
    },
  };
}

export function StartPersonaRunOnDialog({
  draft,
  persona,
  onCancel,
  onConfirm,
  onDraftChange,
}: {
  draft: WhereToRunDraft;
  persona: AgentPersona | null;
  onCancel: () => void;
  onConfirm: (persona: AgentPersona, intent: BackendIntent | null) => void;
  onDraftChange: (next: WhereToRunDraft) => void;
}) {
  const canSubmit = persona !== null && canSubmitWhereToRun(draft);

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      open={persona !== null}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Start {persona?.displayName ?? "agent"}</DialogTitle>
          <DialogDescription>Choose where this agent runs.</DialogDescription>
        </DialogHeader>
        <WhereToRunSection
          draft={draft}
          isPending={false}
          onDraftChange={onDraftChange}
        />
        <DialogFooter>
          <Button onClick={onCancel} type="button" variant="outline">
            Cancel
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() => {
              if (persona && canSubmit) {
                onConfirm(persona, resolveBackendIntent(draft));
              }
            }}
            type="button"
          >
            Start
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
