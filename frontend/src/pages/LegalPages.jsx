import { useNavigate } from 'react-router-dom';

const G    = '#1B4332';
const GOLD = '#C8963C';

// ── SHARED LAYOUT ─────────────────────────────────────────────────────────────
function LegalPage({ title, lastUpdated, children }) {
  const navigate = useNavigate();
  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerInner}>
          <button onClick={() => navigate('/')} style={s.backBtn}>← Back to SouthSwift</button>
          <div style={s.badge}>Legal Document</div>
          <h1 style={s.title}>{title}</h1>
          <p style={s.meta}>
            SouthSwift Enterprise &nbsp;·&nbsp; CAC BN 7310264 &nbsp;·&nbsp;
            Last updated: {lastUpdated}
          </p>
        </div>
      </div>

      {/* Body */}
      <div style={s.body} className="ss-legal-body">
        <div style={s.content}>
          {children}
        </div>

        {/* Sidebar */}
        <div style={s.sidebar} className="ss-legal-sidebar">
          <div style={s.sideCard}>
            <div style={s.sideTitle}>Legal Documents</div>
            {[
              ['Privacy Policy',    '/privacy-policy'],
              ['Terms of Service',  '/terms-of-service'],
              ['Escrow Policy',     '/escrow-policy'],
            ].map(([label, path]) => (
              <button key={label} onClick={() => navigate(path)}
                style={{ ...s.sideLink, color: window.location.pathname === path ? G : '#555',
                         fontWeight: window.location.pathname === path ? 800 : 400 }}>
                {label}
              </button>
            ))}
          </div>
          <div style={s.sideCard}>
            <div style={s.sideTitle}>Questions?</div>
            <p style={{ fontSize: 13, color: '#666', lineHeight: 1.6, margin: '0 0 12px' }}>
              Contact our legal team for any questions about these documents.
            </p>
            <a href="mailto:ceo@southswift.com.ng" style={s.contactBtn}>
              ceo@southswift.com.ng
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={s.section}>
      <h2 style={s.sectionTitle}>{title}</h2>
      <div style={s.sectionBody}>{children}</div>
    </div>
  );
}

function P({ children }) {
  return <p style={s.p}>{children}</p>;
}

function Ul({ items }) {
  return (
    <ul style={s.ul}>
      {items.map((item, i) => <li key={i} style={s.li}>{item}</li>)}
    </ul>
  );
}

