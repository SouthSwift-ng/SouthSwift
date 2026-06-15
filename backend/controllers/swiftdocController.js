/**
 * SwiftDoc — AI-Powered Tenancy Agreement Generator
 * Uses Google Gemini to generate legally-worded Nigerian tenancy agreements
 * Converts to PDF via pdfkit, uploads to Cloudinary, emails both parties
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const PDFDocument = require('pdfkit');
const cloudinary  = require('cloudinary').v2;
const { sendEmail } = require('./emailController');
const { escapeHtml } = require('../utils/escapeHtml');
const { Readable } = require('stream');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const G    = '#1B4332';
const GOLD = '#C8963C';

// ── GENERATE AGREEMENT TEXT VIA CLAUDE ────────────────────────────────────────
const generateAgreementText = async ({ deal, listing, tenant, agent }) => {
  const genAI  = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model  = genAI.getGenerativeModel({ model: 'gemini-3.1-pro' }, { timeout: 60000 });

  const moveInDate = deal.move_in_date
    ? new Date(deal.move_in_date).toLocaleDateString('en-NG', { day:'numeric', month:'long', year:'numeric' })
    : 'As agreed';

  const endDate = deal.move_in_date
    ? new Date(new Date(deal.move_in_date).setMonth(
        new Date(deal.move_in_date).getMonth() + (deal.lease_duration_months || 12)
      )).toLocaleDateString('en-NG', { day:'numeric', month:'long', year:'numeric' })
    : 'As agreed';

  const prompt = `You are a Nigerian property law expert. Generate a complete, formal, legally-worded RESIDENTIAL TENANCY AGREEMENT governed by the laws of ${listing.state} State, Nigeria.

TRANSACTION DETAILS:
- SouthSwift Deal ID: ${deal.id}
- SouthSwift SwiftShield Escrow Reference: ${deal.paystack_reference || 'Pending'}
- Agreement Date: ${new Date().toLocaleDateString('en-NG', { day:'numeric', month:'long', year:'numeric' })}

PARTIES:
LANDLORD'S AGENT (acting on behalf of Landlord):
- Name: ${agent.full_name}
- Agency: ${agent.agency_name || 'Independent Agent'}
- Phone: ${agent.phone}
- Email: ${agent.email}
- SouthSwift Verification Status: Verified Agent

TENANT:
- Name: ${tenant.full_name}
- Phone: ${tenant.phone}
- Email: ${tenant.email}

PROPERTY:
- Full Address: ${listing.address}, ${listing.city}, ${listing.state} State, Nigeria
- Property Type: ${listing.property_type || 'Residential Apartment'}
- Bedrooms: ${listing.bedrooms}
- Bathrooms: ${listing.bathrooms}

FINANCIAL TERMS:
- Annual Rent: NGN ${Number(deal.rent_amount).toLocaleString()} (${listing.rent_period === 'monthly' ? 'Monthly' : 'Per Annum'})
- Security Deposit: NGN ${Number(deal.rent_amount).toLocaleString()} (One month equivalent, held in SwiftShield Escrow)
- SouthSwift Service Fee (Paid): NGN ${Number(deal.service_fee_tenant || 0).toLocaleString()} (5% SwiftShield fee)
- Total Paid via Escrow: NGN ${Number(deal.total_paid).toLocaleString()}
- Payment Platform: SouthSwift SwiftShield Escrow (Escrow Reference: ${deal.paystack_reference || 'Pending'})

TENANCY PERIOD:
- Commencement Date: ${moveInDate}
- Termination Date: ${endDate}
- Duration: ${deal.lease_duration_months || 12} months

Generate a complete professional tenancy agreement with ALL of the following numbered sections:
1. PARTIES AND RECITALS
2. DEFINITIONS
3. DEMISE AND TERM
4. RENT AND PAYMENT TERMS
5. SWIFTSHIELD ESCROW PROTECTION (explain that funds are held by SouthSwift until move-in is confirmed)
6. TENANT COVENANTS (obligations of the tenant — at least 10 specific obligations)
7. LANDLORD COVENANTS (obligations of the landlord/agent — at least 8 specific obligations)
8. PROHIBITED USES
9. ALTERATIONS AND IMPROVEMENTS
10. MAINTENANCE AND REPAIRS
11. UTILITIES AND SERVICES
12. INSPECTION RIGHTS
13. ASSIGNMENT AND SUBLETTING
14. TERMINATION AND RENEWAL
15. BREACH AND DEFAULT
16. DISPUTE RESOLUTION (reference SouthSwift SwiftConnect and SwiftShield dispute process)
17. FORCE MAJEURE
18. GOVERNING LAW (${listing.state} State and Federal Republic of Nigeria)
19. ENTIRE AGREEMENT
20. SIGNATURE AND EXECUTION BLOCK

Write in formal legal English. Use proper Nigerian legal conventions. Be thorough and specific. Do not use placeholder text — fill in all details from the transaction data provided. This is a real legal document.`;

  const result = await model.generateContent(prompt);
  return result.response.text();
};

// ── CONVERT TEXT TO PDF ────────────────────────────────────────────────────────
const textToPdfBuffer = ({ agreementText, deal, listing, tenant, agent }) => {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 60, size: 'A4' });
    const chunks = [];

    doc.on('data',  chunk => chunks.push(chunk));
    doc.on('end',   ()    => resolve(Buffer.concat(chunks)));
    doc.on('error', err   => reject(err));

    // ── HEADER ──────────────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 90).fill('#1B4332');

    doc.fontSize(22).font('Helvetica-Bold').fillColor('white')
       .text('SouthSwift', 60, 22, { continued: true })
       .fillColor('#C8963C').text('  |  SwiftDoc');

    doc.fontSize(9).font('Helvetica').fillColor('rgba(255,255,255,0.8)')
       .text('Nigeria\'s Verified Property Transaction Platform  •  SwiftShield Escrow Protected', 60, 52);

    doc.fontSize(8).fillColor('rgba(255,255,255,0.6)')
       .text(`Deal ID: ${deal.id}  •  Generated: ${new Date().toLocaleDateString('en-NG')}`, 60, 68);

    doc.moveDown(4);

    // ── TITLE ────────────────────────────────────────────────────────────────
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#1B4332')
       .text('RESIDENTIAL TENANCY AGREEMENT', { align: 'center' });

    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor('#666')
       .text(`${listing.address}, ${listing.city}, ${listing.state} State`, { align: 'center' });

    doc.moveDown(0.8);

    // ── PARTIES SUMMARY BOX ──────────────────────────────────────────────────
    const boxTop = doc.y;
    doc.rect(60, boxTop, doc.page.width - 120, 80).fill('#F0F9F0');
    doc.rect(60, boxTop, 3, 80).fill('#1B4332');

    doc.fontSize(9).font('Helvetica-Bold').fillColor('#1B4332')
       .text('TENANT', 74, boxTop + 10)
       .font('Helvetica').fillColor('#333')
       .text(tenant.full_name, 74, boxTop + 22)
       .text(tenant.phone, 74, boxTop + 34);

    doc.fontSize(9).font('Helvetica-Bold').fillColor('#1B4332')
       .text("LANDLORD'S AGENT", 260, boxTop + 10)
       .font('Helvetica').fillColor('#333')
       .text(agent.full_name, 260, boxTop + 22)
       .text(agent.agency_name || 'Independent Agent', 260, boxTop + 34);

    doc.fontSize(9).font('Helvetica-Bold').fillColor('#C8963C')
       .text('SWIFTSHIELD ESCROW REF', 74, boxTop + 52)
       .font('Helvetica').fillColor('#333')
       .text(deal.paystack_reference || 'Pending confirmation', 74, boxTop + 64);

    doc.y = boxTop + 90;
    doc.moveDown(1);

    // ── AGREEMENT BODY ────────────────────────────────────────────────────────
    const lines = agreementText.split('\n');
    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) { doc.moveDown(0.4); return; }

      // Section headings — numbered like "1. PARTIES" or "20. SIGNATURE"
      const isHeading = /^\d+\.\s+[A-Z\s\/&]+$/.test(trimmed) || trimmed.startsWith('##');
      const isSubHeading = /^[a-z]\)/.test(trimmed) || /^\([a-z]\)/.test(trimmed) || /^\d+\.\d+/.test(trimmed);

      if (isHeading) {
        if (doc.y > doc.page.height - 120) doc.addPage();
        doc.moveDown(0.8);
        doc.rect(60, doc.y, doc.page.width - 120, 20).fill('#1B4332');
        doc.fontSize(10).font('Helvetica-Bold').fillColor('white')
           .text(trimmed.replace(/^#+\s*/, ''), 68, doc.y - 16);
        doc.moveDown(0.8);
      } else if (isSubHeading) {
        doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#1B4332')
           .text(trimmed, { indent: 20 });
        doc.moveDown(0.2);
      } else {
        doc.fontSize(9.5).font('Helvetica').fillColor('#222')
           .text(trimmed, { align: 'justify', lineGap: 2 });
        doc.moveDown(0.2);
      }
    });

    // ── SIGNATURE BLOCK ────────────────────────────────────────────────────────
    if (doc.y > doc.page.height - 200) doc.addPage();
    doc.moveDown(1.5);

    doc.rect(60, doc.y, doc.page.width - 120, 1).fill('#E5E7EB');
    doc.moveDown(1);

    doc.fontSize(10).font('Helvetica-Bold').fillColor('#1B4332')
       .text('EXECUTION', 60);
    doc.moveDown(0.8);

    // Tenant signature
    doc.fontSize(9).font('Helvetica').fillColor('#333');
    doc.text('SIGNED by the TENANT:', 60);
    doc.moveDown(0.5);
    doc.rect(60, doc.y, 200, 1).fill('#333');
    doc.moveDown(0.3);
    doc.fontSize(8).text(`${tenant.full_name}`, 60).text('Signature & Date', 60);
    doc.moveDown(1);

    // Agent signature
    doc.fontSize(9).font('Helvetica').fillColor('#333');
    doc.text("SIGNED by the LANDLORD'S AGENT:", 60);
    doc.moveDown(0.5);
    doc.rect(60, doc.y, 200, 1).fill('#333');
    doc.moveDown(0.3);
    doc.fontSize(8).text(`${agent.full_name} (${agent.agency_name || 'Agent'})`, 60)
       .text('Signature & Date', 60);

    // ── FOOTER ────────────────────────────────────────────────────────────────
    const footerY = doc.page.height - 50;
    doc.rect(0, footerY - 10, doc.page.width, 60).fill('#1B4332');
    doc.fontSize(7.5).font('Helvetica').fillColor('rgba(255,255,255,0.7)')
       .text(
         `This agreement was generated by SouthSwift SwiftDoc AI  •  SouthSwift Enterprise  •  CAC BN 7310264  •  southswift.com.ng`,
         60, footerY,
         { align: 'center', width: doc.page.width - 120 }
       );

    doc.end();
  });
};

