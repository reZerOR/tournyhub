"use client";

import {
  CircleHelp,
  Gavel,
  LayoutDashboard,
  Menu,
  Plus,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "cn";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

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

const accountItems: NavigationItem[] = [
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

function NavigationLinks({
  administrator,
  onNavigate,
}: {
  administrator: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const workspaceItems = administrator
    ? [
        ...accountItems,
        {
          href: "/app/admin",
          icon: ShieldCheck,
          label: "Administration",
        },
      ]
    : accountItems;

  function renderItems(items: NavigationItem[]) {
    return items.map((item) => {
      const active = isItemActive(pathname, item);
      const Icon = item.icon;

      return (
        <Link
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            active &&
              "bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-sidebar-border",
          )}
          href={item.href}
          key={item.href}
          onClick={onNavigate}
        >
          <Icon aria-hidden className="size-5" strokeWidth={1.75} />
          {item.label}
        </Link>
      );
    });
  }

  return (
    <nav aria-label="Primary navigation" className="flex flex-col gap-7">
      <div className="flex flex-col gap-1">{renderItems(primaryItems)}</div>
      <div className="flex flex-col gap-2">
        <p className="px-3 text-xs font-medium tracking-wider text-sidebar-foreground/45 uppercase">
          Workspace
        </p>
        <div className="flex flex-col gap-1">{renderItems(workspaceItems)}</div>
      </div>
    </nav>
  );
}

export function AppNavigation({
  administrator,
  onNavigate,
}: {
  administrator: boolean;
  onNavigate?: () => void;
}) {
  return (
    <div className="relative flex h-full flex-col px-4 py-5">
      <Link
        className="mb-10 flex items-center gap-3 rounded-lg px-2 py-1 text-sidebar-foreground outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        href="/app"
        onClick={onNavigate}
      >
        <Image
          alt=""
          className="size-9"
          height={36}
          src="/tournyhub_icon.svg"
          width={36}
        />
        <span className="font-heading text-xl font-semibold tracking-tight">
          Tourny<span className="text-neon">Hub</span>
        </span>
        <Badge
          className="ml-auto border-sidebar-border text-sidebar-foreground/65"
          variant="outline"
        >
          Beta
        </Badge>
      </Link>

      <NavigationLinks administrator={administrator} onNavigate={onNavigate} />

      <div className="mt-auto border-t border-sidebar-border px-2 pt-6">
        <Gavel
          aria-hidden
          className="mb-4 size-8 text-neon"
          strokeWidth={1.5}
        />
        <p className="max-w-44 font-heading text-lg leading-tight font-semibold text-sidebar-foreground">
          Fair Auctions build great Teams.
        </p>
        <p className="mt-3 text-xs leading-relaxed text-sidebar-foreground/55">
          Run Auctions. Build Teams. Keep it fair.
        </p>
      </div>
    </div>
  );
}

export function MobileAppNavigation({
  administrator,
}: {
  administrator: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger
        render={
          <Button
            aria-label="Open navigation"
            size="icon"
            type="button"
            variant="ghost"
          />
        }
      >
        <Menu />
      </SheetTrigger>
      <SheetContent
        className="app-shell-sidebar w-[18rem] border-sidebar-border p-0 text-sidebar-foreground"
        side="left"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>TournyHub navigation</SheetTitle>
          <SheetDescription>
            Move between the Dashboard, account, and Auction tools.
          </SheetDescription>
        </SheetHeader>
        <AppNavigation
          administrator={administrator}
          onNavigate={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