// ── PRIVACY POLICY ────────────────────────────────────────────────────────────
export function PrivacyPolicy() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated="12 May 2026">
      <Section title="1. Introduction">
        <P>SouthSwift Enterprise ("SouthSwift", "we", "our", or "us") is committed to protecting your personal information. This Privacy Policy explains how we collect, use, store, and protect data when you use the SouthSwift platform at southswift.com.ng.</P>
        <P>By using our platform, you agree to the collection and use of information in accordance with this policy. If you do not agree, please do not use the platform.</P>
      </Section>

      <Section title="2. Information We Collect">
        <P>We collect the following categories of personal information:</P>
        <Ul items={[
          'Identity data: full name, National Identification Number (NIN), photograph',
          'Contact data: email address, phone number, home state and city',
          'Financial data: bank account details (agents only), Paystack transaction references',
          'Property data: listing addresses, uploaded property photographs',
          'Transaction data: deal history, escrow amounts, move-in dates, lease durations',
          'Technical data: IP address, browser type, device information, usage logs',
          'Communications: messages sent through SwiftConnect, dispute submissions',
        ]} />
      </Section>

      <Section title="3. How We Use Your Information">
        <P>We use your personal data for the following purposes:</P>
        <Ul items={[
          'To create and manage your SouthSwift account',
          'To verify agent identities before activating their listings',
          'To process rental payments through our SwiftShield escrow system',
          'To generate SwiftDoc tenancy agreements using your deal data',
          'To send transactional emails regarding your deals, listings, and account',
          'To resolve disputes between tenants and agents',
          'To comply with Nigerian law, including the NIN verification requirement',
          'To prevent fraud and protect users on the platform',
          'To send platform updates and launch notifications (waitlist only)',
        ]} />
      </Section>

      <Section title="4. Data Storage and Security">
        <P>All data is stored securely on Supabase (PostgreSQL) hosted on AWS infrastructure within a secure environment. Property images and agent documents are stored on Cloudinary's encrypted CDN.</P>
        <P>We implement the following security measures:</P>
        <Ul items={[
          'All passwords are hashed using bcrypt before storage — we never store plain-text passwords',
          'All API communications are encrypted using HTTPS/TLS',
          'JWT tokens expire after 30 days and are invalidated on logout',
          'Bank account details are stored only for the purpose of processing agent payouts',
          'Access to the admin panel requires a separate admin role — standard users cannot access it',
        ]} />
      </Section>

      <Section title="5. Data Sharing">
        <P>We do not sell your personal data to third parties. We share data only as necessary to operate the platform:</P>
        <Ul items={[
          'Paystack: payment processing and fund transfers (see paystack.com/privacy)',
          'Cloudinary: document and image storage',
          'Anthropic (Claude AI): deal data is sent to generate SwiftDoc tenancy agreements — no data is retained by Anthropic for training purposes',
          'Supabase: database infrastructure',
          'Law enforcement: if required by Nigerian law or court order',
        ]} />
      </Section>

      <Section title="6. Your Rights">
        <P>As a user of SouthSwift, you have the right to:</P>
        <Ul items={[
          'Access the personal data we hold about you',
          'Request correction of inaccurate data',
          'Request deletion of your account and associated data',
          'Withdraw consent for marketing communications at any time',
          'Request a copy of your SwiftDoc agreements',
        ]} />
        <P>To exercise any of these rights, contact us at ceo@southswift.com.ng.</P>
      </Section>

      <Section title="7. Cookies">
        <P>SouthSwift uses browser localStorage (not cookies) to store your authentication token. No third-party tracking cookies are used. We do not serve advertisements.</P>
      </Section>

      <Section title="8. Children">
        <P>SouthSwift is not intended for users under the age of 18. We do not knowingly collect data from minors. If you believe a minor has registered, contact us immediately.</P>
      </Section>

      <Section title="9. Changes to This Policy">
        <P>We may update this Privacy Policy from time to time. We will notify registered users by email when material changes are made. Continued use of the platform after changes constitutes acceptance.</P>
      </Section>

      <Section title="10. Contact">
        <P>For any privacy-related questions: ceo@southswift.com.ng · +234 816 818 5692</P>
        <P>SouthSwift Enterprise · CAC BN 7310264 · southswift.com.ng</P>
      </Section>
    </LegalPage>
  );
}

