"use client";

import * as React from "react";
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { cn } from "cn";

type Appearance = "light" | "dark";

/*
  TournyHub wraps Sonner without next-themes — appearance is read from
  the `dark` class on <html>, which is set by the user-selected
  preference in RootLayout. Toast surface uses the same arena palette
  as AuctionPanel so feedback matches the rest of the interface.
*/
function useResolvedAppearance(): Appearance {
  const [appearance, setAppearance] = React.useState<Appearance>("dark");

  React.useEffect(() => {
    const root = document.documentElement;
    const update = () => {
      setAppearance(root.classList.contains("dark") ? "dark" : "light");
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return appearance;
}

const Toaster = ({ ...props }: ToasterProps) => {
  const appearance = useResolvedAppearance();

  return (
    <Sonner
      theme={appearance}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: cn(
            "arena-panel border",
            "group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground",
          ),
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
