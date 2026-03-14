import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { createClient } from '@supabase/supabase-js'

const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.BREVO_SMTP_LOGIN,
    pass: process.env.BREVO_SMTP_KEY,
  },
})
const FROM = 'SpareShare <noreply@spareshare.com>'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getCompanyEmail(companyId: string): Promise<string | null> {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true })
    .limit(1)
    .single()
  if (!profile?.id) return null
  const { data: user } = await supabaseAdmin.auth.admin.getUserById(profile.id)
  return user?.user?.email ?? null
}

async function getAdminEmail(): Promise<string | null> {
  // Get admin profile id first
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .single()
  if (!profile?.id) return null
  // Get email from auth.users via admin API
  const { data: user } = await supabaseAdmin.auth.admin.getUserById(profile.id)
  return user?.user?.email ?? null
}

function baseStyle() {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; background: #ffffff;">
      <div style="background: #0f172a; padding: 20px 28px; border-radius: 8px 8px 0 0;">
        <span style="color: #ffffff; font-size: 18px; font-weight: 900; letter-spacing: -0.03em;">SpareShare</span>
        <span style="color: #00C878; font-size: 9px; font-weight: 600; margin-left: 8px; letter-spacing: 0.06em; text-transform: uppercase;">with Trade Assurance</span>
      </div>
      <div style="padding: 28px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
  `
}
function baseClose() {
  return `
      </div>
      <div style="padding: 16px 28px; text-align: center; font-size: 11px; color: #94a3b8;">
        SpareShare B2B Marketplace · Trade Assurance Service<br/>
        This is an automated message — please do not reply directly.
      </div>
    </div>
  `
}

// ── Email templates ───────────────────────────────────────────────────────────
const templates: Record<string, (d: any) => { subject: string; html: string }> = {

  // Deposit başvurusu → Admin'e
  deposit_request: (d) => ({
    subject: `💰 New Deposit Application — ${d.amount} ${d.currency}`,
    html: baseStyle() + `
      <h2 style="margin: 0 0 16px; font-size: 18px; color: #0f172a;">New Deposit Application</h2>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <tr><td style="padding: 8px 0; color: #64748b; width: 140px;">Company</td><td style="color: #0f172a; font-weight: 600;">${d.company_name}</td></tr>
        <tr><td style="padding: 8px 0; color: #64748b;">Amount</td><td style="color: #1e40af; font-weight: 700; font-size: 16px;">${d.amount} ${d.currency}</td></tr>
        <tr><td style="padding: 8px 0; color: #64748b;">Bank</td><td style="color: #0f172a;">${d.bank_name || '—'}</td></tr>
        <tr><td style="padding: 8px 0; color: #64748b;">Bank Ref</td><td style="color: #0f172a;">${d.bank_ref || '—'}</td></tr>
        ${d.notes ? `<tr><td style="padding: 8px 0; color: #64748b;">Notes</td><td style="color: #92400e;">${d.notes}</td></tr>` : ''}
      </table>
      <div style="margin-top: 20px;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/admin/deposits"
           style="display: inline-block; padding: 10px 20px; background: #0f172a; color: white; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 700;">
          Review Application →
        </a>
      </div>
    ` + baseClose(),
  }),

  // Deposit onaylandı → Kullanıcıya
  deposit_approved: (d) => ({
    subject: `✅ Deposit Approved — ${d.amount} ${d.currency} added to your Trade Assurance balance`,
    html: baseStyle() + `
      <h2 style="margin: 0 0 8px; font-size: 18px; color: #15803d;">Deposit Approved ✅</h2>
      <p style="color: #64748b; font-size: 13px; margin: 0 0 20px;">Your deposit has been verified and added to your Trade Assurance balance.</p>
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px 20px; margin-bottom: 20px;">
        <div style="font-size: 28px; font-weight: 900; color: #15803d;">+${d.amount} ${d.currency}</div>
        <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Added to Trade Assurance Balance</div>
      </div>
      <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/escrow"
         style="display: inline-block; padding: 10px 20px; background: #15803d; color: white; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 700;">
        View Balance →
      </a>
    ` + baseClose(),
  }),

  // TX: Offer kabul edildi → Seller'a
  tx_confirmed: (d) => ({
    subject: `🤝 Offer Accepted — ${d.pn} (${d.quantity} units)`,
    html: baseStyle() + `
      <h2 style="margin: 0 0 8px; font-size: 18px; color: #0f172a;">Your offer has been accepted</h2>
      <p style="color: #64748b; font-size: 13px; margin: 0 0 20px;">The buyer confirmed the deal. Awaiting payment.</p>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <tr><td style="padding: 7px 0; color: #64748b; width: 120px;">Part Number</td><td style="font-weight: 700; color: #0f172a;">${d.pn}</td></tr>
        <tr><td style="padding: 7px 0; color: #64748b;">Quantity</td><td style="color: #0f172a;">${d.quantity} units</td></tr>
        <tr><td style="padding: 7px 0; color: #64748b;">Price</td><td style="color: #1e40af; font-weight: 700;">${d.price} ${d.currency}/unit</td></tr>
        <tr><td style="padding: 7px 0; color: #64748b;">Counterpart</td><td style="color: #0f172a;">Dealer ${d.dealer_code}</td></tr>
      </table>
      <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/transactions"
         style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #0f172a; color: white; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 700;">
        View Transaction →
      </a>
    ` + baseClose(),
  }),

  // TX: Ödeme yapıldı → Seller'a
  tx_payment_held: (d) => ({
    subject: `🔒 Payment Secured — ${d.amount} ${d.currency} held in Trade Assurance`,
    html: baseStyle() + `
      <h2 style="margin: 0 0 8px; font-size: 18px; color: #0f172a;">Payment is secured</h2>
      <p style="color: #64748b; font-size: 13px; margin: 0 0 20px;">
        The buyer has transferred <strong>${d.amount} ${d.currency}</strong> to Trade Assurance escrow. 
        Please prepare the shipment.
      </p>
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px 18px; margin-bottom: 20px;">
        <div style="font-size: 13px; color: #15803d; font-weight: 700;">🛡️ Trade Assurance Active</div>
        <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Funds will be released upon delivery confirmation.</div>
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px;">
        <tr><td style="padding: 7px 0; color: #64748b; width: 120px;">Part Number</td><td style="font-weight: 700; color: #0f172a;">${d.pn}</td></tr>
        <tr><td style="padding: 7px 0; color: #64748b;">Amount Secured</td><td style="color: #15803d; font-weight: 700;">${d.amount} ${d.currency}</td></tr>
      </table>
      <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/transactions"
         style="display: inline-block; padding: 10px 20px; background: #0f172a; color: white; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 700;">
        Mark as Ready to Ship →
      </a>
    ` + baseClose(),
  }),

  // TX: Kargoya verildi → Buyer'a
  tx_shipped: (d) => ({
    subject: `📦 Shipped — ${d.pn} · Tracking: ${d.tracking}`,
    html: baseStyle() + `
      <h2 style="margin: 0 0 8px; font-size: 18px; color: #0f172a;">Your order has been shipped</h2>
      <p style="color: #64748b; font-size: 13px; margin: 0 0 20px;">The seller has dispatched your order. Please confirm delivery once received.</p>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px;">
        <tr><td style="padding: 7px 0; color: #64748b; width: 140px;">Part Number</td><td style="font-weight: 700; color: #0f172a;">${d.pn}</td></tr>
        <tr><td style="padding: 7px 0; color: #64748b;">Tracking Number</td><td style="color: #1e40af; font-weight: 700;">${d.tracking}</td></tr>
        <tr><td style="padding: 7px 0; color: #64748b;">Quantity</td><td style="color: #0f172a;">${d.quantity} units</td></tr>
      </table>
      <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 12px 16px; font-size: 12px; color: #92400e; margin-bottom: 20px;">
        ⚠️ <strong>Important:</strong> Confirm delivery only after inspecting the equipment. Payment will be released to the seller upon your confirmation.
      </div>
      <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/transactions"
         style="display: inline-block; padding: 10px 20px; background: #0f172a; color: white; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 700;">
        Confirm Delivery →
      </a>
    ` + baseClose(),
  }),

  // TX: Teslim onaylandı → Seller'a
  tx_delivered: (d) => ({
    subject: `✅ Delivery Confirmed — Payment being released`,
    html: baseStyle() + `
      <h2 style="margin: 0 0 8px; font-size: 18px; color: #15803d;">Delivery confirmed ✅</h2>
      <p style="color: #64748b; font-size: 13px; margin: 0 0 20px;">
        The buyer confirmed receipt of <strong>${d.pn}</strong>. 
        Trade Assurance will release the payment to your balance.
      </p>
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px 20px; margin-bottom: 20px;">
        <div style="font-size: 24px; font-weight: 900; color: #15803d;">${d.amount} ${d.currency}</div>
        <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Being released to your Trade Assurance balance</div>
      </div>
      <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/escrow"
         style="display: inline-block; padding: 10px 20px; background: #15803d; color: white; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 700;">
        View Balance →
      </a>
    ` + baseClose(),
  }),

  // TX: Dispute açıldı → Admin'e
  tx_disputed: (d) => ({
    subject: `⚠️ Dispute Opened — TX ${d.tx_id.slice(0, 8)} · ${d.pn}`,
    html: baseStyle() + `
      <h2 style="margin: 0 0 8px; font-size: 18px; color: #dc2626;">Dispute Opened ⚠️</h2>
      <p style="color: #64748b; font-size: 13px; margin: 0 0 20px;">A dispute has been filed. Trade Assurance funds are frozen pending resolution.</p>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px;">
        <tr><td style="padding: 7px 0; color: #64748b; width: 140px;">Transaction</td><td style="font-weight: 700; color: #0f172a;">${d.tx_id.slice(0, 8).toUpperCase()}</td></tr>
        <tr><td style="padding: 7px 0; color: #64748b;">Part Number</td><td style="color: #0f172a;">${d.pn}</td></tr>
        <tr><td style="padding: 7px 0; color: #64748b;">Amount at Risk</td><td style="color: #dc2626; font-weight: 700;">${d.amount} ${d.currency}</td></tr>
        <tr><td style="padding: 7px 0; color: #64748b;">Filed by</td><td style="color: #0f172a;">Dealer ${d.dealer_code} (${d.role})</td></tr>
        <tr><td style="padding: 7px 0; color: #64748b;">Reason</td><td style="color: #dc2626;">${d.reason}</td></tr>
      </table>
      <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/admin/transactions"
         style="display: inline-block; padding: 10px 20px; background: #dc2626; color: white; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 700;">
        Review Dispute →
      </a>
    ` + baseClose(),
  }),

  // AI kredi satın alındı → Kullanıcıya
  consultant_inquiry: (d) => ({
    subject: `📋 Consultant Inquiry — ${d.topic || 'General'} · ${d.name}`,
    html: baseStyle() + `
      <h2 style="margin: 0 0 8px; font-size: 18px; color: #0f172a;">New Consultant Inquiry</h2>
      <p style="color: #64748b; font-size: 13px; margin: 0 0 20px;">A visitor has submitted a consultant inquiry from the SpareShare website.</p>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 20px; margin-bottom: 20px;">
        <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
          <tr><td style="padding: 6px 0; color: #64748b; width: 120px;">Name</td><td style="color: #0f172a; font-weight: 600;">${d.name}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748b;">Company</td><td style="color: #0f172a;">${d.company || '—'}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748b;">Email</td><td style="color: #185FA5;">${d.email}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748b;">Topic</td><td style="color: #0f172a;">${d.topic || '—'}</td></tr>
        </table>
      </div>
      <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px 20px; margin-bottom: 20px;">
        <div style="font-size: 12px; color: #92400e; font-weight: 600; margin-bottom: 8px;">MESSAGE</div>
        <div style="font-size: 14px; color: #0f172a; line-height: 1.7;">${d.message}</div>
      </div>
      <a href="mailto:${d.email}" style="display: inline-block; background: #0A0A0A; color: white; padding: 10px 22px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600;">
        Reply to ${d.name} →
      </a>
    ` + baseClose(),
  }),

  new_message: (d) => ({
    subject: `💬 New message from Dealer ${d.sender_code}`,
    html: baseStyle() + `
      <h2 style="margin: 0 0 8px; font-size: 18px; color: #0f172a;">New Message</h2>
      <p style="color: #64748b; font-size: 13px; margin: 0 0 20px;">You have a new message from <strong>Dealer ${d.sender_code}</strong> on SpareShare.</p>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 20px; margin-bottom: 20px; font-size: 14px; color: #0f172a; line-height: 1.6;">
        ${d.preview}
      </div>
      <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/messages"
        style="display: inline-block; background: #1e40af; color: white; padding: 10px 22px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600;">
        Reply in Messages →
      </a>
    ` + baseClose(),
  }),

  ai_credit_purchased: (d) => ({
    subject: `🤖 AI Credits Added — 10 credits · $${d.amount}`,
    html: baseStyle() + `
      <h2 style="margin: 0 0 8px; font-size: 18px; color: #0f172a;">AI Credits Added 🤖</h2>
      <p style="color: #64748b; font-size: 13px; margin: 0 0 20px;">Your purchase was successful. Credits have been added to your account.</p>
      <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px 20px; margin-bottom: 20px;">
        <div style="font-size: 28px; font-weight: 900; color: #1e40af;">+10 Credits</div>
        <div style="font-size: 12px; color: #64748b; margin-top: 4px;">$${d.amount} charged · Credits never expire</div>
      </div>
      <p style="font-size: 12px; color: #64748b;">Use your credits for AI-powered product Q&amp;A, part number matching, and compatibility analysis across the SpareShare Knowledge Base.</p>
    ` + baseClose(),
  }),
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    console.log('EMAIL ROUTE body:', JSON.stringify(body))
    const { type, data } = body
    console.log('Available templates:', Object.keys(templates))
    console.log('Type lookup:', type, !!templates[type])

    if (!type || !templates[type]) {
      return NextResponse.json({ error: 'Unknown email type', type, available: Object.keys(templates) }, { status: 400 })
    }

    const template = templates[type](data)

    // Determine recipient
    let to: string | null = null

    // Admin emails
    if (['deposit_request', 'tx_disputed'].includes(type)) {
      to = await getAdminEmail()
    }
    // Company emails
    else if (data.company_id) {
      to = await getCompanyEmail(data.company_id)
    }
    // Explicit to
    if (data.to) to = data.to

    if (!to) {
      return NextResponse.json({ error: 'No recipient found' }, { status: 400 })
    }

    await transporter.sendMail({
      from: FROM,
      to,
      subject: template.subject,
      html: template.html,
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
