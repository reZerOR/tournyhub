import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Barlow_Condensed } from "next/font/google";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock3,
  Gavel,
  Layers3,
  Users,
} from "lucide-react";
import { LandingNav } from "@/features/landing/landing-nav";

const display = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-landing-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TournyHub | Host the game. Run the auction.",
  description:
    "Your sport. Your rules. Bring your players together, run a live auction, and build the teams for your next tournament with TournyHub.",
};

const steps = [
  {
    title: "Bring your players.",
    text: "Add players by hand or import a CSV or Excel file. Set player tiers and starting prices to suit your game.",
  },
  {
    title: "Set your teams and rules.",
    text: "Create your teams, invite their representatives, and choose equal budgets, roster sizes, and player limits.",
  },
  {
    title: "Let the bidding begin.",
    text: "Run the auction live. Representatives bid for players while you control the pace with manual or timed closing.",
  },
  {
    title: "Take your teams to the game.",
    text: "Everyone leaves with a roster. Copy a team list or download the results as a colored spreadsheet or a shareable PDF.",
  },
];
const features = [
  {
    icon: Users,
    title: "Same budget. Your strategy.",
    text: "Every team starts with equal Credits. Each bid is checked against the budget and roster rules.",
  },
  {
    icon: Layers3,
    title: "A place for every player.",
    text: "Use Simple Rules or set up player tiers with shared minimums and maximums for every team.",
  },
  {
    icon: Clock3,
    title: "You set the pace.",
    text: "Close bidding yourself or use a timer. Pause the auction when you need time to make a change.",
  },
  {
    icon: Gavel,
    title: "Every result, accounted for.",
    text: "Keep track of sales, final rosters, and remaining Credits. Share each team's results when the auction is done.",
  },
];

