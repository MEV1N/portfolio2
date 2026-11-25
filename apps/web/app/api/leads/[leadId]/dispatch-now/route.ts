import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { prisma } from 'db';
import { isAuthenticatedAdmin, verifyBearerToken } from '@/lib/auth';

function isValidEmail(email: string): boolean {
  if (!email || email.length < 5 || email.length > 80) return false;
  const lower = email.toLowerCase().trim();
  if (lower.startsWith('@') || lower.startsWith('hn/') || lower.startsWith('u/')) return false;
  const [prefix, domain] = lower.split('@');
  if (!prefix || !domain || !domain.includes('.')) return false;
  return true;
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
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        messageThreads: {
          where: { direction: 'OUTBOUND' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });
    }

    if (!isValidEmail(lead.contactEmailOrHandle)) {
      return NextResponse.json(
        { error: `Lead contact (${lead.contactEmailOrHandle}) is not a valid email address.` },
        { status: 400 }
      );
    }

    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASSWORD;

    if (!gmailUser || !gmailPass) {
      return NextResponse.json(
        {
          error:
            'Missing Gmail credentials: GMAIL_USER or GMAIL_APP_PASSWORD not configured in environment.',
        },
        { status: 500 }
      );
    }

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://mevin-portfolio.vercel.app').replace(/\/+$/, '');
    const firstName = lead.name.split(' ')[0] || 'there';
    const draftPitch =
      lead.messageThreads[0]?.content ||
      lead.draftReply ||
      `Hey ${firstName}, came across your work and loved what you're building. You can check out some of my recent work and projects here: ${appUrl}/r/${lead.id} — would love to chat if you're open to it!`;

    const plainTextBody = `${draftPitch}

Best,
Mevin
${appUrl}

---
PS: If you'd rather I not reach out, just let me know and I won't email again.`;

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailPass,
      },
    });

    const subjectTarget = getCleanSubjectTarget(lead.name);
    const emailSubject = `Quick idea regarding ${subjectTarget}`;

    console.log(`[dispatch-now] Sending manual outreach to ${lead.contactEmailOrHandle}...`);

    let info: nodemailer.SentMessageInfo;
    try {
      info = await transporter.sendMail({
        from: `"Mevin" <${gmailUser}>`,
        to: lead.contactEmailOrHandle,
        subject: emailSubject,
        text: plainTextBody,
      });
    } catch (smtpErr) {
      const errorMsg = (smtpErr as Error).message || 'Gmail SMTP failed to send';
      console.error(`[dispatch-now] SMTP Error for ${lead.contactEmailOrHandle}:`, errorMsg);

      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          auditSummary: `[Manual Dispatch Failed: ${errorMsg.slice(0, 100)}] ${lead.auditSummary || ''}`.slice(0, 500),
          updatedAt: new Date(),
        },
      }).catch(() => {});

      return NextResponse.json(
        { error: `Gmail SMTP Error: ${errorMsg}` },
        { status: 500 }
      );
    }

    // Ensure outbound message thread exists
    if (lead.messageThreads.length === 0) {
      await prisma.messageThread.create({
        data: {
          leadId: lead.id,
          direction: 'OUTBOUND',
          content: draftPitch,
          sentiment: null,
          portfolioClicks: 0,
        },
      });
    }

    const updatedLead = await prisma.lead.update({
      where: { id: lead.id },
      data: {
        status: 'SENT',
        messageIdHeader: info.messageId,
        nextFollowUpAt: new Date(Date.now() + 48 * 3600 * 1000),
        updatedAt: new Date(),
      },
      include: {
        messageThreads: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    return NextResponse.json({
      success: true,
      messageId: info.messageId,
      lead: updatedLead,
    });
  } catch (error) {
    console.error('[dispatch-now Error]:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to dispatch email.' },
      { status: 500 }
    );
  }
}
