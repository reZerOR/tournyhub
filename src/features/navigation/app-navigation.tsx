"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CircleHelp,
  LayoutDashboard,
  Plus,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

export interface AppSidebarUser {
  email?: string | null;
  image?: string | null;
  name?: string | null;
}

interface NavigationItem {
  exact?: boolean;
  href: string;
  icon: LucideIcon;
  label: string;
}

const primaryItems: NavigationItem[] = [
  {
    exact: true,
    href: "/app",
    icon: LayoutDashboard,
    label: "Dashboard",
  },
  {
    exact: true,
    href: "/app/auctions/new",
    icon: Plus,
    label: "Create Auction",
  },
];

const workspaceItems: NavigationItem[] = [
  {
    href: "/app/account",
    icon: UserRound,
    label: "Account",
  },
  {
    href: "/app/feedback",
    icon: CircleHelp,
    label: "Feedback",
  },
];

function isItemActive(pathname: string, item: NavigationItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length > 0) {
      return parts
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase();
    }
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return "U";
}

export function AppSidebar({
  administrator,
  user,
}: {
  administrator: boolean;
  user?: AppSidebarUser;
}) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  const allWorkspaceItems = administrator
    ? [
        ...workspaceItems,
        {
          href: "/app/admin",
          icon: ShieldCheck,
          label: "Administration",
        },
      ]
    : workspaceItems;

  const userLabel = user?.name || user?.email || "User";
  const userInitials = getInitials(user?.name, user?.email);

  return (
    <Sidebar
      className="app-shell-sidebar border-sidebar-border"
      collapsible="icon"
    >
      <SidebarHeader className="h-16 justify-center border-b border-sidebar-border px-3">
        <Link
          className="flex items-center gap-3 overflow-hidden rounded-lg px-1 py-1 text-sidebar-foreground outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          href="/app"
          onClick={() => setOpenMobile(false)}
        >
          <Image
            alt=""
            className="size-8 shrink-0"
            height={32}
            src="/tournyhub_icon.svg"
            width={32}
          />
          <div className="flex min-w-0 flex-1 items-center justify-between gap-2 group-data-[collapsible=icon]:hidden">
            <span className="font-heading text-lg font-semibold tracking-tight">
              Tourny<span className="text-neon">Hub</span>
            </span>
            <Badge
              className="border-sidebar-border text-sidebar-foreground/65"
              variant="outline"
            >
              Beta
            </Badge>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {primaryItems.map((item) => {
              const active = isItemActive(pathname, item);
              const Icon = item.icon;
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={active}
                    render={
                      <Link
                        href={item.href}
                        onClick={() => setOpenMobile(false)}
                      />
                    }
                    tooltip={item.label}
                  >
                    <Icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {allWorkspaceItems.map((item) => {
                const active = isItemActive(pathname, item);
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={active}
                      render={
                        <Link
                          href={item.href}
                          onClick={() => setOpenMobile(false)}
                        />
                      }
                      tooltip={item.label}
                    >
                      <Icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="h-12 data-[state=open]:bg-sidebar-accent"
              render={
                <Link
                  href="/app/account"
                  onClick={() => setOpenMobile(false)}
                />
              }
              size="lg"
              tooltip={userLabel}
            >
              <Avatar size="sm">
                {user?.image && <AvatarImage alt={userLabel} src={user.image} />}
                <AvatarFallback>{userInitials}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-medium">{userLabel}</span>
                {user?.email && user.email !== userLabel && (
                  <span className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </span>
                )}
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

export { AppSidebar as AppNavigation };
