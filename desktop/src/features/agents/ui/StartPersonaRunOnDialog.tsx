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
) => void;

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

  async function requestStart(next: AgentPersona) {
    const providers = providersQuery.isFetched
      ? providersQuery.data
      : (await providersQuery.refetch()).data;
    if (!providers || providers.length === 0) {
      startPersona(next, null);
      return;
    }
    setDraft(emptyWhereToRunDraft);
    setPersona(next);
  }

  return {
    requestStart,
    dialogProps: {
      draft,
      persona,
      onCancel: () => setPersona(null),
      onConfirm: (selected: AgentPersona, intent: BackendIntent | null) => {
        setPersona(null);
        startPersona(selected, intent);
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
