import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Zap, ArrowRight, Gauge, Cpu, Database, Server } from 'lucide-react';

export default function WebWorkPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 md:py-16 space-y-16">
      {/* Header */}
      <div className="space-y-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-white transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Overview
        </Link>
        <div className="inline-block px-3 py-1 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 text-xs font-semibold uppercase tracking-wider">
          Case Study — Full-Stack Web Development
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
          Sub-200ms Next.js 15 Architectures That Drive Real Revenue
        </h1>
        <p className="text-zinc-400 text-base sm:text-lg max-w-3xl leading-relaxed">
          How we re-architected Apex Cloud and Dr. Elena Rostova’s clinic platform, slashing Time to First Byte by 88% and lifting trial checkouts by 3.4x.
        </p>
      </div>

      {/* Interactive Performance Benchmark Widget */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 sm:p-8 space-y-6">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-2">
            <Gauge className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-bold text-white">Core Web Vitals Benchmark (Before vs. After Sprint)</h2>
          </div>
          <span className="text-xs font-mono text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
            Verified with Google PageSpeed
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-2">
            <div className="text-xs text-zinc-400 uppercase font-semibold">Time To First Byte (TTFB)</div>
            <div className="flex items-baseline gap-2">
              <span className="text-zinc-500 line-through text-lg font-mono">3,800ms</span>
              <span className="text-2xl font-bold text-emerald-400 font-mono">140ms</span>
            </div>
            <p className="text-xs text-zinc-400">Achieved via Neon connection pooling, edge caching, and server component rendering.</p>
          </div>

          <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-2">
            <div className="text-xs text-zinc-400 uppercase font-semibold">Lighthouse Performance</div>
            <div className="flex items-baseline gap-2">
              <span className="text-zinc-500 line-through text-lg font-mono">42 / 100</span>
              <span className="text-2xl font-bold text-emerald-400 font-mono">100 / 100</span>
            </div>
            <p className="text-xs text-zinc-400">Zero cumulative layout shift, minimal JS bundles, and responsive WebP image pipelines.</p>
          </div>

          <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-2">
            <div className="text-xs text-zinc-400 uppercase font-semibold">Trial-to-Paid Conversion</div>
            <div className="flex items-baseline gap-2">
              <span className="text-zinc-500 line-through text-lg font-mono">1.8%</span>
              <span className="text-2xl font-bold text-blue-400 font-mono">6.2%</span>
            </div>
            <p className="text-xs text-zinc-400">Streamlined 1-step checkout modal with Apple Pay / Stripe Elements integration.</p>
          </div>
        </div>
      </section>

      {/* Deep-Dive Case Study: Apex Cloud */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Case Study: Apex Cloud Systems (B2B SaaS)</h2>
        <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-950/60 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">The Bottleneck</h3>
              <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
                Apex Cloud launched their SaaS MVP on Reddit r/SaaS. Over 4,000 visitors hit the site, but trial signups were sub-2%. On iOS Safari, the pricing table modal broke completely and TTFB was over 3.2s due to unpooled client-side database calls.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">The Solution</h3>
              <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
                Within a 5-day sprint, we rebuilt the application on Next.js 15 App Router with Prisma and Neon connection pooling. Migrated API routes to streaming Server Actions, eliminating 450KB of client JavaScript.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-900 flex flex-wrap gap-2 text-xs font-mono text-zinc-400">
            <span className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800">Next.js 15 App Router</span>
            <span className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800">TypeScript 5.7</span>
            <span className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800">Prisma ORM</span>
            <span className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800">Neon Postgres</span>
            <span className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800">Tailwind CSS</span>
          </div>
        </div>
      </section>

      {/* CTA Box */}
      <div className="p-8 rounded-2xl border border-blue-500/30 bg-gradient-to-r from-blue-950/40 via-zinc-950 to-indigo-950/40 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div>
          <div className="text-xs font-mono text-blue-400 font-semibold uppercase tracking-wider mb-1">Custom Engineering Sprints</div>
          <h3 className="text-xl font-bold text-white">Need a high-performance web sprint?</h3>
          <p className="text-sm text-zinc-400 mt-1">We take on 2 engineering projects per month with deliverables tailored to your goals.</p>
        </div>
        <a
          href="/#inquire"
          className="inline-flex items-center gap-2 bg-white text-black font-bold px-6 py-3 rounded-xl hover:bg-zinc-200 transition flex-shrink-0"
        >
          <span>Claim Next Sprint Slot</span>
          <ArrowRight className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}
