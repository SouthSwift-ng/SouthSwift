import { useNavigate } from 'react-router-dom';

const G    = '#1B4332';
const GOLD = '#C8963C';

function LegalPage({ title, version, children }) {
  const navigate = useNavigate();
  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.headerInner}>
          <button onClick={() => navigate('/')} style={s.backBtn}>← Back to SouthSwift</button>
          <div style={s.badge}>Legal Document · {version}</div>
          <h1 style={s.title}>{title}</h1>
          <p style={s.meta}>SouthSwift Enterprise · CAC BN 7310264 · Last updated: May 2026</p>
        </div>
      </div>
      <div style={s.body} className="ss-legal-body">
        <div style={s.content}>{children}</div>
        <div style={s.sidebar} className="ss-legal-sidebar">
          <div style={s.sideCard}>
            <div style={s.sideTitle}>Legal Documents</div>
            {[['Privacy Policy','/privacy-policy'],['Terms of Service','/terms-of-service'],['Escrow Policy','/escrow-policy']].map(([label, path]) => (
              <button key={label} onClick={() => navigate(path)}
                style={{ ...s.sideLink, color: window.location.pathname === path ? G : '#555', fontWeight: window.location.pathname === path ? 800 : 400 }}>
                {label}
              </button>
            ))}
          </div>
          <div style={s.sideCard}>
            <div style={s.sideTitle}>Contact</div>
            <p style={{ fontSize: 12, color: '#666', lineHeight: 1.6, margin: '0 0 8px' }}>Legal enquiries:</p>
            <a href="mailto:legal@southswift.com.ng" style={s.contactBtn}>legal@southswift.com.ng</a>
            <a href="mailto:ceo@southswift.com.ng" style={{ ...s.contactBtn, marginTop: 6 }}>ceo@southswift.com.ng</a>
            <a href="tel:+2348168185692" style={{ ...s.contactBtn, marginTop: 6 }}>+234 816 818 5692</a>
          </div>
        </div>
      </div>
    </div>
  );
}

