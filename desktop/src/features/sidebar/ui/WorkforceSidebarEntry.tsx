import { invoke } from "@tauri-apps/api/core";
import { UsersRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { SidebarMenuButton, SidebarMenuItem } from "@/shared/ui/sidebar";
import { SidebarMenuLabel } from "@/shared/ui/sidebar-menu-label";

export function WorkforceSidebarEntry() {
  const [opening, setOpening] = useState(false);
  const open = async () => {
    if (opening) return;
    setOpening(true);
    try {
      await invoke("open_workforce_console");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setOpening(false);
    }
  };
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        data-testid="open-workforce-console"
        disabled={opening}
        onClick={open}
        tooltip="Workforce · 직원과 예약 관리"
        type="button"
      >
        <UsersRound className="h-4 w-4" aria-hidden="true" />
        <SidebarMenuLabel>
          {opening ? "연결 중…" : "Workforce"}
        </SidebarMenuLabel>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
