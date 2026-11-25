'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Play, TrendingUp, Sparkles, CheckCircle2, ArrowRight, Video, Scissors, Volume2 } from 'lucide-react';

export default function VideoWorkPage() {
  const [activeTab, setActiveTab] = useState<'retention' | 'hook' | 'sound'>('retention');

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
        <div className="inline-block px-3 py-1 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-400 text-xs font-semibold uppercase tracking-wider">
          Case Study — High-Retention Video Editing
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
          Defeating the 0:30 Cliff: Retention-First Editing That Scales Channels
        </h1>
        <p className="text-zinc-400 text-base sm:text-lg max-w-3xl leading-relaxed">
          How we restructured TechPulse Media’s editing workflow, boosting average view duration from 3:12 to 7:45 and driving 1.2M organic impressions.
        </p>
      </div>

      {/* Interactive Retention Curve Breakdown */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-bold text-white">Interactive Retention Analysis (Before vs. Retention Edit)</h2>
          </div>
          <div className="flex items-center gap-1.5 bg-zinc-900 p-1 rounded-lg border border-zinc-800 text-xs">
            <button
              onClick={() => setActiveTab('retention')}
              className={`px-3 py-1 rounded font-medium transition ${
                activeTab === 'retention' ? 'bg-purple-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              0:30 Hook Pacing
            </button>
            <button
              onClick={() => setActiveTab('hook')}
              className={`px-3 py-1 rounded font-medium transition ${
                activeTab === 'hook' ? 'bg-purple-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Motion Graphics
            </button>
            <button
              onClick={() => setActiveTab('sound')}
              className={`px-3 py-1 rounded font-medium transition ${
                activeTab === 'sound' ? 'bg-purple-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Sound Design
            </button>
          </div>
        </div>

        {/* Dynamic Display Based on Tab */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div className="space-y-4">
            {activeTab === 'retention' && (
              <>
                <h3 className="text-base font-bold text-white">Eliminating Dead Air & Visual Stagnation</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Traditional editing cuts to static talking heads for 15+ seconds. Our rhythm cuts introduce a visual change every 3.2 seconds: camera punch-ins, B-roll overlays, kinetic text highlights, and animated graph callouts that keep dopamine levels high.
                </p>
                <div className="flex items-center gap-4 text-xs font-mono text-zinc-300">
                  <span className="text-emerald-400 font-bold">+58% Retention at 1:00</span>
                  <span className="text-purple-400 font-bold">120k Channel Subs</span>
                </div>
              </>
            )}
            {activeTab === 'hook' && (
              <>
                <h3 className="text-base font-bold text-white">First 5 Seconds: The Stakes & Payoff</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Instead of generic logo intros or "Hey guys welcome back", we immediately introduce the conflict and climax preview in the first 4 seconds with fast-cut sound design.
                </p>
                <div className="flex items-center gap-4 text-xs font-mono text-zinc-300">
                  <span className="text-emerald-400 font-bold">Swipe-away dropped to 14%</span>
                </div>
              </>
            )}
            {activeTab === 'sound' && (
              <>
                <h3 className="text-base font-bold text-white">3-Track Psychoacoustic Sound Design</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Layered ambient risers, sub-bass whooshes on camera transitions, and subtle keyboard click Foley to ground UI demos. The brain stays engaged even during complex technical explanations.
                </p>
                <div className="flex items-center gap-4 text-xs font-mono text-zinc-300">
                  <span className="text-emerald-400 font-bold">Zero Audio Distortion</span>
                </div>
              </>
            )}
          </div>

          <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/50 space-y-3">
            <div className="text-xs font-semibold text-zinc-400 uppercase">Retention Timeline Preview</div>
            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-xs text-zinc-400 mb-1">
                  <span>Standard Raw Cut</span>
                  <span className="text-rose-400">32% at 2:00</span>
                </div>
                <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                  <div className="bg-rose-500 h-full w-[32%]" />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-zinc-400 mb-1">
                  <span>Retention Master Sprint</span>
                  <span className="text-emerald-400 font-bold">68% at 2:00</span>
                </div>
                <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                  <div className="bg-gradient-to-r from-purple-500 to-emerald-400 h-full w-[68%]" />
                </div>
              </div>
            </div>
            <div className="text-[11px] text-zinc-400 pt-2 border-t border-zinc-800/80">
              TechPulse Media: 85k view baseline elevated to 240k views per upload.
            </div>
          </div>
        </div>
      </section>

      {/* Case Study Summary */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Case Study: TechPulse Media (120k YouTube Subs)</h2>
        <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-950/60 space-y-4">
          <p className="text-sm text-zinc-400 leading-relaxed">
            Devon Brooks was producing high-quality hardware reviews, but editing took him 25+ hours per video, and videos were getting stuck at 40k views. We took over full post-production: rough-cut assembly, B-roll sourcing, custom After Effects animation, and Premiere Pro multi-cam color grading.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
            <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
              <div className="text-xl font-bold text-purple-400 font-mono">+128%</div>
              <div className="text-xs text-zinc-400">Avg View Duration</div>
            </div>
            <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
              <div className="text-xl font-bold text-emerald-400 font-mono">48 Hours</div>
              <div className="text-xs text-zinc-400">Turnaround Per Cut</div>
            </div>
            <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
              <div className="text-xl font-bold text-blue-400 font-mono">1.2M</div>
              <div className="text-xs text-zinc-400">Organic Impressions</div>
            </div>
            <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
              <div className="text-xl font-bold text-amber-400 font-mono">100%</div>
              <div className="text-xs text-zinc-400">On-Time Delivery</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Box */}
      <div className="p-8 rounded-2xl border border-purple-500/30 bg-gradient-to-r from-purple-950/40 via-zinc-950 to-indigo-950/40 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div>
          <div className="text-xs font-mono text-purple-400 font-semibold uppercase tracking-wider mb-1">Custom Video Sprints</div>
          <h3 className="text-xl font-bold text-white">Want a retention-first video sprint?</h3>
          <p className="text-sm text-zinc-400 mt-1">Send a link to your raw footage or latest upload for a retention audit.</p>
        </div>
        <a
          href="/#inquire"
          className="inline-flex items-center gap-2 bg-white text-black font-bold px-6 py-3 rounded-xl hover:bg-zinc-200 transition flex-shrink-0"
        >
          <span>Request Sample Cut</span>
          <ArrowRight className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}