// ── UPLOAD PDF BUFFER TO CLOUDINARY ──────────────────────────────────────────
const uploadPdfToCloudinary = (pdfBuffer, dealId) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder:        'southswift/swiftdocs',
        public_id:     `swiftdoc_${dealId}`,
        resource_type: 'raw',
        format:        'pdf',
        type:          'upload',
      },
      (err, result) => {
        if (err) reject(err);
        else     resolve(result.secure_url);
      }
    );
    const readable = new Readable();
    readable.push(pdfBuffer);
    readable.push(null);
    readable.pipe(uploadStream);
  });
};

// ── MAIN EXPORT ───────────────────────────────────────────────────────────────
const generateSwiftDoc = async ({ deal, listing, tenant, agent }) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      console.warn('⚠️  GEMINI_API_KEY not set — SwiftDoc generation skipped');
      return { url: null, error: 'GEMINI_API_KEY not configured' };
    }

    console.log(`📋 Generating SwiftDoc for deal ${deal.id}...`);

    // 1. Generate agreement text via Claude
    const agreementText = await generateAgreementText({ deal, listing, tenant, agent });
    console.log('✅ Agreement text generated');

    // 2. Convert to PDF
    const pdfBuffer = await textToPdfBuffer({ agreementText, deal, listing, tenant, agent });
    console.log('✅ PDF generated, size:', pdfBuffer.length, 'bytes');

    // 3. Upload to Cloudinary
    const docUrl = await uploadPdfToCloudinary(pdfBuffer, deal.id);
    console.log('✅ SwiftDoc uploaded:', docUrl);

    // 4. Email both parties
    const emailHtml = (name) => `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;">
        <h1 style="color:#1B4332;font-family:Georgia,serif;">South<span style="color:#C8963C;">Swift</span></h1>
        <h2 style="color:#1B4332;">Your SwiftDoc is ready</h2>
        <p style="color:#444;font-size:15px;line-height:1.7;">Hi ${escapeHtml(name)},</p>
        <p style="color:#444;font-size:15px;line-height:1.7;">
          Your AI-generated tenancy agreement for <strong>${escapeHtml(listing.address)}, ${escapeHtml(listing.city)}</strong>
          has been prepared and is ready to download.
        </p>
        <div style="background:#F0F9F0;border-radius:12px;padding:18px 20px;margin:20px 0;">
          <p style="color:#1B4332;font-weight:700;margin:0 0 8px;">Deal Summary</p>
          <p style="color:#555;font-size:13px;margin:4px 0;">Rent: ₦${Number(deal.rent_amount).toLocaleString()}</p>
          <p style="color:#555;font-size:13px;margin:4px 0;">Duration: ${deal.lease_duration_months} months</p>
          <p style="color:#555;font-size:13px;margin:4px 0;">SwiftShield Ref: ${deal.paystack_reference || 'Confirmed'}</p>
        </div>
        <a href="${docUrl}" style="display:inline-block;background:#1B4332;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">
          Download SwiftDoc Agreement
        </a>
        <p style="color:#888;font-size:12px;margin-top:24px;">
          SouthSwift Enterprise  •  CAC BN 7310264  •  ceo@southswift.com.ng
        </p>
      </div>
    `;

    const emailResults = await Promise.allSettled([
      sendEmail({
        to:      tenant.email,
        subject: `📋 Your SwiftDoc Agreement — ${listing.address}`,
        html:    emailHtml(tenant.full_name.split(' ')[0]),
      }),
      sendEmail({
        to:      agent.email,
        subject: `📋 SwiftDoc Ready — ${tenant.full_name} / ${listing.address}`,
        html:    emailHtml(agent.full_name.split(' ')[0]),
      }),
    ]);
    const emailErrors = emailResults
      .map(r => (r.status === 'fulfilled' ? r.value : { ok: false, error: r.reason?.message || 'send failed' }))
      .filter(r => r && !r.ok)
      .map(r => r.error);
    if (emailErrors.length) {
      console.warn('⚠️  SwiftDoc email delivery issue:', emailErrors.join('; '));
    } else {
      console.log('✅ SwiftDoc emails sent to tenant and agent');
    }

    // The document exists and the in-app link works even if email delivery failed,
    // so still return the url — but surface the email problem so it can be recorded.
    return {
      url:   docUrl,
      error: emailErrors.length ? `Doc generated; SwiftDoc email delivery failed: ${emailErrors.join('; ')}` : null,
    };

  } catch (err) {
    console.error('❌ SwiftDoc generation failed:', err.message);
    return { url: null, error: err.message };
  }
};

module.exports = { generateSwiftDoc };