function Sec({ title, children }) {
  return (
    <div style={s.section}>
      <h2 style={s.sectionTitle}>{title}</h2>
      <div>{children}</div>
    </div>
  );
}
function P({ children }) { return <p style={s.p}>{children}</p>; }
function Ul({ items }) { return <ul style={s.ul}>{items.map((item,i) => <li key={i} style={s.li}>{item}</li>)}</ul>; }
function Table({ rows }) {
  return (
    <div style={{ overflowX: 'auto', margin: '14px 0' }}>
      <table style={s.table}>
        <thead>
          <tr>{rows[0].map((h,i) => <th key={i} style={s.th}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.slice(1).map((row, i) => (
            <tr key={i} style={{ background: i%2===0?'white':'#F8FAF8' }}>
              {row.map((cell,j) => <td key={j} style={s.td}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Note({ children }) {
  return <div style={s.note}>{children}</div>;
}

// ── PRIVACY POLICY ────────────────────────────────────────────────────────────
export function PrivacyPolicy() {
  return (
    <LegalPage title="Privacy Policy" version="Version 1.1">
      <Sec title="1. Introduction">
        <P>SouthSwift Enterprise ("SouthSwift", "we", "our", or "us") is committed to protecting your personal information. This Privacy Policy explains how we collect, use, store, share, and protect your data when you use the SouthSwift platform at southswift.com.ng. SouthSwift is registered as a data controller under the Nigeria Data Protection Act 2023 (NDPA 2023) and complies with all applicable Nigerian data protection regulations.</P>
        <P>By using our Platform, you consent to the collection and use of your information in accordance with this policy. If you do not agree, please do not use the Platform.</P>
      </Sec>

      <Sec title="2. Information We Collect">
        <P>We collect the following categories of personal information:</P>
        <Ul items={[
          'Identity data: full name, National Identification Number (NIN), passport photograph, face verification data',
          'Contact data: email address, phone number, home state and city',
          'Financial data: bank account details for agents only, Paystack transaction reference numbers',
          'Property data: listing addresses, uploaded property photographs',
          'Transaction data: deal history, escrow amounts, move-in dates, lease durations, payment confirmations',
          'Compatibility data: lifestyle preference responses submitted through the optional roommate matching questionnaire',
          'Technical data: IP address, browser type, device information, usage logs',
          'Communications: messages sent through SwiftConnect, dispute submissions and supporting evidence',
        ]} />
      </Sec>

      <Sec title="3. How We Use Your Information">
        <P>We use your personal data for the following purposes:</P>
        <Ul items={[
          'To create and manage your SouthSwift account',
          'To verify agent identities using NIN checks and face verification before activating their listings',
          'To process rental payments through our SwiftShield escrow system via Paystack',
          'To generate SwiftDoc tenancy agreements using your deal data',
          'To facilitate roommate matching based on compatibility questionnaire responses',
          'To send transactional emails regarding your deals, listings, disputes, and account activity',
          'To resolve disputes between tenants and agents through our dispute resolution process',
          'To comply with Nigerian law including NIN verification requirements under NIMC regulations and the NDPA 2023',
          'To prevent fraud, detect misrepresentation, and protect all users on the Platform',
          'To send platform updates and launch notifications to users on the waitlist',
          'To analyse aggregated and anonymised transaction trends for improving Platform services',
        ]} />
      </Sec>

      <Sec title="4. NIN Data — Special Protection">
        <P>National Identification Numbers collected from agents are subject to enhanced protection measures:</P>
        <Ul items={[
          'NIN data is stored in encrypted format using industry-standard encryption and is never stored in plain text',
          'Access to NIN data is restricted exclusively to authorised SouthSwift administrators for the purpose of agent identity verification',
          'NIN data is retained for the duration of the agent\'s active account and deleted within 30 days of account closure',
          'NIN data is never shared with any third party except as required by Nigerian law or a valid court order',
          'SouthSwift does not share NIN data with any artificial intelligence system including the AI services used to generate SwiftDoc agreements',
        ]} />
      </Sec>

      <Sec title="5. Data Storage and Security">
        <P>All data is stored securely on Supabase PostgreSQL infrastructure hosted on AWS. Property images and agent documents are stored on Cloudinary's encrypted content delivery network. Security measures include:</P>
        <Ul items={[
          'All passwords are hashed using bcrypt before storage — plain-text passwords are never stored or transmitted',
          'All API communications are encrypted using HTTPS and TLS protocols',
          'Authentication tokens expire after 30 days and are immediately invalidated upon logout',
          'Bank account details are stored only for the purpose of processing agent payouts and are never shared with tenants',
          'Access to the administrative panel requires a separate administrator role',
          'All systems are monitored for unauthorised access attempts',
        ]} />
      </Sec>

      <Sec title="6. Data Sharing">
        <P>We do not sell your personal data to any third party under any circumstances. We share data only as strictly necessary to operate the Platform:</P>
        <Ul items={[
          'Paystack Technologies Limited: payment processing and fund transfers (see paystack.com/privacy)',
          'Cloudinary: document and image storage and delivery',
          'AI services: anonymised deal data excluding identity documents and NIN data is processed solely for generating SwiftDoc tenancy agreements. No personal identity data is shared. Data is not retained for AI training purposes.',
          'Supabase: secure database infrastructure',
          'Nigerian law enforcement, EFCC, NIMC, or courts: only when required by a valid court order or statutory requirement under Nigerian law',
        ]} />
      </Sec>

      <Sec title="7. Data Breach Notification">
        <P>In the event of a data breach affecting your personal information, SouthSwift will:</P>
        <Ul items={[
          'Notify affected users by email within 72 hours of becoming aware of the breach in compliance with the NDPA 2023',
          'Notify the National Information Technology Development Agency (NITDA) within the period required by law',
          'Provide clear information about what data was affected, the likely consequences, and the measures taken',
          'Take immediate steps to contain the breach and prevent further unauthorised access',
        ]} />
      </Sec>

      <Sec title="8. Data Retention">
        <Ul items={[
          'Active account data: retained for the duration of your account',
          'Transaction and deal records: retained for 3 years after the transaction date',
          'Post-account closure: all personal data deleted within 3 years of account closure unless required by Nigerian law',
          'NIN data: deleted within 30 days of account closure',
          'Dispute records: retained for 5 years after resolution',
        ]} />
      </Sec>

      <Sec title="9. Your Rights Under the NDPA 2023">
        <P>As a data subject under the Nigeria Data Protection Act 2023, you have the right to:</P>
        <Ul items={[
          'Access the personal data we hold about you at any time',
          'Request correction of inaccurate or incomplete data',
          'Request deletion of your account and associated personal data, subject to retention requirements',
          'Withdraw consent for marketing communications at any time',
          'Request a copy of your SwiftDoc tenancy agreements',
          'Object to processing of your data for purposes beyond those described in this policy',
        ]} />
        <P>To exercise any of these rights, contact us at legal@southswift.com.ng. We will respond within 30 days.</P>
      </Sec>

      <Sec title="10. Authentication and Session Storage">
        <P>SouthSwift keeps you securely logged in using an authentication token stored locally on your device. This token is automatically deleted when you log out or after 30 days of inactivity. We do not use third-party advertising cookies or tracking tools. We do not serve advertisements on the Platform.</P>
      </Sec>

      <Sec title="11. Children">
        <P>SouthSwift is not intended for users under the age of 18. We do not knowingly collect personal data from minors. If you believe a minor has registered, contact us immediately at legal@southswift.com.ng and we will promptly delete the account and all associated data.</P>
      </Sec>

      <Sec title="12. Changes to This Policy">
        <P>We will notify all registered users by email at least 14 days before material changes take effect. Continued use of the Platform after the effective date of changes constitutes acceptance. The current version is always available at southswift.com.ng/privacy-policy.</P>
      </Sec>

      <Sec title="13. Contact">
        <P>Privacy questions and data rights: legal@southswift.com.ng</P>
        <P>Disputes and escrow: disputes@southswift.com.ng</P>
        <P>General enquiries: ceo@southswift.com.ng · +234 816 818 5692</P>
        <P>SouthSwift Enterprise · CAC BN 7310264 · Federal Republic of Nigeria</P>
      </Sec>
      <Note>This Privacy Policy was last reviewed and updated in May 2026. Version 1.1. SouthSwift is committed to protecting your data and complying fully with the Nigeria Data Protection Act 2023.</Note>
    </LegalPage>
  );
}

// ── TERMS OF SERVICE ──────────────────────────────────────────────────────────
export function TermsOfService() {
  return (
    <LegalPage title="Terms of Service" version="Version 1.1">
      <Sec title="1. Acceptance of Terms">
        <P>By registering for or using the SouthSwift platform (the "Platform"), you agree to be bound by these Terms of Service. If you do not agree, you must not use the Platform. These terms apply to all users including tenants, agents, landlords, and administrators. Your continued use of the Platform after any update to these Terms constitutes acceptance of the updated terms.</P>
      </Sec>

      <Sec title="2. The SouthSwift Platform">
        <P>SouthSwift is a Nigerian property transaction platform that connects tenants with verified agents and landlords. Our core service, SwiftShield, holds rental payments in escrow and releases them only when the tenant confirms a successful move-in. We also provide SwiftDoc (automatically generated tenancy agreements), SwiftCounsel (free access to verified Nigerian property lawyers), and SwiftConnect (monitored in-deal communication).</P>
        <P>SouthSwift is not a real estate agency. We are a technology platform that facilitates property transactions. We do not own, manage, lease, or inspect any property listed on the Platform.</P>
      </Sec>

      <Sec title="3. User Accounts">
        <P>To use most features of the Platform, you must create an account. You agree to:</P>
        <Ul items={[
          'Provide accurate, truthful, and complete information during registration',
          'Keep your password confidential and not share your account with any other person',
          'Notify us immediately at legal@southswift.com.ng of any unauthorised use of your account',
          'Be at least 18 years of age at the time of registration',
          'Not create multiple accounts or impersonate another person or entity',
        ]} />
        <P>SouthSwift reserves the right to suspend or permanently terminate any account found to be in breach of these terms without prior notice.</P>
      </Sec>

      <Sec title="4. Service Fee Structure">
        <P>SouthSwift charges a total service fee of 5% on every completed transaction, split equally at 2.5% from the tenant and 2.5% from the agent or landlord. Neither party bears the full cost.</P>
        <Table rows={[
          ['Transaction Value', 'Tenant Pays', 'Agent Receives', 'SouthSwift Earns'],
          ['NGN 500,000', 'NGN 512,500 (rent + 2.5%)', 'NGN 487,500', 'NGN 25,000'],
          ['NGN 800,000', 'NGN 820,000 (rent + 2.5%)', 'NGN 780,000', 'NGN 40,000'],
          ['NGN 1,500,000', 'NGN 1,537,500 (rent + 2.5%)', 'NGN 1,462,500', 'NGN 75,000'],
          ['NGN 3,000,000', 'NGN 3,075,000 (rent + 2.5%)', 'NGN 2,925,000', 'NGN 150,000'],
        ]} />
        <Note>Transparency commitment: SouthSwift will never charge any fee that is not disclosed to both parties before a deal is initiated. The amounts shown above are the only fees SouthSwift collects. There are no hidden charges.</Note>
      </Sec>

      <Sec title="5. Agents — Specific Terms">
        <P>Agents must complete the SouthSwift verification process before posting any listing. By submitting for verification, you confirm that:</P>
        <Ul items={[
          'The NIN and identity documents submitted are genuine and belong to you personally',
          'You are authorised by the property owner to list and transact on their behalf',
          'All listing information including address, photographs, price, and property condition is accurate and not misleading',
          'You will not accept payments outside the SwiftShield escrow system for any deal initiated on SouthSwift',
          'You will respond to SwiftConnect messages within a reasonable timeframe',
          'You will cooperate fully with SouthSwift in any dispute resolution process and provide evidence when requested',
        ]} />
        <P>Any agent found to have accepted payment outside SwiftShield for a deal initiated on this Platform will be permanently banned without right of appeal and may be reported to the Nigerian Police Force, the EFCC, or other relevant authorities.</P>
      </Sec>

      <Sec title="6. Tenants — Specific Terms">
        <P>By initiating a SwiftShield deal and completing payment, you confirm that:</P>
        <Ul items={[
          'You have inspected or intend to inspect the property before confirming move-in',
          'You understand that confirming move-in triggers the final release of funds to the agent',
          'You will raise any dispute through the platform before or within 24 hours of your move-in date',
          'You will not attempt to reverse a Paystack payment after funds have been legitimately released',
          'You are renting the property for lawful residential purposes only',
        ]} />
      </Sec>

      <Sec title="7. SwiftShield Escrow — Summary">
        <P>When you initiate a deal and complete payment via Paystack, your funds are held securely in SouthSwift's escrow account managed through Paystack Technologies Limited, a company duly licensed by the Central Bank of Nigeria. Full details of the escrow process, dispute resolution, refund policy, and fund release timelines are set out in the SwiftShield Escrow Policy at southswift.com.ng/escrow-policy.</P>
      </Sec>

      <Sec title="8. SwiftDoc Agreements">
        <P>SwiftDoc agreements are generated automatically using deal data at the point of transaction completion. They are drafted in accordance with Nigerian tenancy law and provide a legally structured tenancy record for both parties. Users involved in high-value or complex transactions are advised to seek independent legal advice. Free basic legal guidance is available through SwiftCounsel for all registered users.</P>
      </Sec>

      <Sec title="9. Roommate Matching Service">
        <P>SouthSwift offers an optional roommate matching service for users seeking shared accommodation. Users who opt in agree to complete a compatibility questionnaire. SouthSwift does not guarantee compatibility between matched roommates and is not responsible for interpersonal disputes arising from room share arrangements.</P>
        <P>Where a tenant in a room share arrangement wishes to exit before their lease expiry:</P>
        <Ul items={[
          'Month 1 of lease: 1 month replacement window — verified replacement must be found within 30 days',
          'Month 2 and beyond: 2 month replacement window — verified replacement must be found within 60 days',
        ]} />
        <P>If no replacement is found within the applicable window, the original tenant remains liable for their share of rent for the remainder of the lease unless the landlord provides written agreement to waive this through SwiftConnect.</P>
      </Sec>

      <Sec title="10. Prohibited Conduct">
        <Ul items={[
          'Listing properties you do not have legal authority to rent out',
          'Providing false or misleading listing information including fabricated photographs or incorrect addresses',
          'Attempting to transact outside the SwiftShield escrow system after initiating a deal on the Platform',
          'Harassment, abuse, or threatening behaviour through SwiftConnect or any other channel',
          'Creating fake accounts or submitting fraudulent verification documents',
          'Using the Platform for money laundering, financial fraud, or any illegal purpose',
          'Attempting to access another user\'s account or the administrative panel without authorisation',
          'Sharing another user\'s personal data obtained through the Platform without their consent',
        ]} />
      </Sec>

      <Sec title="11. Force Majeure">
        <P>SouthSwift shall not be liable for any failure or delay in performing its obligations where such failure results from circumstances beyond its reasonable control, including payment processor outages, CBN regulatory changes, acts of government, natural disasters, or widespread network failures.</P>
      </Sec>

      <Sec title="12. Limitation of Liability">
        <Ul items={[
          'The physical condition of any property listed on the Platform',
          'Disputes between tenants and agents that arise entirely outside the Platform',
          'Loss of data due to circumstances beyond our reasonable control',
          'Any indirect, incidental, or consequential damages arising from use of the Platform',
        ]} />
        <P>Our maximum liability to any user for any claim shall not exceed the total service fees paid by that user to SouthSwift in the 12 months preceding the claim. This limitation does not apply in cases of gross negligence or wilful misconduct by SouthSwift.</P>
      </Sec>

      <Sec title="13. Governing Law and Dispute Resolution">
        <P>These Terms of Service are governed by the laws of the Federal Republic of Nigeria. Any disputes arising from these terms shall be subject to the exclusive jurisdiction of Nigerian courts. Before initiating formal legal proceedings, both parties agree to attempt resolution through good faith negotiation for a period of 30 days.</P>
      </Sec>

      <Sec title="14. Contact">
        <P>General enquiries: ceo@southswift.com.ng</P>
        <P>Legal and compliance: legal@southswift.com.ng</P>
        <P>Disputes: disputes@southswift.com.ng</P>
        <P>Phone: +234 816 818 5692</P>
        <P>SouthSwift Enterprise · CAC BN 7310264 · Federal Republic of Nigeria</P>
      </Sec>
      <Note>These Terms of Service were last reviewed and updated in May 2026. Version 1.1. Users will be notified by email of any material changes. Continued use of the Platform after notification constitutes acceptance of updated terms.</Note>
    </LegalPage>
  );
}

// ── ESCROW POLICY ─────────────────────────────────────────────────────────────
export function EscrowPolicy() {
  return (
    <LegalPage title="SwiftShield Escrow Policy" version="Version 1.1">
      <Sec title="1. What is SwiftShield?">
        <P>SwiftShield is SouthSwift's escrow protection system. It ensures that rental payments are never paid directly to an agent or landlord until the tenant has physically inspected the property and confirmed that it matches the listing. SwiftShield protects tenants from fraud and protects agents from false or unfounded disputes. All payment processing is handled exclusively by Paystack Technologies Limited, a company duly licensed by the Central Bank of Nigeria. SouthSwift does not handle, store, or transfer funds directly.</P>
      </Sec>

      <Sec title="2. How the Escrow Flow Works">
        <P>Every SwiftShield deal follows this exact sequence:</P>
        <Ul items={[
          'Step 1: Tenant initiates a deal on the listing page and selects move-in date and lease duration',
          'Step 2: A Paystack payment link is generated for the total amount comprising rent plus 2.5% SouthSwift service fee from the tenant',
          'Step 3: Tenant completes payment via Paystack. Funds are held in SouthSwift\'s dedicated escrow account. Deal status changes to Escrow Held.',
          'Step 4: A SwiftDoc tenancy agreement is automatically generated and emailed to both the tenant and the agent',
          'Step 5: On move-in day, tenant inspects the property',
          'Step 6A — If satisfied: Tenant confirms move-in on the Platform. SouthSwift instructs Paystack to release funds to the agent\'s registered bank account, minus the 2.5% SouthSwift service fee from the agent',
          'Step 6B — If not satisfied: Tenant raises a dispute with a detailed written reason through the deal page. Funds remain locked until the dispute is resolved.',
          'Step 7 — Dispute: SouthSwift reviews the dispute within 48 to 72 business hours and issues a resolution determination',
        ]} />
      </Sec>

      <Sec title="3. Service Fee Structure">
        <P>SouthSwift charges a total service fee of 5% on the rent amount, split equally at 2.5% from the tenant and 2.5% from the agent or landlord.</P>
        <Table rows={[
          ['Transaction Value', 'Tenant Pays', 'Agent Receives', 'SouthSwift Earns'],
          ['NGN 500,000', 'NGN 512,500 (rent + 2.5%)', 'NGN 487,500', 'NGN 25,000'],
          ['NGN 800,000', 'NGN 820,000 (rent + 2.5%)', 'NGN 780,000', 'NGN 40,000'],
          ['NGN 1,500,000', 'NGN 1,537,500 (rent + 2.5%)', 'NGN 1,462,500', 'NGN 75,000'],
          ['NGN 3,000,000', 'NGN 3,075,000 (rent + 2.5%)', 'NGN 2,925,000', 'NGN 150,000'],
        ]} />
        <P>The 2.5% tenant fee is added at the payment stage and is clearly displayed before payment is confirmed. The 2.5% agent fee is deducted from the payout at the point of fund release. For room share deals, the 2.5% fee applies to each individual tenant's share of the rent.</P>
      </Sec>

      <Sec title="4. Fund Release Timeline">
        <P>Once the tenant confirms move-in, SouthSwift instructs Paystack to initiate the transfer to the agent's registered bank account:</P>
        <Ul items={[
          'Same bank transfers: instant to 2 hours',
          'Inter-bank transfers: 2 to 24 hours',
          'Weekends and Nigerian public holidays may extend transfer times',
        ]} />
        <P>SouthSwift will notify both parties by email when the transfer is initiated. If a transfer is delayed beyond 48 hours for reasons within SouthSwift's control, users may contact SouthSwift for assistance.</P>
      </Sec>

      <Sec title="5. Dispute Resolution">
        <P>If a tenant raises a dispute, the following process applies:</P>
        <Ul items={[
          'Tenant submits a detailed written dispute reason through the deal page before or within 24 hours to a week of their confirmed move-in date',
          'SouthSwift acknowledges the dispute within 12 hours of submission',
          'SouthSwift reviews the dispute within 48 to 72 business hours. In complex cases this may extend to 7 business days with written notification to both parties.',
          'Both parties may be contacted for supporting evidence including photographs, messages, and correspondence',
          'SouthSwift issues a resolution determination: full refund to tenant, full release to agent, or proportional split',
          'The resolution determination is communicated to both parties by email',
          'Funds are transferred according to the determination within 24 hours of the decision being issued',
        ]} />
        <P>Either party may request a review of a resolution determination within 48 hours of notification by providing new evidence not previously submitted. The review decision is final.</P>
        <P><strong>Valid grounds for a tenant dispute:</strong></P>
        <Ul items={[
          'Property does not exist at the listed address',
          'Property condition is significantly and materially misrepresented in the listing',
          'Property is already occupied by another tenant at the time of move-in',
          'Agent/Landlord is unreachable and has not provided property access within 48 hours of the confirmed move-in date',
        ]} />
        <P><strong>The following do not constitute valid grounds for dispute:</strong></P>
        <Ul items={[
          'Change of mind or personal preference after viewing',
          'Minor cosmetic differences from listing photographs that do not affect habitability',
          'Disputes about terms not agreed through the Platform',
        ]} />
      </Sec>

      <Sec title="6. Room Share Escrow">
        <P>For room share listings, each tenant pays their individual share into escrow separately. The full rent is released to the agent only when all tenants in the share arrangement have confirmed move-in. If any tenant raises a dispute, their individual share remains locked until resolved. Other confirmed tenants' shares can be released independently.</P>
        <P>Where a tenant in a room share arrangement wishes to exit before their lease expiry date:</P>
        <Ul items={[
          'Month 1 of lease: 1 month replacement window — a verified replacement must be found and approved by the landlord within 30 days',
          'Month 2 and beyond: 2 month replacement window — a verified replacement must be found and approved within 60 days',
        ]} />
        <P>If no replacement is found within the applicable window, the departing tenant remains liable for their share of rent for the remainder of the lease unless the landlord provides written agreement to waive this through SouthSwift.</P>
      </Sec>

      <Sec title="7. Uncontactable Tenant — Ghost Escrow Policy">
        <P>If a tenant completes escrow payment but becomes uncontactable before their confirmed move-in date:</P>
        <Ul items={[
          'Day 7: SouthSwift attempts contact via registered email, phone number, and platform notification',
          'Day 10: Second contact attempt via all registered channels',
          'Day 14: Final contact attempt. If no response is received, the deal is automatically cancelled',
        ]} />
        <P>Upon cancellation, a full refund of the escrow rent amount is initiated to the original payment method. Refunds process within 14 to 28 business days. The 2.5% SouthSwift service fee collected from the tenant is non-refundable in this scenario as verification, SwiftDoc generation, and escrow services have already been performed.</P>
      </Sec>

      <Sec title="8. Refund Policy">
        <P>Refunds are issued only in the following circumstances:</P>
        <Ul items={[
          'A dispute is resolved in the tenant\'s favour by SouthSwift',
          'The agent cancels the deal before the tenant\'s confirmed move-in date',
          'A technical error results in a double payment, verified by SouthSwift',
          'The tenant becomes uncontactable for 14 consecutive days before move-in as described in Section 7',
        ]} />
        <P>Refunds are processed via Paystack back to the original payment method. Processing time is 14 to 28 business days depending on the tenant's bank. The 2.5% SouthSwift service fee is non-refundable once a deal has reached Escrow Held status, except in cases of verified SouthSwift technical error where the full amount including the service fee is refunded.</P>
      </Sec>

      <Sec title="9. Security of Escrow Funds">
        <P>Escrow funds are held in a dedicated SouthSwift escrow account and are not commingled with SouthSwift's operating funds at any time. All payment processing is handled exclusively by Paystack Technologies Limited, which is licensed by the Central Bank of Nigeria and operates PCI-DSS compliant payment infrastructure. SouthSwift does not store card details. All payment data is handled exclusively by Paystack.</P>
        <P>SouthSwift operates its escrow function in accordance with applicable Nigerian laws. In the event that CBN licensing requirements change, SouthSwift will notify users and take all necessary steps to maintain compliance without interruption to existing deals.</P>
      </Sec>

      <Sec title="10. Contact">
        <P>For urgent disputes: +234 816 818 5692</P>
        <P>For legal enquiries: legal@southswift.com.ng</P>
        <P>SouthSwift Enterprise · CAC BN 7310264 · southswift.com.ng</P>
      </Sec>
      <Note>This Escrow Policy was last reviewed and updated in May 2026. Version 1.1. By initiating a SwiftShield deal you confirm you have read and accepted this policy in full.</Note>
    </LegalPage>
  );
}

// ── SHARED STYLES ─────────────────────────────────────────────────────────────
const s = {
  page:         { fontFamily:'Arial,sans-serif', background:'#F8FAF8', minHeight:'80vh' },
  header:       { background:`linear-gradient(135deg,${G} 0%,#0A1A0A 100%)`, padding:'48px 20px 40px' },
  headerInner:  { maxWidth:900, margin:'0 auto' },
  backBtn:      { background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.2)',
                  color:'rgba(255,255,255,0.8)', padding:'6px 16px', borderRadius:20,
                  cursor:'pointer', fontSize:13, marginBottom:20, display:'inline-block' },
  badge:        { display:'inline-block', background:'rgba(200,150,60,0.2)', border:`1px solid ${GOLD}`,
                  color:GOLD, fontSize:11, fontWeight:700, padding:'3px 12px',
                  borderRadius:20, marginBottom:12, textTransform:'uppercase', letterSpacing:1 },
  title:        { fontSize:32, fontWeight:900, color:'white', fontFamily:'Georgia,serif', margin:'0 0 10px' },
  meta:         { fontSize:13, color:'rgba(255,255,255,0.5)', margin:0 },
  body:         { maxWidth:920, margin:'0 auto', padding:'40px 20px', display:'flex', gap:32, alignItems:'flex-start' },
  content:      { flex:1, minWidth:0 },
  sidebar:      { width:220, flexShrink:0, position:'sticky', top:80 },
  sideCard:     { background:'white', borderRadius:12, padding:'18px 20px', border:'1px solid #E5E7EB', marginBottom:16 },
  sideTitle:    { fontSize:11, fontWeight:800, color:G, textTransform:'uppercase', letterSpacing:1, marginBottom:12 },
  sideLink:     { display:'block', fontSize:13, background:'none', border:'none', cursor:'pointer', padding:'5px 0', textAlign:'left', width:'100%' },
  contactBtn:   { display:'block', background:'#F0F9F0', color:G, fontSize:12, fontWeight:700, padding:'8px 12px', borderRadius:8, textDecoration:'none', wordBreak:'break-all' },
  section:      { background:'white', borderRadius:14, padding:'24px 28px', marginBottom:16, border:'1px solid #E5E7EB' },
  sectionTitle: { fontSize:16, fontWeight:800, color:G, margin:'0 0 14px', paddingBottom:10, borderBottom:`2px solid #F0F9F0` },
  p:            { fontSize:14, color:'#444', lineHeight:1.8, margin:'0 0 12px' },
  ul:           { paddingLeft:20, margin:'0 0 12px' },
  li:           { fontSize:14, color:'#444', lineHeight:1.8, marginBottom:6 },
  table:        { width:'100%', borderCollapse:'collapse', fontSize:13 },
  th:           { background:G, color:'white', padding:'10px 14px', textAlign:'left', fontWeight:700 },
  td:           { padding:'10px 14px', borderBottom:'1px solid #E5E7EB', color:'#333' },
  note:         { background:'#F0F9F0', border:'1px solid #BBF7D0', borderRadius:10, padding:'14px 18px',
                  fontSize:13, color:'#166534', lineHeight:1.7, margin:'16px 0 0', fontStyle:'italic' },
};