// ── TERMS OF SERVICE ──────────────────────────────────────────────────────────
export function TermsOfService() {
  return (
    <LegalPage title="Terms of Service" lastUpdated="12 May 2026">
      <Section title="1. Acceptance of Terms">
        <P>By registering for or using the SouthSwift platform ("Platform"), you agree to be bound by these Terms of Service. If you do not agree, you must not use the Platform. These terms apply to all users — tenants, agents, landlords, and administrators.</P>
      </Section>

      <Section title="2. The SouthSwift Platform">
        <P>SouthSwift is a Nigerian property transaction platform that connects tenants with verified agents and landlords. Our core service, SwiftShield, holds rental payments in escrow and releases them only when the tenant confirms a successful move-in. We also provide SwiftDoc (AI-generated tenancy agreements) and SwiftConnect (in-deal communication).</P>
        <P>SouthSwift is not a real estate agency. We are a technology platform that facilitates property transactions. We do not own, manage, or inspect any property listed on the platform.</P>
      </Section>

      <Section title="3. User Accounts">
        <P>To use most features of the platform, you must create an account. You agree to:</P>
        <Ul items={[
          'Provide accurate, truthful, and complete information during registration',
          'Keep your password confidential and not share your account',
          'Notify us immediately of any unauthorised use of your account',
          'Be at least 18 years of age',
          'Not create multiple accounts or impersonate another person',
        ]} />
      </Section>

      <Section title="4. Agents — Specific Terms">
        <P>Agents must complete the SouthSwift verification process before posting listings. By submitting for verification, you confirm that:</P>
        <Ul items={[
          'The NIN and identity documents submitted are genuine and belong to you',
          'You are authorised by the property owner to list and transact on their behalf',
          'All listing information (address, photos, price, condition) is accurate',
          'You will not accept payments outside the SwiftShield escrow system for deals initiated on SouthSwift',
          'You will respond to SwiftConnect messages within a reasonable timeframe',
          'You will cooperate with SouthSwift in any dispute resolution process',
        ]} />
        <P>SouthSwift reserves the right to suspend or permanently ban any agent found to have committed fraud, misrepresentation, or any violation of these terms.</P>
      </Section>

      <Section title="5. Tenants — Specific Terms">
        <P>By initiating a SwiftShield deal, you confirm that:</P>
        <Ul items={[
          'You have inspected or intend to inspect the property before confirming move-in',
          'You understand that confirming move-in triggers irreversible fund release to the agent',
          'You will use the dispute function before confirming move-in if there is any issue with the property',
          'You will not attempt to reverse a Paystack payment after funds have been legitimately released',
        ]} />
      </Section>

      <Section title="6. SwiftShield Escrow — How It Works">
        <P>When you initiate a deal and complete payment via Paystack, your funds are held in SouthSwift's escrow account. The funds are released to the agent only when:</P>
        <Ul items={[
          'The tenant confirms move-in through the platform, OR',
          'SouthSwift admin resolves a dispute in favour of the agent',
        ]} />
        <P>Funds are returned to the tenant only when SouthSwift admin resolves a dispute in favour of the tenant. SouthSwift charges a 5% service fee on the rent amount — 5% collected from the tenant at payment time, and 5% deducted from the agent payout.</P>
      </Section>

      <Section title="7. SwiftDoc Agreements">
        <P>SwiftDoc agreements are AI-generated using deal data and are intended to provide a legally structured tenancy record. While drafted in accordance with Nigerian tenancy law, SouthSwift does not warrant that SwiftDoc documents are legally sufficient for all purposes in all jurisdictions. Users are advised to seek independent legal advice for high-value transactions.</P>
      </Section>

      <Section title="8. Prohibited Conduct">
        <P>The following are strictly prohibited on the platform:</P>
        <Ul items={[
          'Listing properties you do not have authority to rent out',
          'Providing false or misleading listing information, including fake photographs',
          'Attempting to transact outside the SwiftShield escrow system after initiating a deal',
          'Harassment, abuse, or threatening behaviour through SwiftConnect',
          'Creating fake accounts or submitting fraudulent verification documents',
          'Using the platform for money laundering or any illegal purpose',
          'Attempting to access another user\'s account or the admin panel without authorisation',
        ]} />
      </Section>

      <Section title="9. Limitation of Liability">
        <P>SouthSwift is not liable for:</P>
        <Ul items={[
          'The physical condition of any property listed on the platform',
          'Disputes between tenants and agents that arise outside the platform',
          'Loss of data due to circumstances beyond our reasonable control',
          'Any indirect, incidental, or consequential damages arising from use of the platform',
        ]} />
        <P>Our maximum liability to any user for any claim shall not exceed the total service fees paid by that user in the 12 months preceding the claim.</P>
      </Section>

      <Section title="10. Governing Law">
        <P>These Terms of Service are governed by the laws of the Federal Republic of Nigeria. Any disputes arising from these terms shall be subject to the jurisdiction of Nigerian courts.</P>
      </Section>

      <Section title="11. Contact">
        <P>For any questions about these Terms: ceo@southswift.com.ng · +234 816 818 5692</P>
        <P>SouthSwift Enterprise · CAC BN 7310264 · southswift.com.ng</P>
      </Section>
    </LegalPage>
  );
}

