'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Palette, Sliders, CheckCircle2, ArrowRight, ShieldCheck, Eye, Layers } from 'lucide-react';

export default function DesignWorkPage() {
  const [contrastMode, setContrastMode] = useState<'before' | 'after'>('after');

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
        <div className="inline-block px-3 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
          Case Study — Conversion UI/UX & Design Systems
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
          Figma Design Systems & Accessible Dashboards That Double Activation
        </h1>
        <p className="text-zinc-400 text-base sm:text-lg max-w-3xl leading-relaxed">
          How we audited FinEdge Wealth App and Lumina Wearables, untangling complex navigation and elevating WCAG contrast to 7:1 for seamless outdoor readability.
        </p>
      </div>

      {/* Interactive UI Contrast & Hierarchy Simulator */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-white">Interactive Contrast & Hierarchy Audit</h2>
          </div>
          <div className="flex items-center gap-1.5 bg-zinc-900 p-1 rounded-lg border border-zinc-800 text-xs">
            <button
              onClick={() => setContrastMode('before')}
              className={`px-3 py-1 rounded font-medium transition ${
                contrastMode === 'before' ? 'bg-rose-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Before Audit (2.1:1 Contrast)
            </button>
            <button
              onClick={() => setContrastMode('after')}
              className={`px-3 py-1 rounded font-medium transition ${
                contrastMode === 'after' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              After Sprint (7:1 WCAG AAA)
            </button>
          </div>
        </div>

        {/* Visual Component Comparison */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div className="space-y-4">
            <h3 className="text-base font-bold text-white">
              {contrastMode === 'before' ? 'The Low-Contrast Flaw' : 'The High-Contrast Production Solution'}
            </h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              {contrastMode === 'before'
                ? 'Dark grey text on dark navy backgrounds rendered critical asset balances nearly unreadable on mobile screens in sunlight. 14 ungrouped menu items triggered high cognitive load.'
                : 'Clean typography tokens with bold typographic scale, semantic color coding, grouped navigation tiers, and high-visibility data visualizations.'}
            </p>
            <div className="flex items-center gap-4 text-xs font-mono">
              <span className={contrastMode === 'before' ? 'text-rose-400' : 'text-emerald-400'}>
                Contrast Ratio: {contrastMode === 'before' ? '2.1:1 (Failing)' : '7.2:1 (WCAG AAA Passed)'}
              </span>
              <span className="text-zinc-400">Tokens: 64 component variants</span>
            </div>
          </div>

          <div
            className={`p-6 rounded-xl border transition duration-300 ${
              contrastMode === 'before'
                ? 'border-zinc-800 bg-[#0d1117] text-[#4b5563]'
                : 'border-emerald-500/40 bg-zinc-950 text-white shadow-xl shadow-emerald-500/5'
            }`}
          >
            <div className="flex justify-between items-center mb-4">
              <span className="text-xs font-mono uppercase tracking-wider">Portfolio Assets</span>
              <span
                className={`text-xs px-2 py-0.5 rounded font-mono ${
                  contrastMode === 'before' ? 'bg-zinc-800 text-zinc-600' : 'bg-emerald-500/20 text-emerald-400'
                }`}
              >
                +24.8% YTD
              </span>
            </div>
            <div className="text-2xl font-bold font-mono tracking-tight mb-2">
              $148,290.45
            </div>
            <p className={`text-xs mb-4 ${contrastMode === 'before' ? 'text-zinc-700' : 'text-zinc-400'}`}>
              Liquid reserves & high-yield treasury allocation
            </p>
            <button
              className={`w-full py-2.5 rounded-lg text-xs font-bold transition ${
                contrastMode === 'before'
                  ? 'bg-zinc-800 text-zinc-600'
                  : 'bg-emerald-500 text-black hover:bg-emerald-400'
              }`}
            >
              Deposit Capital
            </button>
          </div>
        </div>
      </section>

      {/* Case Study: FinEdge App */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Case Study: FinEdge Wealth Management</h2>
        <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-950/60 space-y-4">
          <p className="text-sm text-zinc-400 leading-relaxed">
            Sarah Jenkins’s fintech startup was seeing a 35% drop-off in user onboarding right after KYC verification. We audited their 48-screen Figma library, rebuilt their atomic design tokens, consolidated the dashboard navigation from 14 tabs into 4 primary views, and handed over ready-to-code Tailwind specs.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
            <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
              <div className="text-xl font-bold text-emerald-400 font-mono">+64%</div>
              <div className="text-xs text-zinc-400">Day-7 Activation</div>
            </div>
            <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
              <div className="text-xl font-bold text-blue-400 font-mono">10 Days</div>
              <div className="text-xs text-zinc-400">Figma to Spec Delivery</div>
            </div>
            <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
              <div className="text-xl font-bold text-purple-400 font-mono">100%</div>
              <div className="text-xs text-zinc-400">WCAG AAA Certified</div>
            </div>
            <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
              <div className="text-xl font-bold text-amber-400 font-mono">48 Screens</div>
              <div className="text-xs text-zinc-400">Component Kit Handed Over</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Box */}
      <div className="p-8 rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/40 via-zinc-950 to-teal-950/40 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div>
          <div className="text-xs font-mono text-emerald-400 font-semibold uppercase tracking-wider mb-1">Custom Design Sprints</div>
          <h3 className="text-xl font-bold text-white">Ready for a comprehensive UX audit?</h3>
          <p className="text-sm text-zinc-400 mt-1">Get an annotated Figma file uncovering your 5 biggest conversion leaks.</p>
        </div>
        <a
          href="/#inquire"
          className="inline-flex items-center gap-2 bg-white text-black font-bold px-6 py-3 rounded-xl hover:bg-zinc-200 transition flex-shrink-0"
        >
          <span>Book UX Audit</span>
          <ArrowRight className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}
