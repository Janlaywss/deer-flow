"use client";

import {
  BarChart3Icon,
  DatabaseIcon,
  MessagesSquare,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAuth } from "@/core/auth/AuthProvider";
import { useI18n } from "@/core/i18n/hooks";
import { isStaticWebsiteOnly } from "@/core/static-mode";

export function WorkspaceNavChatList() {
  const { t } = useI18n();
  const { user } = useAuth();
  const pathname = usePathname();
  const showUserManagement =
    user?.system_role === "admin" && !isStaticWebsiteOnly();

  return (
    <SidebarGroup className="pt-1">
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton isActive={pathname === "/workspace/chats"} asChild>
            <Link className="text-muted-foreground" href="/workspace/chats">
              <MessagesSquare />
              <span>{t.sidebar.chats}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        {showUserManagement && (
          <>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={pathname.startsWith("/workspace/users")}
                asChild
              >
                <Link className="text-muted-foreground" href="/workspace/users">
                  <UsersIcon />
                  <span>{t.sidebar.userManagement}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={pathname.startsWith("/workspace/knowledge")}
                asChild
              >
                <Link
                  className="text-muted-foreground"
                  href="/workspace/knowledge"
                >
                  <DatabaseIcon />
                  <span>{t.sidebar.knowledgeBase}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </>
        )}
        <SidebarMenuItem>
          <SidebarMenuButton
            isActive={pathname.startsWith("/workspace/token-usage")}
            asChild
          >
            <Link
              className="text-muted-foreground"
              href="/workspace/token-usage"
            >
              <BarChart3Icon />
              <span>{t.sidebar.tokenUsage}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}