// ── ESCROW POLICY ─────────────────────────────────────────────────────────────
export function EscrowPolicy() {
  return (
    <LegalPage title="SwiftShield Escrow Policy" lastUpdated="12 May 2026">
      <Section title="1. What is SwiftShield?">
        <P>SwiftShield is SouthSwift's escrow protection system. It ensures that rental payments are never paid directly to an agent or landlord until the tenant has physically inspected the property and confirmed that it matches the listing. This protects tenants from fraud and protects agents from false disputes.</P>
      </Section>

      <Section title="2. How the Escrow Flow Works">
        <P>Every SwiftShield deal follows this exact sequence:</P>
        <Ul items={[
          'Step 1 — Tenant initiates a deal on the listing page and selects move-in date and lease duration',
          'Step 2 — A Paystack payment link is generated for the total amount (rent + 5% SouthSwift fee)',
          'Step 3 — Tenant completes payment via Paystack. Funds are held in SouthSwift\'s escrow account',
          'Step 4 — Deal status changes to "Escrow Held". A SwiftDoc agreement is automatically generated and emailed to both parties',
          'Step 5 — On move-in day, tenant inspects the property',
          'Step 6A — If satisfied: tenant confirms move-in on the platform. SouthSwift releases funds to the agent\'s bank account via Paystack Transfer, minus the 5% SouthSwift fee',
          'Step 6B — If not satisfied: tenant raises a dispute with a detailed reason. Funds remain locked',
          'Step 7 (Dispute) — SouthSwift reviews the dispute within 24 hours and makes a binding decision',
        ]} />
      </Section>

      <Section title="3. Service Fees">
        <P>SouthSwift charges a 5% service fee on the rent amount. This fee covers escrow management, SwiftDoc generation, identity verification infrastructure, and platform operations.</P>
        <Ul items={[
          'Tenant pays: rent amount + 5% (e.g. ₦800,000 rent = ₦840,000 total)',
          'Agent receives: rent amount − 5% (e.g. ₦800,000 rent = ₦760,000 payout)',
          'SouthSwift earns: 5% from tenant + 5% from agent = 10% of transaction value total',
          'For room share deals, the 5% fee applies to each individual tenant\'s share',
        ]} />
      </Section>

      <Section title="4. Fund Release Timeline">
        <P>Once the tenant confirms move-in, SouthSwift initiates the Paystack Transfer to the agent's registered bank account. Transfer times depend on the receiving bank:</P>
        <Ul items={[
          'Same bank transfers: instant to 2 hours',
          'Inter-bank transfers: 2 to 24 hours',
          'Weekends and public holidays may extend transfer times',
          'SouthSwift will notify both parties by email when the transfer is initiated',
        ]} />
      </Section>

      <Section title="5. Dispute Resolution">
        <P>If a tenant raises a dispute, the following process applies:</P>
        <Ul items={[
          'Tenant submits a detailed dispute reason through the deal page',
          'SouthSwift admin reviews the dispute within 24 hours',
          'Both parties may be contacted for evidence (photographs, messages, etc.)',
          'SouthSwift makes a binding decision: refund to tenant, release to agent, or split',
          'The decision is final and communicated to both parties by email',
          'Funds are transferred according to the decision within 24 hours of resolution',
        ]} />
        <P>Valid grounds for a tenant dispute include: property does not exist at the listed address, property condition significantly misrepresented in listing, property already occupied by another tenant, agent unreachable after payment.</P>
        <P>Invalid grounds for dispute: change of mind, personal preference, minor cosmetic differences from photographs.</P>
      </Section>

      <Section title="6. Room Share Escrow">
        <P>For room share listings, each tenant pays their individual share into escrow separately. The full rent is released to the agent only when ALL tenants in the share arrangement have confirmed move-in. If any tenant raises a dispute, their individual share remains locked until resolved, while other tenants' shares can still be released independently.</P>
      </Section>

      <Section title="7. Refund Policy">
        <P>Refunds are issued only in the following circumstances:</P>
        <Ul items={[
          'A dispute is resolved in the tenant\'s favour by SouthSwift admin',
          'The agent cancels the deal before the tenant\'s move-in date',
          'A technical error results in double payment (verified by SouthSwift)',
        ]} />
        <P>Refunds are processed via Paystack back to the original payment method. Processing time is 5-10 business days depending on the tenant's bank.</P>
        <P>The 5% SouthSwift service fee is non-refundable once a deal has reached "Escrow Held" status, except in cases of SouthSwift technical error.</P>
      </Section>

      <Section title="8. Security of Escrow Funds">
        <P>Escrow funds are held in a dedicated SouthSwift account and are not commingled with SouthSwift's operating funds. All payment processing is handled by Paystack, which is licensed by the Central Bank of Nigeria (CBN). SouthSwift does not store card details — all payment data is handled exclusively by Paystack's PCI-DSS compliant infrastructure.</P>
      </Section>

      <Section title="9. Contact">
        <P>For escrow-related questions or urgent disputes: ceo@southswift.com.ng · +234 816 818 5692</P>
        <P>SouthSwift Enterprise · CAC BN 7310264 · southswift.com.ng</P>
      </Section>
    </LegalPage>
  );
}

