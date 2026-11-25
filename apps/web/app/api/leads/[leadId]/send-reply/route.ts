import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { prisma } from 'db';
import { isAuthenticatedAdmin, verifyBearerToken } from '@/lib/auth';

let cachedTransporter: nodemailer.Transporter | null = null;

function getMailTransporter(user: string, pass: string): nodemailer.Transporter {
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
      auth: { user, pass },
    });
  }
  return cachedTransporter;
}

function formatReplyWithSignoff(content: string): string {
  const trimmed = content.trim();
  if (
    /Best,?(\r?\n)+Mevin/i.test(trimmed) ||
    /Thanks,?(\r?\n)+Mevin/i.test(trimmed) ||
    /Mevin\s*$/i.test(trimmed) ||
    /mevin\.studio/i.test(trimmed)
  ) {
    return trimmed;
  }
  return `${trimmed}\n\nBest,\nMevin\nmevin.studio`;
}

function getCleanSubjectTarget(rawName: string): string {
  let target = rawName;
  if (target.includes('(') && target.includes(')')) {
    const match = target.match(/\((.*?)\)/)?.[1];
    if (match) target = match;
  }
  target = target.replace(/\[.*?\]/g, '').trim();
  if (!target || target.toLowerCase() === 'inbound prospect') {
    target = 'your project';
  }
  return target;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const isAuth = (await isAuthenticatedAdmin()) || verifyBearerToken(req.headers.get('Authorization'));
  if (!isAuth) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { leadId } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: { messageThreads: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });
    }

    const rawReplyContent = body.content || lead.draftReply;
    if (!rawReplyContent) {
      return NextResponse.json(
        { error: 'No reply content provided and no draftReply exists on lead.' },
        { status: 400 }
      );
    }
    const replyContent = formatReplyWithSignoff(rawReplyContent);

    let sentMessageId: string | null = null;
    const isEmailLead =
      lead.platform === 'email' ||
      lead.platform === 'google_maps' ||
      lead.contactEmailOrHandle.includes('@');

    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASSWORD;

    // Send email via pooled Gmail SMTP for instant dispatch (<500ms)
    if (isEmailLead && gmailUser && gmailPass) {
      const transporter = getMailTransporter(gmailUser, gmailPass);

      const subjectTarget = getCleanSubjectTarget(lead.name);
      const emailSubject = `Re: Quick idea regarding ${subjectTarget}`;
      const mailOptions: nodemailer.SendMailOptions = {
        from: `"Mevin" <${gmailUser}>`,
        to: lead.contactEmailOrHandle,
        subject: emailSubject,
        text: replyContent,
      };

      if (lead.messageIdHeader) {
        mailOptions.inReplyTo = lead.messageIdHeader;
        mailOptions.references = lead.messageIdHeader;
      }

      const info = await transporter.sendMail(mailOptions);
      sentMessageId = info.messageId;
      console.log(`[Send Reply] Email sent to ${lead.contactEmailOrHandle}. Message-ID: ${sentMessageId}`);
    } else {
      console.log(`[Send Reply] Non-email platform lead (${lead.platform}) recorded as sent in CRM.`);
    }

    // Atomically persist outbound thread, clear draft, and set status to IN_CONVERSATION
    await prisma.$transaction(async (tx) => {
      await tx.messageThread.create({
        data: {
          leadId: lead.id,
          direction: 'OUTBOUND',
          content: replyContent,
          sentiment: null,
          portfolioClicks: 0,
        },
      });

      await tx.lead.update({
        where: { id: lead.id },
        data: {
          draftReply: null,
          draftStatus: 'SENT',
          status: 'IN_CONVERSATION',
          ...(sentMessageId && { messageIdHeader: sentMessageId }),
          updatedAt: new Date(),
        },
      });
    });

    return NextResponse.json({
      success: true,
      leadId: lead.id,
      content: replyContent,
      messageId: sentMessageId,
      status: 'IN_CONVERSATION',
    });
  } catch (error: unknown) {
    console.error('[Send Reply Error]:', error);
    return NextResponse.json(
      { error: 'Failed to send reply.' },
      { status: 500 }
    );
  }
}
