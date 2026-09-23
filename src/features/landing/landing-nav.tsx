"use client";

import { useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Menu, X } from "lucide-react";

const links = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#tournaments", label: "Your sport" },
  { href: "#features", label: "Why TournyHub" },
];

export function LandingNav() {
  const menu = useRef<HTMLDetailsElement>(null);
  const close = () => {
    if (menu.current) menu.current.open = false;
  };
  return (
    <header className="landing-nav">
      <div className="landing-container landing-nav-inner">
        <Link href="/" aria-label="TournyHub home" className="landing-brand">
          <Image src="/tournyhub_icon.svg" alt="" width={35} height={35} />
          <span>
            Tourny<span className="landing-brand-accent">Hub</span>
          </span>
        </Link>
        <nav aria-label="Main navigation" className="landing-desktop-links">
          {links.map((link) => (
            <a href={link.href} key={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
        <div className="landing-nav-actions">
          <Link className="landing-sign-in" href="/sign-in">
            Sign in
          </Link>
          <Link
            className="landing-button landing-button-small landing-nav-cta"
            href="/app/auctions/new"
          >
            Create an auction <ArrowUpRight aria-hidden />
          </Link>
          <details
            ref={menu}
            className="landing-mobile-menu"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                close();
                menu.current?.querySelector("summary")?.focus();
              }
            }}
          >
            <summary aria-label="Toggle navigation">
              <Menu className="menu-open-icon" aria-hidden />
              <X className="menu-close-icon" aria-hidden />
            </summary>
            <nav aria-label="Mobile navigation">
              {links.map((link) => (
                <a href={link.href} key={link.href} onClick={close}>
                  {link.label}
                  <ArrowUpRight aria-hidden />
                </a>
              ))}
              <Link href="/app/auctions/new" onClick={close}>
                Create an auction
                <ArrowUpRight aria-hidden />
              </Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