// ── SHARED STYLES ─────────────────────────────────────────────────────────────
const s = {
  page:         { fontFamily: 'Arial, sans-serif', background: '#F8FAF8', minHeight: '80vh' },
  header:       { background: `linear-gradient(135deg, ${G} 0%, #0A1A0A 100%)`, padding: '48px 20px 40px' },
  headerInner:  { maxWidth: 900, margin: '0 auto' },
  backBtn:      { background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                  color: 'rgba(255,255,255,0.8)', padding: '6px 16px', borderRadius: 20,
                  cursor: 'pointer', fontSize: 13, marginBottom: 20, display: 'inline-block' },
  badge:        { display: 'inline-block', background: 'rgba(200,150,60,0.2)',
                  border: `1px solid ${GOLD}`, color: GOLD,
                  fontSize: 11, fontWeight: 700, padding: '3px 12px',
                  borderRadius: 20, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 },
  title:        { fontSize: 32, fontWeight: 900, color: 'white',
                  fontFamily: 'Georgia, serif', margin: '0 0 10px' },
  meta:         { fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: 0 },
  body:         { maxWidth: 900, margin: '0 auto', padding: '40px 20px',
                  display: 'flex', gap: 32, alignItems: 'flex-start' },
  content:      { flex: 1, minWidth: 0 },
  sidebar:      { width: 220, flexShrink: 0, position: 'sticky', top: 80 },
  sideCard:     { background: 'white', borderRadius: 12, padding: '18px 20px',
                  border: '1px solid #E5E7EB', marginBottom: 16 },
  sideTitle:    { fontSize: 11, fontWeight: 800, color: G, textTransform: 'uppercase',
                  letterSpacing: 1, marginBottom: 12 },
  sideLink:     { display: 'block', fontSize: 13, color: '#555', background: 'none',
                  border: 'none', cursor: 'pointer', padding: '5px 0',
                  textAlign: 'left', width: '100%' },
  contactBtn:   { display: 'block', background: '#F0F9F0', color: G,
                  fontSize: 12, fontWeight: 700, padding: '8px 12px',
                  borderRadius: 8, textDecoration: 'none', wordBreak: 'break-all' },
  section:      { background: 'white', borderRadius: 14, padding: '24px 28px',
                  marginBottom: 16, border: '1px solid #E5E7EB' },
  sectionTitle: { fontSize: 16, fontWeight: 800, color: G,
                  margin: '0 0 14px', paddingBottom: 10,
                  borderBottom: `2px solid #F0F9F0` },
  sectionBody:  {},
  p:            { fontSize: 14, color: '#444', lineHeight: 1.8, margin: '0 0 12px' },
  ul:           { paddingLeft: 20, margin: '0 0 12px' },
  li:           { fontSize: 14, color: '#444', lineHeight: 1.8, marginBottom: 6 },
};
