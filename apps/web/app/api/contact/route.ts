import { NextRequest, NextResponse } from 'next/server';
import { prisma } from 'db';
import { sendTelegramLeadAlert } from '@/lib/telegram';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, contact, service, budget, message } = body;

    if (!name || !contact || !message) {
      return NextResponse.json(
        { error: 'Name, contact, and project message are required.' },
        { status: 400 }
      );
    }

    // Upsert or create lead in DB
    const lead = await prisma.lead.upsert({
      where: { contactEmailOrHandle: contact },
      update: {
        name,
        matchedService: service || 'web',
        auditSummary: `Direct Client Inquiry (${budget}): ${message}`,
        winProbability: 80,
        status: 'REPLIED',
        updatedAt: new Date(),
      },
      create: {
        name,
        platform: contact.includes('@') ? 'email' : 'social',
        contactEmailOrHandle: contact,
        sourceUrl: 'https://mevin.studio/#inquire',
        auditSummary: `Direct Client Inquiry (${budget}): ${message}`,
        matchedService: service || 'web',
        fitScore: 10,
        winProbability: 80,
        status: 'REPLIED',
      },
    });

    // Record thread
    await prisma.messageThread.create({
      data: {
        leadId: lead.id,
        direction: 'INBOUND',
        content: `Budget: ${budget}\nMessage: ${message}`,
        sentiment: 'POSITIVE_INTEREST',
        portfolioClicks: 1,
      },
    });

    // Send Telegram alert
    await sendTelegramLeadAlert({
      prospectName: name,
      platform: lead.platform,
      sentiment: 'POSITIVE_INTEREST',
      replyText: `[Inquiry: ${budget}] ${message}`,
      winProbability: 80,
    });

    return NextResponse.json({ success: true, leadId: lead.id });
  } catch (err: unknown) {
    const errorMsg = (err as Error)?.message || 'Internal server error processing inquiry.';
    console.error('[Contact API Error]:', err);
    return NextResponse.json(
      { error: 'Failed to process inquiry.', details: errorMsg },
      { status: 500 }
    );
  }
}
