'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Shield,
  Search,
  Copy,
  ExternalLink,
  MessageSquare,
  TrendingUp,
  Flame,
  Radio,
  LogOut,
  RefreshCw,
  Check,
  ChevronRight,
  X,
  Plus,
  Trash2,
  Sliders,
  Send,
  Sparkles,
  Ban,
  Clock,
  Play,
  Pause,
  Mail,
  PhoneCall,
  Globe,
  Loader2,
} from 'lucide-react';

interface MessageThread {
  id: string;
  direction: string;
  content: string;
  sentiment: string | null;
  portfolioClicks: number;
  createdAt: string;
}

interface Lead {
  id: string;
  name: string;
  platform: string;
  contactEmailOrHandle: string;
  sourceUrl: string | null;
  auditSummary: string | null;
  matchedService: string;
  fitScore: number;
  winProbability: number;
  status: string;
  messageIdHeader: string | null;
  nextFollowUpAt: string | null;
  draftReply?: string | null;
  draftStatus?: string | null;
  telegramMessageId?: number | null;
  createdAt: string;
  updatedAt: string;
  messageThreads: MessageThread[];
}

interface Campaign {
  id: string;
  platform: string;
  keywords: string;
  active: boolean;
}

function AdminDashboardContent() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [emailFilter, setEmailFilter] = useState<'all' | 'sent' | 'not_sent' | 'social'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeLeadThread, setActiveLeadThread] = useState<Lead | null>(null);
  const [editableDraft, setEditableDraft] = useState('');
  const [sendingDraft, setSendingDraft] = useState(false);
  const [regeneratingDraft, setRegeneratingDraft] = useState(false);
  const [actionNotice, setActionNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isPipelineActive, setIsPipelineActive] = useState<boolean>(false);
  const [togglingEngine, setTogglingEngine] = useState<boolean>(false);
  const [newCampPlatform, setNewCampPlatform] = useState<string>('reddit');
  const [newCampKeywords, setNewCampKeywords] = useState<string>('');
  const [isAddingCampaign, setIsAddingCampaign] = useState<boolean>(false);
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const leadIdQuery = searchParams.get('leadId');

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [leadsRes, campaignsRes, engineRes] = await Promise.all([
        fetch(`/api/admin/leads?platform=${selectedPlatform}&search=${encodeURIComponent(searchQuery)}`),
        fetch('/api/admin/campaigns'),
        fetch('/api/admin/engine-toggle'),
      ]);

      if (leadsRes.status === 401 || campaignsRes.status === 401 || engineRes.status === 401) {
        router.push('/admin/login');
        return;
      }

      const leadsData = await leadsRes.json();
      const campaignsData = await campaignsRes.json();
      const engineData = await engineRes.json();

      if (typeof engineData?.pipelineActive === 'boolean') {
        setIsPipelineActive(engineData.pipelineActive);
      } else if (typeof engineData?.isPaused === 'boolean') {
        setIsPipelineActive(!engineData.isPaused);
      }

      if (leadsData.leads) {
        setLeads(leadsData.leads);
        // Auto-open drawer if leadId query param is present
        if (leadIdQuery) {
          const matched = leadsData.leads.find((l: Lead) => l.id === leadIdQuery);
          if (matched) {
            setActiveLeadThread(matched);
            setEditableDraft(matched.draftReply || '');
          }
        }
      }
      if (campaignsData.campaigns) setCampaigns(campaignsData.campaigns);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [selectedPlatform]);

  useEffect(() => {
    if (leadIdQuery && leads.length > 0) {
      const matched = leads.find((l) => l.id === leadIdQuery);
      if (matched) {
        setActiveLeadThread(matched);
        setEditableDraft(matched.draftReply || '');
      }
    }
  }, [leadIdQuery, leads]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchDashboardData();
  };

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.push('/admin/login');
  };

  const toggleCampaign = async (campaign: Campaign) => {
    try {
      const res = await fetch('/api/admin/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: campaign.id,
          active: !campaign.active,
        }),
      });
      if (res.ok) {
        setCampaigns((prev) =>
          prev.map((c) => (c.id === campaign.id ? { ...c, active: !c.active } : c))
        );
      }
    } catch (e) {
      console.error('Toggle campaign error:', e);
    }
  };

  const handleAddCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampKeywords.trim()) return;
    setIsAddingCampaign(true);
    try {
      const res = await fetch('/api/admin/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: newCampPlatform,
          keywords: newCampKeywords.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.campaign) {
        setCampaigns((prev) => [data.campaign, ...prev]);
        setNewCampKeywords('');
        setActionNotice({ text: 'New discovery campaign added!', type: 'success' });
      } else {
        setActionNotice({ text: data.error || 'Failed to add campaign.', type: 'error' });
      }
    } catch {
      setActionNotice({ text: 'Failed to add campaign.', type: 'error' });
    } finally {
      setIsAddingCampaign(false);
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/campaigns?id=${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setCampaigns((prev) => prev.filter((c) => c.id !== id));
        setActionNotice({ text: 'Campaign removed.', type: 'success' });
      } else {
        setActionNotice({ text: 'Failed to delete campaign.', type: 'error' });
      }
    } catch {
      setActionNotice({ text: 'Failed to delete campaign.', type: 'error' });
    }
  };

  const toggleEngine = async () => {
    setTogglingEngine(true);
    try {
      const nextActive = !isPipelineActive;
      const res = await fetch('/api/admin/engine-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: nextActive }),
      });
      const data = await res.json();
      if (res.ok) {
        setIsPipelineActive(data.pipelineActive);
        setActionNotice({
          text: data.pipelineActive
            ? 'Scraping & Outreach Engine STARTED! Autonomous 24/7 lead-gen and outreach active.'
            : 'Scraping & Outreach Engine STOPPED. Cold email outreach halted (24/7 reply listener remains active).',
          type: 'success',
        });
      } else {
        setActionNotice({ text: data.error || 'Failed to toggle outreach engine.', type: 'error' });
      }
    } catch {
      setActionNotice({ text: 'Network error updating outreach engine status.', type: 'error' });
    } finally {
      setTogglingEngine(false);
    }
  };

  const copyPitch = (lead: Lead) => {
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : 'https://mevin-portfolio.vercel.app')).replace(/\/+$/, '');
    const firstName = lead.name.split(' ')[0] || 'there';
    const pitch = `Hey ${firstName}, came across your work on ${lead.platform} and loved what you're building. Put together a few ideas and similar projects you can check out here: ${baseUrl}/r/${lead.id} — would love to chat if you're open to it!`;
    navigator.clipboard.writeText(pitch);
    setCopiedId(lead.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const markLeadStatus = async (leadId: string, status: string) => {
    try {
      const res = await fetch('/api/admin/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, status }),
      });
      if (res.ok) {
        setLeads((prev) =>
          prev.map((l) => (l.id === leadId ? { ...l, status } : l))
        );
      }
    } catch (e) {
      console.error('Mark lead status error:', e);
    }
  };

  const handleOpenLeadDrawer = (lead: Lead) => {
    setActiveLeadThread(lead);
    setEditableDraft(lead.draftReply || '');
    setActionNotice(null);
  };

  const handleSendDraft = async () => {
    if (!activeLeadThread) return;
    setSendingDraft(true);
    setActionNotice(null);

    try {
      const res = await fetch(`/api/leads/${activeLeadThread.id}/send-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editableDraft }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionNotice({ text: 'Reply dispatched successfully via Gmail!', type: 'success' });
        // Update active lead locally
        const updatedThreads = [
          ...activeLeadThread.messageThreads,
          {
            id: `temp-${Date.now()}`,
            direction: 'OUTBOUND',
            content: editableDraft,
            sentiment: null,
            portfolioClicks: 0,
            createdAt: new Date().toISOString(),
          },
        ];
        const updatedLead: Lead = {
          ...activeLeadThread,
          status: 'IN_CONVERSATION',
          draftReply: null,
          draftStatus: 'SENT',
          messageThreads: updatedThreads,
        };
        setActiveLeadThread(updatedLead);
        setLeads((prev) => prev.map((l) => (l.id === updatedLead.id ? updatedLead : l)));
      } else {
        setActionNotice({ text: data.error || 'Failed to send reply.', type: 'error' });
      }
    } catch {
      setActionNotice({ text: 'Network error sending reply.', type: 'error' });
    } finally {
      setSendingDraft(false);
    }
  };

  const handleDispatchNow = async (leadId: string) => {
    setDispatchingId(leadId);
    setActionNotice(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/dispatch-now`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionNotice({
          text: `Email dispatched successfully via Gmail SMTP! Message-ID: ${data.messageId}`,
          type: 'success',
        });
        if (data.lead) {
          setLeads((prev) => prev.map((l) => (l.id === leadId ? data.lead : l)));
          if (activeLeadThread?.id === leadId) {
            setActiveLeadThread(data.lead);
          }
        }
      } else {
        setActionNotice({
          text: data.error || 'Failed to dispatch email.',
          type: 'error',
        });
      }
    } catch (err) {
      setActionNotice({
        text: `Network error: ${(err as Error).message}`,
        type: 'error',
      });
    } finally {
      setDispatchingId(null);
    }
  };

  const handleRegenerateDraft = async () => {
    if (!activeLeadThread) return;
    setRegeneratingDraft(true);
    setActionNotice(null);

    try {
      const res = await fetch(`/api/leads/${activeLeadThread.id}/regenerate-draft`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.draftReply) {
        setEditableDraft(data.draftReply);
        setActionNotice({ text: 'New punchier draft angle generated by Gemini!', type: 'success' });
        const updatedLead: Lead = {
          ...activeLeadThread,
          draftReply: data.draftReply,
          draftStatus: 'PENDING_REVIEW',
        };
        setActiveLeadThread(updatedLead);
        setLeads((prev) => prev.map((l) => (l.id === updatedLead.id ? updatedLead : l)));
      } else {
        setActionNotice({ text: data.error || 'Failed to regenerate draft.', type: 'error' });
      }
    } catch {
      setActionNotice({ text: 'Network error regenerating draft.', type: 'error' });
    } finally {
      setRegeneratingDraft(false);
    }
  };

  const handleMarkOptOut = async () => {
    if (!activeLeadThread) return;
    try {
      await markLeadStatus(activeLeadThread.id, 'OPTED_OUT');
      setActionNotice({ text: 'Prospect marked as Opted Out.', type: 'success' });
      const updatedLead: Lead = {
        ...activeLeadThread,
        status: 'OPTED_OUT',
        winProbability: 0,
        draftStatus: 'DISCARDED',
      };
      setActiveLeadThread(updatedLead);
    } catch {
      setActionNotice({ text: 'Failed to update opt-out status.', type: 'error' });
    }
  };

  const [activeTab, setActiveTab] = useState<'all' | 'hot' | 'social' | 'emails' | 'campaigns'>('all');

  const isEmailLead = (l: Lead) =>
    l.contactEmailOrHandle.includes('@') &&
    l.contactEmailOrHandle.includes('.') &&
    !l.contactEmailOrHandle.startsWith('@');
  const isOutreachEmailSent = (l: Lead) =>
    isEmailLead(l) &&
    (Boolean(l.messageIdHeader) || ['SENT', 'REPLIED', 'IN_CONVERSATION', 'CONVERTED'].includes(l.status));

  const emailLeads = leads.filter(isEmailLead);
  const emailsSentCount = leads.filter(isOutreachEmailSent).length;
  const emailsPendingCount = emailLeads.filter(
    (l) => !isOutreachEmailSent(l) && (l.status === 'AUDITED' || l.status === 'DISCOVERED')
  ).length;

  const socialQueueLeads = leads.filter(
    (l) => ['reddit', 'instagram', 'x'].includes(l.platform.toLowerCase()) && l.status !== 'OPTED_OUT'
  );

  const highIntentLeads = leads.filter((l) => l.winProbability >= 70);

  const baseLeads =
    activeTab === 'hot'
      ? highIntentLeads
      : activeTab === 'social'
      ? socialQueueLeads
      : activeTab === 'emails'
      ? emailLeads
      : leads;

  const displayedLeads = baseLeads.filter((l) => {
    if (emailFilter === 'sent') return isOutreachEmailSent(l);
    if (emailFilter === 'not_sent') return isEmailLead(l) && !isOutreachEmailSent(l);
    if (emailFilter === 'social') return !isEmailLead(l);
    return true;
  });

  return (
    <div className="admin-portal min-h-screen bg-zinc-950 text-zinc-100 font-sans pb-20 selection:bg-blue-600 selection:text-white">
      {/* Top Sticky Header & Admin Menu */}
      <header className="sticky top-0 z-40 w-full border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 shadow-md shadow-blue-500/10">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">Lead Command & Outreach Ops</h1>
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  24/7 Alerts Live
                </span>
              </div>
              <p className="text-xs text-zinc-400 hidden sm:block">
                Prospecting, Gemini intent classification & two-way Telegram command center.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-end">
            {/* Scraping & Outreach Engine Start / Stop Button */}
            <button
              onClick={toggleEngine}
              disabled={togglingEngine}
              data-testid="toggle-engine-btn"
              className={`inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-lg border transition shadow-sm ${
                !isPipelineActive
                  ? 'bg-amber-950/40 border-amber-500/50 text-amber-300 hover:bg-emerald-950/50 hover:border-emerald-500/50 hover:text-emerald-300'
                  : 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300 hover:bg-rose-950/50 hover:border-rose-500/50 hover:text-rose-300'
              }`}
              title={isPipelineActive ? 'Click to Stop Scraping & Outreach' : 'Click to Start Scraping & Outreach'}
            >
              {isPipelineActive ? (
                <>
                  <Pause className="w-3.5 h-3.5 fill-current text-emerald-400" />
                  <span>Stop Scraping & Outreach</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse font-mono font-bold">
                    RUNNING
                  </span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current text-amber-400" />
                  <span>Start Scraping & Outreach</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono font-bold">
                    STOPPED
                  </span>
                </>
              )}
            </button>

            <button
              onClick={fetchDashboardData}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-200 hover:text-white hover:bg-zinc-800 transition"
              title="Sync latest leads and engine state"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sync</span>
            </button>

            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900 text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/30 transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs Bar for Easy Switching */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-2 border-t border-zinc-900 overflow-x-auto py-2">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'all'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            <span>All Prospects</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/30 font-mono">
              {leads.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('hot')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'hot'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-emerald-400 hover:bg-zinc-900'
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-emerald-400" />
            <span>High Intent (&ge;70%)</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/30 font-mono">
              {highIntentLeads.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('social')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'social'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-purple-400 hover:bg-zinc-900'
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-purple-400" />
            <span>Social DM Queue</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/30 font-mono">
              {socialQueueLeads.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('emails')}
            data-testid="tab-email-outreach"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'emails'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-blue-400 hover:bg-zinc-900'
            }`}
          >
            <Mail className="w-3.5 h-3.5 text-blue-400" />
            <span>Email Outreach</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/30 font-mono">
              {emailsSentCount} sent / {emailLeads.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('campaigns')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'campaigns'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-blue-400" />
            <span>Discovery Campaigns</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/30 font-mono">
              {campaigns.length}
            </span>
          </button>
        </div>
      </header>

      {/* Main Dashboard Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-8">

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950">
          <div className="text-xs text-zinc-400 uppercase font-semibold">Active Prospects</div>
          <div className="text-2xl font-bold text-white font-mono mt-1">{leads.length}</div>
          <div className="text-[11px] text-zinc-500 mt-0.5">Tracked in PostgreSQL</div>
        </div>

        <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950">
          <div className="text-xs text-zinc-400 uppercase font-semibold flex items-center gap-1">
            <Mail className="w-3.5 h-3.5 text-blue-400" />
            <span>Outreach Emails</span>
          </div>
          <div className="text-2xl font-bold text-blue-400 font-mono mt-1">{emailsSentCount} Sent</div>
          <div className="text-[11px] text-zinc-500 mt-0.5">
            {emailsPendingCount} queued · {emailLeads.length} total
          </div>
        </div>

        <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950">
          <div className="text-xs text-zinc-400 uppercase font-semibold flex items-center gap-1">
            <Flame className="w-3.5 h-3.5 text-emerald-400" />
            <span>High Intent (&ge;70%)</span>
          </div>
          <div className="text-2xl font-bold text-emerald-400 font-mono mt-1">{highIntentLeads.length}</div>
          <div className="text-[11px] text-emerald-500/80 mt-0.5">Ready for closing sprint</div>
        </div>

        <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950">
          <div className="text-xs text-zinc-400 uppercase font-semibold">Social DM Queue</div>
          <div className="text-2xl font-bold text-purple-400 font-mono mt-1">{socialQueueLeads.length}</div>
          <div className="text-[11px] text-zinc-500 mt-0.5">Reddit / X / Instagram</div>
        </div>

        <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 col-span-2 sm:col-span-1">
          <div className="text-xs text-zinc-400 uppercase font-semibold flex items-center justify-between">
            <span>Engine & 24/7 Alerts</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="24/7 Gmail & Telegram Reply Listener Active" />
          </div>
          <div className={`text-2xl font-bold font-mono mt-1 ${isPipelineActive ? 'text-emerald-400' : 'text-amber-400'}`}>
            {isPipelineActive ? 'RUNNING' : 'STOPPED'}
          </div>
          <div className="text-[11px] text-zinc-500 mt-0.5">24/7 Reply Listener: Active</div>
        </div>
      </div>

      {/* Campaign Keywords & Platform Toggles */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-bold text-white">Active Discovery Campaigns</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
              {campaigns.filter((c) => c.active).length} active
            </span>
          </div>
          <span className="text-xs text-zinc-400">Live Scrapers: Reddit, YouTube & Google Maps</span>
        </div>

        {/* Add Campaign Inline Form */}
        <form onSubmit={handleAddCampaign} className="flex flex-wrap items-center gap-2 p-3 rounded-lg border border-zinc-800 bg-zinc-900/40">
          <select
            value={newCampPlatform}
            onChange={(e) => setNewCampPlatform(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-blue-500 font-mono"
          >
            <option value="reddit">Reddit</option>
            <option value="youtube">YouTube</option>
            <option value="google_maps">Google Maps</option>
            <option value="x">X / Twitter</option>
            <option value="instagram">Instagram</option>
          </select>
          <input
            type="text"
            placeholder="Target keywords (e.g. hiring, landing page, nextjs)"
            value={newCampKeywords}
            onChange={(e) => setNewCampKeywords(e.target.value)}
            className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800/80 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={isAddingCampaign || !newCampKeywords.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Campaign</span>
          </button>
        </form>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {campaigns.map((camp) => (
            <div
              key={camp.id}
              className={`p-3 rounded-lg border flex flex-col justify-between transition ${
                camp.active
                  ? 'border-blue-500/30 bg-blue-500/5'
                  : 'border-zinc-800 bg-zinc-900/30 opacity-60'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold uppercase tracking-wider font-mono text-zinc-300">
                    {camp.platform}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => toggleCampaign(camp)}
                      className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold transition ${
                        camp.active
                          ? 'bg-blue-600 text-white'
                          : 'bg-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {camp.active ? 'ACTIVE' : 'PAUSED'}
                    </button>
                    <button
                      onClick={() => handleDeleteCampaign(camp.id)}
                      className="text-zinc-500 hover:text-rose-400 p-0.5 transition"
                      title="Delete Campaign"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">{camp.keywords}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      

      {/* One-Click Social DM Queue */}
      <section className="rounded-xl border border-purple-500/30 bg-zinc-950 p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-purple-400" />
            <h2 className="text-sm font-bold text-white">One-Click Social DM Queue (Instagram, Reddit, X)</h2>
          </div>
          <span className="text-xs font-mono text-purple-400">
            {socialQueueLeads.length} prospects awaiting dispatch
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {socialQueueLeads.map((lead) => (
            <div
              key={lead.id}
              className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-3 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-white truncate max-w-[180px]">{lead.name}</span>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    {lead.platform}
                  </span>
                </div>
                <div className="text-xs font-mono text-zinc-400 mb-2">{lead.contactEmailOrHandle}</div>
                <p className="text-xs text-zinc-300 bg-black/40 p-2.5 rounded-lg border border-zinc-800/80 leading-relaxed italic">
                  "{lead.auditSummary || 'High-value opportunity identified'}"
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-zinc-800/60">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">Win Probability</span>
                  <span className="font-mono font-bold text-emerald-400">{lead.winProbability}%</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyPitch(lead)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold bg-white text-black py-1.5 rounded-lg hover:bg-zinc-200 transition"
                  >
                    {copiedId === lead.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Pitch</span>
                      </>
                    )}
                  </button>

                  {lead.sourceUrl && (
                    <a
                      href={lead.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300 hover:text-white transition"
                      title="Open Profile"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}

                  <button
                    onClick={() => markLeadStatus(lead.id, 'CONTACTED')}
                    className="text-[11px] font-medium px-2.5 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:text-emerald-400 transition"
                  >
                    Mark Sent
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
      

      {/* Main Leads Table with Sorting & Filtering */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden space-y-4 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-white">All Prospects (Sorted by Win Probability)</h2>
          </div>

          {/* Search & Platform Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <form onSubmit={handleSearch} className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search leads..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="rounded-lg border border-zinc-800 bg-zinc-900 pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
              />
            </form>

            <select
              value={selectedPlatform}
              onChange={(e) => setSelectedPlatform(e.target.value)}
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="all">All Platforms</option>
              <option value="reddit">Reddit</option>
              <option value="youtube">YouTube</option>
              <option value="google_maps">Google Maps</option>
              <option value="x">X / Twitter</option>
              <option value="instagram">Instagram</option>
              <option value="email">Direct Email</option>
            </select>

            {/* Outreach Email Filter Dropdown */}
            <select
              value={emailFilter}
              onChange={(e) => setEmailFilter(e.target.value as any)}
              data-testid="email-status-filter"
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none font-medium"
            >
              <option value="all">All Outreach Status</option>
              <option value="sent">✅ Email Sent ({emailsSentCount})</option>
              <option value="not_sent">⏳ Email Not Sent ({emailLeads.length - emailsSentCount})</option>
              <option value="social">📱 Social DM ({leads.length - emailLeads.length})</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-800 text-zinc-400 uppercase tracking-wider font-mono">
              <tr>
                <th className="py-3 px-3">Win %</th>
                <th className="py-3 px-3">Prospect</th>
                <th className="py-3 px-3">Platform</th>
                <th className="py-3 px-3">Matched Service</th>
                <th className="py-3 px-3">Fit</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Email Outreach</th>
                <th className="py-3 px-3">AI Draft</th>
                <th className="py-3 px-3">Threads</th>
                <th className="py-3 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {displayedLeads.map((lead) => (
                <tr key={lead.id} className="hover:bg-zinc-900/50 transition group">
                  <td className="py-3.5 px-3">
                    <div className="flex items-center gap-2">
                      <div className="w-12 bg-zinc-800 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${
                            lead.winProbability >= 70
                              ? 'bg-emerald-400'
                              : lead.winProbability >= 40
                              ? 'bg-amber-400'
                              : 'bg-zinc-600'
                          }`}
                          style={{ width: `${lead.winProbability}%` }}
                        />
                      </div>
                      <span className="font-mono font-bold text-white">{lead.winProbability}%</span>
                    </div>
                  </td>

                  <td className="py-3.5 px-3">
                    <div className="font-semibold text-white">{lead.name}</div>
                    <div className="text-[11px] text-zinc-500 font-mono truncate max-w-[200px]">
                      {lead.contactEmailOrHandle}
                    </div>
                    {lead.sourceUrl && (
                      <a
                        href={lead.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 font-medium underline underline-offset-2 mt-0.5"
                        onClick={(e) => e.stopPropagation()}
                        title="Open original post or referenced site"
                      >
                        <ExternalLink className="w-2.5 h-2.5" />
                        <span>Referenced Post / Site</span>
                      </a>
                    )}
                  </td>

                  <td className="py-3.5 px-3 font-mono text-zinc-400">
                    <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 uppercase text-[10px]">
                      {lead.platform}
                    </span>
                  </td>

                  <td className="py-3.5 px-3">
                    <span
                      className={`px-2 py-0.5 rounded font-mono text-[10px] font-semibold ${
                        lead.matchedService === 'web'
                          ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          : lead.matchedService === 'video'
                          ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      }`}
                    >
                      {lead.matchedService.toUpperCase()}
                    </span>
                  </td>

                  <td className="py-3.5 px-3 font-mono font-bold text-zinc-300">{lead.fitScore}/10</td>

                  <td className="py-3.5 px-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                        lead.status === 'IN_CONVERSATION'
                          ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                          : lead.status === 'CONVERTED'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : lead.status === 'REPLIED'
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          : lead.status === 'SENT' || lead.status === 'CONTACTED'
                          ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                          : lead.status === 'QUEUED_SOCIAL'
                          ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {lead.status}
                    </span>
                  </td>

                  <td className="py-3.5 px-3">
                    {isEmailLead(lead) ? (
                      isOutreachEmailSent(lead) ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 w-fit">
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span>Email Sent</span>
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono">Gmail SMTP</span>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 w-fit">
                            <Clock className="w-3 h-3 text-amber-400" />
                            <span>Not Sent</span>
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono">
                            {lead.status === 'AUDITED' ? 'Queued' : lead.status === 'DISCOVERED' ? 'Pending Audit' : 'Draft'}
                          </span>
                          {lead.status === 'AUDITED' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDispatchNow(lead.id);
                              }}
                              disabled={dispatchingId === lead.id}
                              className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-50 w-fit"
                              title="Send Email Now via Gmail SMTP"
                            >
                              {dispatchingId === lead.id ? (
                                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              ) : (
                                <Send className="w-2.5 h-2.5" />
                              )}
                              <span>Send Now</span>
                            </button>
                          )}
                        </div>
                      )
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[10px] font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30 w-fit">
                          <Radio className="w-3 h-3 text-purple-400" />
                          <span>Social DM</span>
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono">No Email</span>
                      </div>
                    )}
                  </td>

                  <td className="py-3.5 px-3">
                    {lead.draftStatus === 'PENDING_REVIEW' ? (
                      <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1 w-fit">
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        <span>Ready</span>
                      </span>
                    ) : lead.draftStatus === 'SENT' ? (
                      <span className="text-[10px] text-emerald-400 font-mono">Sent</span>
                    ) : (
                      <span className="text-[10px] text-zinc-600 font-mono">—</span>
                    )}
                  </td>

                  <td className="py-3.5 px-3">
                    <button
                      onClick={() => handleOpenLeadDrawer(lead)}
                      className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 font-medium"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>{lead.messageThreads.length}</span>
                    </button>
                  </td>

                  <td className="py-3.5 px-3 text-right">
                    <button
                      onClick={() => handleOpenLeadDrawer(lead)}
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition"
                    >
                      <span>Inspect</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      </main>

      {/* Message Thread Drawer Modal with Editable AI Draft Box */}
      {activeLeadThread && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl space-y-6 max-h-[90vh] flex flex-col justify-between">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-white">{activeLeadThread.name}</h3>
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
                    {activeLeadThread.platform}
                  </span>
                </div>
                <div className="text-xs text-zinc-400 font-mono mt-0.5">
                  {activeLeadThread.contactEmailOrHandle} • Win Prob:{' '}
                  <span className="text-emerald-400 font-bold">{activeLeadThread.winProbability}%</span> • Status:{' '}
                  <span className="text-blue-400 font-semibold">{activeLeadThread.status}</span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[11px] text-zinc-400 font-medium">Outreach Delivery:</span>
                  {isEmailLead(activeLeadThread) ? (
                    isOutreachEmailSent(activeLeadThread) ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span>Email Sent (Gmail SMTP)</span>
                        {activeLeadThread.messageIdHeader && (
                          <span className="text-zinc-500 ml-1 text-[9px]">
                            ({activeLeadThread.messageIdHeader.slice(0, 16)}...)
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[10px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        <Clock className="w-3 h-3 text-amber-400" />
                        <span>Email Not Sent Yet ({activeLeadThread.status === 'AUDITED' ? 'Queued in Batch' : 'Pending Audit'})</span>
                      </span>
                    )
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[10px] font-semibold bg-purple-500/20 text-purple-400 border border-purple-500/30">
                      <Radio className="w-3 h-3 text-purple-400" />
                      <span>Social DM Prospect</span>
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setActiveLeadThread(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conversation Flow */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {/* Meeting & Call Prep Dossier Card */}
              <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PhoneCall className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Meeting &amp; Call Preparation Dossier
                    </span>
                  </div>
                  {activeLeadThread.sourceUrl && (
                    <a
                      href={activeLeadThread.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-500/20 border border-indigo-500/40 text-[11px] font-semibold text-indigo-300 hover:text-white transition"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Open Source Post / Site</span>
                    </a>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 space-y-1">
                    <span className="text-[10px] text-zinc-400 uppercase font-semibold font-mono">
                      📍 Where This Lead Was Taken From:
                    </span>
                    <div className="text-zinc-200 break-all font-mono text-[11px]">
                      {activeLeadThread.sourceUrl ? (
                        <a
                          href={activeLeadThread.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:underline inline-flex items-center gap-1"
                        >
                          <span className="line-clamp-2">{activeLeadThread.sourceUrl}</span>
                          <ExternalLink className="w-3 h-3 inline shrink-0" />
                        </a>
                      ) : (
                        <span className="text-zinc-500">Direct Inbound / Portfolio Form</span>
                      )}
                    </div>
                    <div className="text-[10px] text-zinc-400 font-mono">
                      Platform: <span className="text-white uppercase font-bold">{activeLeadThread.platform}</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 space-y-1">
                    <span className="text-[10px] text-zinc-400 uppercase font-semibold font-mono">
                      🎯 Call Talking Points &amp; Strategy:
                    </span>
                    <div className="text-zinc-300 text-[11px]">
                      Pitched Service: <span className="font-bold text-white uppercase">{activeLeadThread.matchedService}</span>
                    </div>
                    <div className="text-[10px] text-zinc-400 leading-normal">
                      {activeLeadThread.matchedService === 'web' && 'Focus on sub-200ms TTFB, mobile Core Web Vitals, fixing LCP banner shifts, and lifting checkout conversions.'}
                      {activeLeadThread.matchedService === 'video' && 'Focus on the critical 0:30 hook retention cliff, kinetic captions, rhythm cutaways, and short-form reels.'}
                      {activeLeadThread.matchedService === 'design' && 'Focus on WCAG AAA contrast hierarchy, checkout friction elimination, and reusable Figma tokens.'}
                    </div>
                  </div>
                </div>

                {activeLeadThread.auditSummary && (
                  <div className="p-2.5 rounded-lg bg-black/40 border border-zinc-800 space-y-1 text-xs">
                    <span className="text-[10px] text-zinc-400 uppercase font-semibold font-mono">
                      📊 Verified Audit &amp; Performance Observation:
                    </span>
                    <p className="text-zinc-200 font-mono text-[11px] leading-relaxed">
                      {activeLeadThread.auditSummary}
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Conversation History</div>
                {activeLeadThread.messageThreads.length === 0 ? (
                  <div className="text-center py-6 text-zinc-500 text-xs bg-zinc-900/30 rounded-xl border border-zinc-800/60">
                    No message history yet. Prospect is in {activeLeadThread.status} stage.
                  </div>
                ) : (
                  activeLeadThread.messageThreads.map((thread) => (
                    <div
                      key={thread.id}
                      className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
                        thread.direction === 'INBOUND'
                          ? 'border-blue-500/30 bg-blue-950/20 text-blue-100 ml-4'
                          : 'border-zinc-800 bg-zinc-900/60 text-zinc-300 mr-4'
                      }`}
                    >
                      <div className="flex items-center justify-between font-mono text-[10px] text-zinc-400">
                        <span className="font-bold">
                          {thread.direction === 'INBOUND' ? 'INBOUND CLIENT REPLY' : 'OUTBOUND PITCH'}
                        </span>
                        <span>{new Date(thread.createdAt).toLocaleString()}</span>
                      </div>

                      <p className="whitespace-pre-wrap leading-relaxed">{thread.content}</p>

                      <div className="flex items-center gap-3 pt-1 border-t border-zinc-800/60 text-[11px] font-mono">
                        {thread.sentiment && (
                          <span
                            className={`px-2 py-0.5 rounded font-bold ${
                              thread.sentiment === 'POSITIVE_INTEREST'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : thread.sentiment === 'OBJECTION_OR_QUESTION'
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'bg-zinc-800 text-zinc-400'
                            }`}
                          >
                            Sentiment: {thread.sentiment}
                          </span>
                        )}
                        <span className="text-zinc-400">Portfolio Clicks: {thread.portfolioClicks}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Editable Gemini Proposed Reply Box */}
              <div className="rounded-xl border border-blue-500/40 bg-zinc-900/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-bold text-white">Gemini Proposed Reply (3-4 Sentences)</span>
                  </div>
                  {activeLeadThread.draftStatus && (
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                        activeLeadThread.draftStatus === 'PENDING_REVIEW'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : activeLeadThread.draftStatus === 'SENT'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {activeLeadThread.draftStatus}
                    </span>
                  )}
                </div>

                <textarea
                  rows={4}
                  value={editableDraft}
                  onChange={(e) => setEditableDraft(e.target.value)}
                  placeholder="Draft a contextual reply or click Regenerate Draft below..."
                  className="w-full rounded-lg border border-zinc-700 bg-black/60 p-3 text-xs text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none resize-none leading-relaxed font-sans"
                />

                {actionNotice && (
                  <div
                    className={`p-2 rounded text-xs ${
                      actionNotice.type === 'success'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}
                  >
                    {actionNotice.text}
                  </div>
                )}

                {/* Draft Actions Bar */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {isEmailLead(activeLeadThread) && activeLeadThread.status === 'AUDITED' && (
                    <button
                      onClick={() => handleDispatchNow(activeLeadThread.id)}
                      disabled={dispatchingId === activeLeadThread.id}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition disabled:opacity-50 shadow-md shadow-emerald-950/40"
                    >
                      {dispatchingId === activeLeadThread.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      <span>{dispatchingId === activeLeadThread.id ? 'Dispatching SMTP...' : 'Send Now (Gmail SMTP)'}</span>
                    </button>
                  )}

                  <button
                    onClick={handleSendDraft}
                    disabled={sendingDraft || !editableDraft.trim()}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{sendingDraft ? 'Dispatching...' : 'Send Reply via Gmail'}</span>
                  </button>

                  <button
                    onClick={handleRegenerateDraft}
                    disabled={regeneratingDraft}
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-200 hover:text-white transition disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${regeneratingDraft ? 'animate-spin' : ''}`} />
                    <span>Regenerate Draft</span>
                  </button>

                  <button
                    onClick={handleMarkOptOut}
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-rose-900/60 bg-rose-950/20 text-rose-400 hover:bg-rose-950/40 transition"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>Mark Opt-Out</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-zinc-800 flex items-center justify-between">
              <button
                onClick={() => copyPitch(activeLeadThread)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 hover:bg-zinc-800 transition"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Outreach Pitch</span>
              </button>

              <button
                onClick={() => setActiveLeadThread(null)}
                className="text-xs px-4 py-2 rounded-lg border border-zinc-800 text-zinc-400 hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-zinc-500">Loading Lead Command Center...</div>}>
      <AdminDashboardContent />
    </Suspense>
  );
}
