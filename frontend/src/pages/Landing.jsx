import { Suspense, lazy, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import Lenis from "lenis";
import { LogoMark } from "../components/icons";
import "../landing/landing.css";

// three.js ships in its own chunk so the wordmark paints immediately
const FolioBot = lazy(() => import("../landing/FolioBot"));

gsap.registerPlugin(ScrollTrigger, SplitText);

const TICKER = [
  { sym: "NVDA", dir: "▲", pct: "2.87%" },
  { sym: "AAPL", dir: "▲", pct: "1.24%" },
  { sym: "TSLA", dir: "▼", pct: "0.93%" },
  { sym: "MSFT", dir: "▲", pct: "0.66%" },
  { sym: "VOO", dir: "▲", pct: "0.41%" },
  { sym: "AMZN", dir: "▼", pct: "1.12%" },
  { sym: "GOOGL", dir: "▲", pct: "0.58%" },
  { sym: "✦", dir: "folio reads everything", pct: "✦" },
];

const METHOD = [
  {
    title: "plain-english entry",
    desc: "Describe holdings like you'd text a friend. The AI structures tickers, share counts and cost basis — you approve before anything is saved.",
  },
  {
    title: "a live ledger",
    desc: "Quotes, market value, unrealized P&L — typeset in tabular numerals and reconciled every time you look.",
  },
  {
    title: "ai outlooks",
    desc: "folio reads the news and SEC filings behind every position, then writes a plain-English three-to-five-day sentiment — with the receipts.",
  },
  {
    title: "honest by design",
    desc: "Sentiment analysis, never financial advice. Sources cited, risks listed, hype omitted.",
  },
];

const LEDGER_ROWS = [
  { sym: "NVDA", lot: "10 sh", at: "@ $180.00" },
  { sym: "VOO", lot: "5 sh", at: "@ $490.00" },
  { sym: "AAPL", lot: "12 sh", at: "@ $200.00" },
];

export default function Landing() {
  const [reduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const [booted, setBooted] = useState(reduced);

  const rootRef = useRef(null);
  const preloaderRef = useRef(null);
  const counterRef = useRef(null);
  const navRef = useRef(null);
  const heroRef = useRef(null);
  const heroWordRef = useRef(null);
  const botWrapRef = useRef(null);
  const marqueeTrackRef = useRef(null);
  const statementRef = useRef(null);
  const speakTextRef = useRef(null);
  const ctaBtnRef = useRef(null);
  const footerWordRef = useRef(null);
  const cursorRef = useRef(null);
  const lenisRef = useRef(null);

  // Demo build: no sign-in gate, the desk is always one click away.
  const ctaTo = "/dashboard";
  const ctaLabel = "open the demo";

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const finePointer = window.matchMedia("(pointer: fine)").matches;
    let lenis = null;
    let tickerFn = null;
    let cancelled = false;
    const splits = [];
    const removers = [];

    if (!reduced) {
      lenis = new Lenis({ duration: 1.15 });
      lenisRef.current = lenis;
      window.__lenis = lenis; // exposed for QA tooling
      lenis.on("scroll", ScrollTrigger.update);
      tickerFn = (time) => lenis.raf(time * 1000);
      gsap.ticker.add(tickerFn);
      gsap.ticker.lagSmoothing(0);
    }

    const ctx = gsap.context(() => {
      // ----- custom cursor -----
      if (finePointer && !reduced && cursorRef.current) {
        const cursor = cursorRef.current;
        gsap.set(cursor, { xPercent: -50, yPercent: -50 });
        const xTo = gsap.quickTo(cursor, "x", { duration: 0.18, ease: "power3" });
        const yTo = gsap.quickTo(cursor, "y", { duration: 0.18, ease: "power3" });
        let shown = false;
        const move = (e) => {
          if (!shown) {
            shown = true;
            gsap.to(cursor, { opacity: 1, duration: 0.3 });
          }
          xTo(e.clientX);
          yTo(e.clientY);
        };
        const over = (e) => {
          if (e.target.closest("a, button, .lp-row")) gsap.to(cursor, { scale: 2.8, duration: 0.3 });
        };
        const out = (e) => {
          if (e.target.closest("a, button, .lp-row")) gsap.to(cursor, { scale: 1, duration: 0.3 });
        };
        window.addEventListener("pointermove", move);
        root.addEventListener("mouseover", over);
        root.addEventListener("mouseout", out);
        removers.push(() => {
          window.removeEventListener("pointermove", move);
          root.removeEventListener("mouseover", over);
          root.removeEventListener("mouseout", out);
        });
      } else if (cursorRef.current) {
        cursorRef.current.style.display = "none";
      }
    }, root);

    document.fonts.ready.then(() => {
      if (cancelled) return;

      ctx.add(() => {
        // ----- hero wordmark -----
        const heroSplit = SplitText.create(heroWordRef.current, { type: "chars", mask: "chars" });
        splits.push(heroSplit);

        if (!reduced) {
          gsap.set(heroSplit.chars, { yPercent: 112 });
          gsap.set("[data-hero-fade]", { y: 26, autoAlpha: 0 });
          gsap.set(navRef.current, { y: -18, autoAlpha: 0 });

          const counter = { v: 0 };
          const intro = gsap.timeline();
          intro
            .to(counter, {
              v: 100,
              duration: 1.0,
              ease: "power2.inOut",
              onUpdate: () => {
                if (counterRef.current)
                  counterRef.current.textContent = String(Math.round(counter.v)).padStart(3, "0");
              },
            })
            .to(preloaderRef.current, {
              yPercent: -100,
              duration: 0.85,
              ease: "power4.inOut",
              onStart: () => setBooted(true),
            })
            .set(preloaderRef.current, { display: "none" })
            .to(
              heroSplit.chars,
              { yPercent: 0, duration: 1.05, ease: "power4.out", stagger: 0.05 },
              "-=0.55"
            )
            .to(navRef.current, { y: 0, autoAlpha: 1, duration: 0.7, ease: "power3.out" }, "-=0.7")
            .to(
              "[data-hero-fade]",
              { y: 0, autoAlpha: 1, duration: 0.8, ease: "power3.out", stagger: 0.1 },
              "-=0.6"
            )
            .add(() => {
              document.documentElement.dataset.lpReady = "1";
            });

          // hero parallax out
          gsap
            .timeline({
              scrollTrigger: { trigger: heroRef.current, start: "top top", end: "bottom top", scrub: true },
            })
            .to(heroWordRef.current, { yPercent: -16, scale: 0.97, autoAlpha: 0.18, ease: "none" }, 0)
            .to(botWrapRef.current, { y: "18vh", scale: 0.93, ease: "none" }, 0);
        } else {
          if (preloaderRef.current) preloaderRef.current.style.display = "none";
          document.documentElement.dataset.lpReady = "1";
        }

        // ----- marquee -----
        if (!reduced && marqueeTrackRef.current) {
          const marqueeTween = gsap.to(marqueeTrackRef.current, {
            xPercent: -50,
            duration: 26,
            ease: "none",
            repeat: -1,
          });
          ScrollTrigger.create({
            start: 0,
            end: "max",
            onUpdate: (self) => {
              const boost = gsap.utils.clamp(1, 4.5, 1 + Math.abs(self.getVelocity()) / 350);
              gsap.to(marqueeTween, {
                timeScale: boost,
                duration: 0.3,
                overwrite: true,
                onComplete: () => gsap.to(marqueeTween, { timeScale: 1, duration: 1.4 }),
              });
            },
          });
        }

        // ----- statement scrub reveal -----
        const stmtSplit = SplitText.create(statementRef.current, { type: "words" });
        splits.push(stmtSplit);
        if (!reduced) {
          gsap.fromTo(
            stmtSplit.words,
            { opacity: 0.1 },
            {
              opacity: 1,
              stagger: 0.045,
              ease: "none",
              scrollTrigger: {
                trigger: statementRef.current,
                start: "top 78%",
                end: "bottom 52%",
                scrub: true,
              },
            }
          );
        }

        // ----- vignette: typewriter + ledger rows -----
        const speakSplit = SplitText.create(speakTextRef.current, { type: "chars" });
        splits.push(speakSplit);
        if (!reduced) {
          gsap.fromTo(
            speakSplit.chars,
            { autoAlpha: 0 },
            {
              autoAlpha: 1,
              stagger: 0.012,
              ease: "none",
              scrollTrigger: { trigger: ".lp-vignette-grid", start: "top 72%", once: true },
            }
          );
          gsap.fromTo(
            ".lp-ledger-row, .lp-card-foot",
            { y: 14, autoAlpha: 0 },
            {
              y: 0,
              autoAlpha: 1,
              stagger: 0.14,
              duration: 0.6,
              ease: "power3.out",
              delay: 0.8,
              scrollTrigger: { trigger: ".lp-vignette-grid", start: "top 72%", once: true },
            }
          );
          gsap.to(".lp-card--speak", {
            y: -22,
            ease: "none",
            scrollTrigger: { trigger: ".lp-vignette-grid", start: "top bottom", end: "bottom top", scrub: 1 },
          });
          gsap.to(".lp-card--ledger", {
            y: 26,
            ease: "none",
            scrollTrigger: { trigger: ".lp-vignette-grid", start: "top bottom", end: "bottom top", scrub: 1 },
          });
        }

        // ----- generic rises -----
        if (!reduced) {
          gsap.utils.toArray("[data-rise]").forEach((el) => {
            gsap.fromTo(
              el,
              { y: 36, autoAlpha: 0 },
              {
                y: 0,
                autoAlpha: 1,
                duration: 0.9,
                ease: "power3.out",
                scrollTrigger: { trigger: el, start: "top 84%", once: true },
              }
            );
          });
          gsap.fromTo(
            ".lp-row",
            { y: 34, autoAlpha: 0 },
            {
              y: 0,
              autoAlpha: 1,
              duration: 0.8,
              ease: "power3.out",
              stagger: 0.09,
              scrollTrigger: { trigger: ".lp-rows", start: "top 80%", once: true },
            }
          );
        }

        // ----- stats counters -----
        gsap.utils.toArray(".lp-stat-num[data-count]").forEach((el) => {
          const target = parseFloat(el.dataset.count);
          const suffix = el.dataset.suffix || "";
          const render = (v) => {
            el.textContent = `${Math.round(v).toLocaleString("en-US")}${suffix}`;
          };
          if (reduced) {
            render(target);
            return;
          }
          const obj = { v: 0 };
          gsap.to(obj, {
            v: target,
            duration: 1.6,
            ease: "power3.out",
            onUpdate: () => render(obj.v),
            scrollTrigger: { trigger: el, start: "top 85%", once: true },
          });
        });

        // ----- footer word parallax -----
        gsap.set(footerWordRef.current, { yPercent: 34 });
        if (!reduced) {
          gsap.fromTo(
            footerWordRef.current,
            { yPercent: 58 },
            {
              yPercent: 34,
              ease: "none",
              scrollTrigger: {
                trigger: ".lp-footer",
                start: "top 90%",
                end: "bottom bottom",
                scrub: true,
              },
            }
          );
        }

        // ----- magnetic CTA -----
        if (finePointer && !reduced && ctaBtnRef.current) {
          const btn = ctaBtnRef.current;
          const strength = 0.28;
          const onMove = (e) => {
            const r = btn.getBoundingClientRect();
            gsap.to(btn, {
              x: (e.clientX - r.left - r.width / 2) * strength,
              y: (e.clientY - r.top - r.height / 2) * strength,
              duration: 0.4,
              ease: "power3.out",
            });
          };
          const onLeave = () => gsap.to(btn, { x: 0, y: 0, duration: 0.7, ease: "elastic.out(1, 0.4)" });
          btn.addEventListener("pointermove", onMove);
          btn.addEventListener("pointerleave", onLeave);
          removers.push(() => {
            btn.removeEventListener("pointermove", onMove);
            btn.removeEventListener("pointerleave", onLeave);
          });
        }

        ScrollTrigger.refresh();
      });
    });

    return () => {
      cancelled = true;
      removers.forEach((fn) => fn());
      ctx.revert();
      splits.forEach((s) => s.revert());
      if (lenis) {
        lenis.destroy();
        lenisRef.current = null;
        if (window.__lenis === lenis) delete window.__lenis;
      }
      if (tickerFn) gsap.ticker.remove(tickerFn);
      delete document.documentElement.dataset.lpReady;
    };
  }, [reduced]);

  const scrollTo = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return;
    if (lenisRef.current) lenisRef.current.scrollTo(el, { offset: 0 });
    else el.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
  };

  return (
    <div ref={rootRef} className="lp">
      <div ref={cursorRef} className="lp-cursor" aria-hidden="true" />

      {!reduced && (
        <div ref={preloaderRef} className="lp-preloader" aria-hidden="true">
          <LogoMark inverted className="h-16 w-16" />
          <span ref={counterRef} className="lp-preloader-count">
            000
          </span>
        </div>
      )}

      <header ref={navRef} className="lp-nav">
        <a href="/" className="lp-wordmark">
          folio
        </a>
        <nav className="lp-nav-links" aria-label="Landing navigation">
          <button type="button" className="lp-nav-link" onClick={() => scrollTo("#speak")}>
            product
          </button>
          <button type="button" className="lp-nav-link" onClick={() => scrollTo("#method")}>
            method
          </button>
          <Link to={ctaTo} className="lp-pill">
            {ctaLabel} <span aria-hidden="true">↗</span>
          </Link>
        </nav>
      </header>

      <main>
        {/* hero */}
        <section ref={heroRef} className="lp-hero">
          <p className="lp-hero-eyebrow microlabel" data-hero-fade>
            ai portfolio tracker — early access 2026
          </p>
          <h1 ref={heroWordRef} className="lp-hero-word">
            folio
          </h1>
          <div ref={botWrapRef} className="lp-hero-bot">
            <Suspense fallback={null}>
              <FolioBot active={booted} />
            </Suspense>
          </div>
          <div className="lp-hero-tagline" data-hero-fade>
            <p className="lp-tagline-main">
              Your portfolio
              <br />
              <span className="serif-accent">thinks for itself.</span>
            </p>
            <p className="microlabel" style={{ marginTop: "1.1rem" }}>
              plain english in — ledger out — ai reads the rest
            </p>
          </div>
          <div className="lp-hero-meta" data-hero-fade>
            <span className="microlabel">scroll</span>
            <span className="lp-scroll-line" />
          </div>
        </section>

        {/* ticker marquee */}
        <div className="lp-marquee" aria-hidden="true">
          <div ref={marqueeTrackRef} className="lp-marquee-track">
            {[0, 1].map((copy) => (
              <div key={copy} className="lp-marquee-seg">
                {TICKER.map((t, i) => {
                  const up = t.dir === "▲";
                  return (
                    <span key={`${copy}-${i}`} className={`lp-marquee-item${t.dir === "▼" ? " lp-down" : ""}`}>
                      <span>{t.sym}</span>
                      <span className={up ? "lp-quote-up" : ""}>{t.dir}</span>
                      <span className={`tnum${up ? " lp-quote-up" : ""}`}>{t.pct}</span>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* statement */}
        <section className="lp-statement">
          <p className="microlabel" style={{ marginBottom: "2.2rem" }} data-rise>
            — the point
          </p>
          <p ref={statementRef} className="lp-statement-text">
            Markets publish ten thousand headlines a day. folio reads all of them — every tick, every
            filing — and hands you the <span className="serif-accent">three sentences</span> that
            actually matter.
          </p>
        </section>

        {/* vignette: speak → ledger */}
        <section id="speak" className="lp-vignette">
          <div className="lp-section-head" data-rise>
            <h2 className="lp-h2">
              Type how <span className="serif-accent">you talk.</span>
            </h2>
            <p className="lp-section-note">
              folio files it like an accountant — tickers, lots, cost basis. You confirm. It
              remembers.
            </p>
          </div>
          <div className="lp-vignette-grid">
            <div className="lp-card lp-card--speak">
              <p className="microlabel">you said</p>
              <p ref={speakTextRef} className="lp-speak-text">
                I hold NVDA 10 shares at $180 avg and VOO 5 at $490. Also bought 12 Apple at 200.
                <span className="lp-caret" />
              </p>
            </div>
            <div className="lp-vignette-arrow" aria-hidden="true">
              →
            </div>
            <div className="lp-card lp-card--ledger">
              <p className="microlabel">folio filed</p>
              <div className="lp-ledger-rows">
                {LEDGER_ROWS.map((row) => (
                  <div key={row.sym} className="lp-ledger-row">
                    <span style={{ fontWeight: 600 }}>{row.sym}</span>
                    <span className="lp-leader" />
                    <span>{row.lot}</span>
                    <span style={{ opacity: 0.55 }}>{row.at}</span>
                  </div>
                ))}
              </div>
              <p className="lp-card-foot microlabel">3 positions · confirmed by you · parsed by ai</p>
            </div>
          </div>
        </section>

        {/* method rows */}
        <section id="method" className="lp-method">
          <div className="lp-section-head" data-rise>
            <h2 className="lp-h2">
              What folio <span className="serif-accent">does</span>
            </h2>
            <p className="lp-section-note">
              No dashboards full of widgets you'll never read. Four things, done with care.
            </p>
          </div>
          <div className="lp-rows">
            {METHOD.map((row, i) => (
              <div key={row.title} className="lp-row">
                <span className="lp-row-index">0{i + 1}</span>
                <h3 className="lp-row-title">{row.title}</h3>
                <p className="lp-row-desc">{row.desc}</p>
                <span className="lp-row-arrow" aria-hidden="true">
                  ↗
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* stats */}
        <section className="lp-stats">
          <div className="lp-stats-grid">
            <div data-rise>
              <div className="lp-stat-rule" />
              <span className="lp-stat-num tnum" data-count="10000" data-suffix="+">
                10,000+
              </span>
              <span className="lp-stat-label">headlines read per day</span>
            </div>
            <div data-rise>
              <div className="lp-stat-rule" />
              <span className="lp-stat-num tnum" data-count="120" data-suffix="ms">
                120ms
              </span>
              <span className="lp-stat-label">median quote refresh</span>
            </div>
            <div data-rise>
              <div className="lp-stat-rule" />
              <span className="lp-stat-num tnum">0</span>
              <span className="lp-stat-label">spreadsheets required</span>
            </div>
          </div>
        </section>

        {/* cta */}
        <section className="lp-cta">
          <p className="microlabel" style={{ marginBottom: "2rem" }} data-rise>
            early access
          </p>
          <h2 className="lp-cta-title" data-rise>
            be <span className="serif-accent">early</span>.
          </h2>
          <div data-rise>
            <Link ref={ctaBtnRef} to={ctaTo} className="lp-cta-btn">
              {ctaLabel} <span aria-hidden="true">↗</span>
            </Link>
            <p className="microlabel" style={{ marginTop: "1.6rem" }}>
              free while in beta — folio reads, you decide
            </p>
          </div>
        </section>
      </main>

      {/* footer */}
      <footer className="lp-footer">
        <div className="lp-footer-grid">
          <div className="lp-footer-brand">
            <LogoMark inverted className="h-9 w-9" />
            <p>
              folio is an AI portfolio tracker. It reads the market so you can read three sentences.
            </p>
          </div>
          <div className="lp-foot-col">
            <h4>product</h4>
            <ul>
              <li>
                <Link to={ctaTo}>open folio</Link>
              </li>
              <li>
                <button type="button" onClick={() => scrollTo("#speak")}>
                  product
                </button>
              </li>
              <li>
                <button type="button" onClick={() => scrollTo("#method")}>
                  method
                </button>
              </li>
            </ul>
          </div>
          <div className="lp-foot-col">
            <h4>elsewhere</h4>
            <ul>
              <li>
                <a href="https://github.com" target="_blank" rel="noreferrer">
                  github
                </a>
              </li>
              <li>
                <a href="https://x.com" target="_blank" rel="noreferrer">
                  x / twitter
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="lp-footer-legal">
          <span>© 2026 folio labs</span>
          <span>ai sentiment analysis — not financial advice</span>
        </div>
        <span ref={footerWordRef} className="lp-footer-word" aria-hidden="true">
          folio
        </span>
      </footer>
    </div>
  );
}