export default function Home() {
  return (
    <div className={`${display.variable} landing-page`}>
      <a href="#main-content" className="landing-skip-link">
        Skip to content
      </a>
      <LandingNav />
      <main id="main-content">
        <section className="landing-hero" aria-labelledby="hero-title">
          <Image
            src="/landing/stadium-hero.webp"
            alt="A football player facing a floodlit pitch before the game"
            fill
            loading="eager"
            fetchPriority="high"
            sizes="100vw"
            className="landing-hero-image"
          />
          <div className="landing-hero-scrim" aria-hidden />
          <div className="landing-container landing-hero-content">
            <p className="landing-hero-label">Good teams start here.</p>
            <h1 id="hero-title" className="landing-display landing-hero-title">
              <span>HOST THE GAME.</span>
              <span>RUN THE AUCTION.</span>
            </h1>
            <p className="landing-hero-description">
              Bring your players. Set your rules. Build your teams through a
              live auction made for your next tournament.
            </p>
            <div className="landing-hero-actions">
              <Link href="/app/auctions/new" className="landing-button">
                Create an auction <ArrowUpRight aria-hidden />
              </Link>
              <a href="#how-it-works" className="landing-text-link">
                See how it works <ArrowDown aria-hidden />
              </a>
            </div>
          </div>
        </section>

        <section
          className="landing-sports landing-container"
          id="tournaments"
          aria-labelledby="sports-title"
        >
          <div className="landing-sports-intro">
            <h2 id="sports-title" className="landing-display">
              YOUR SPORT.
              <br />
              <span>YOUR RULES.</span>
            </h2>
            <p>
              From the campus ground to your weekend league, great competition
              starts with the teams you build.
            </p>
          </div>
          <div
            className="landing-sport-list"
            aria-label="Games you can organize player auctions for"
          >
            {["Cricket", "Football", "Basketball", "Esports", "Your game"].map(
              (sport) => (
                <span key={sport}>{sport}</span>
              ),
            )}
          </div>
        </section>

        <section
          className="landing-journey landing-container"
          id="how-it-works"
          aria-labelledby="journey-title"
        >
          <div className="landing-team-photo">
            <Image
              src="/landing/team-huddle.webp"
              alt="Cricket teammates in blue jerseys gathering in a pre-match huddle"
              fill
              sizes="(max-width: 767px) 100vw, 48vw"
            />
            <div className="landing-photo-caption">
              <span>It starts with your people.</span>
              <ArrowUpRight aria-hidden />
            </div>
          </div>
          <div className="landing-journey-content">
            <h2 id="journey-title" className="landing-display">
              FROM IDEA
              <br />
              <span>TO TOURNAMENT.</span>
            </h2>
            <p className="landing-section-description">
              You bring the competition. We help you put the teams together.
            </p>
            <div className="landing-steps">
              {steps.map((step, index) => (
                <details
                  key={step.title}
                  open={index === 0}
                  className="landing-step"
                >
                  <summary>
                    <span className="landing-step-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <h3>{step.title}</h3>
                    <ChevronDown aria-hidden />
                  </summary>
                  <p>{step.text}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section
          className="landing-features"
          id="features"
          aria-labelledby="features-title"
        >
          <div className="landing-container">
            <div className="landing-features-heading">
              <p className="landing-section-label">Built for auction day</p>
              <h2 id="features-title" className="landing-display">
                EVERY BID
                <br />
                <span>CHANGES THE GAME.</span>
              </h2>
              <p className="landing-section-description">
                The excitement of building a team. The confidence of rules that
                apply to everyone.
              </p>
            </div>
            <div className="landing-feature-grid">
              {features.map(({ icon: Icon, title, text }) => (
                <article key={title} className="landing-feature">
                  <Icon
                    className="landing-feature-icon"
                    aria-hidden
                    strokeWidth={1.5}
                  />
                  <div>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          className="landing-container landing-start-section"
          aria-labelledby="start-title"
        >
          <div className="landing-start">
            <h2 id="start-title" className="landing-display">
              BUILD YOUR
              <br />
              OWN LEAGUE.
            </h2>
            <div className="landing-start-content">
              <p>
                Your next tournament starts with the people you bring together.
                Give them an auction worth showing up for.
              </p>
              <Link
                href="/app/auctions/new"
                className="landing-button landing-button-dark"
              >
                Create an auction <ArrowUpRight aria-hidden />
              </Link>
              <span className="landing-start-note">
                <Check aria-hidden /> Free for personal, non-commercial events.
              </span>
            </div>
          </div>
        </section>

        <section
          className="landing-container landing-questions"
          aria-labelledby="questions-title"
        >
          <h2 id="questions-title">Before the first bid.</h2>
          <div>
            <details>
              <summary>
                What can I organize with TournyHub?
                <ChevronDown aria-hidden />
              </summary>
              <p>
                TournyHub runs live player auctions for your sport or game. You
                set up players, teams, and rules, then export the rosters. Match
                schedules, scores, and tournament standings are managed
                separately.
              </p>
            </details>
            <details>
              <summary>
                Do all my players need an account?
                <ChevronDown aria-hidden />
              </summary>
              <p>
                No. Only the Organizer and Team Representatives need to sign in.
                You can add players to the auction without asking them to create
                an account.
              </p>
            </details>
            <details>
              <summary>
                Are bids made with real money?
                <ChevronDown aria-hidden />
              </summary>
              <p>
                No. Teams bid with virtual Credits that have no cash value. Each
                team starts with the same budget.
              </p>
            </details>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-container">
          <p className="landing-display landing-footer-manifesto">
            YOUR TOURNAMENT.
            <br className="landing-footer-break" /> YOUR TEAMS.
            <br className="landing-footer-break" /> <span>YOUR AUCTION.</span>
          </p>
          <div className="landing-footer-bottom">
            <Link
              href="/"
              className="landing-brand"
              aria-label="TournyHub home"
            >
              <Image src="/tournyhub_icon.svg" alt="" width={29} height={29} />
              <span>TournyHub</span>
            </Link>
            <p>Built for the love of the game.</p>
            <a href="#hero-title" className="landing-back-top">
              Back to top <ArrowRight aria-hidden />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
