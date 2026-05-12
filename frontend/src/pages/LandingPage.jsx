import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { joinWaitlist } from '../utils/api';

const SLACK_WEBHOOK = process.env.REACT_APP_SLACK_WEBHOOK_URL || '';

const G    = '#1B4332';
const GOLD = '#C8963C';
const STATES = ['Lagos','Abuja','Rivers','Oyo','Kwara','Osun','Ekiti','Enugu','Kano','Kaduna','Ogun','Delta','Ondo','Kogi','Plateau'];

export default function LandingPage() {
  const navigate = useNavigate();
  const [form, setForm]       = useState({ email: '', phone: '', role: '', city: '', state: '' });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const scrollToWaitlist = () => {
    document.getElementById('waitlist').scrollIntoView({ behavior: 'smooth' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.role) { toast.error('Email and role are required.'); return; }
    setLoading(true);
    try {
      await joinWaitlist(form);

      // ── Slack notification ──────────────────────────────────────────
      if (SLACK_WEBHOOK) {
        fetch(SLACK_WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: [
              `🔔 *New SouthSwift Waitlist Signup*`,
              `*Role:* ${form.role.charAt(0).toUpperCase() + form.role.slice(1)}`,
              `*Email:* ${form.email}`,
              `*Phone:* ${form.phone || 'N/A'}`,
              `*City:* ${form.city || 'N/A'}`,
              `*State:* ${form.state || 'N/A'}`,
            ].join('\n'),
          }),
        }).catch(() => {}); // silent fail — never block the user
      }
      // ───────────────────────────────────────────────────────────────

      setSubmitted(true);
      toast.success("You're on the waitlist!");
    } catch (err) {
      toast.error(err.response?.data?.error || 'Something went wrong.');
    }
    setLoading(false);
  };

  return (
    <div style={s.page}>

      {/* ── HERO ── */}
      <section style={s.hero}>
        <div style={s.heroInner}>
          <div style={s.heroTag}>🛡️ SwiftShield Escrow — Every Deal, Every Time</div>
          <h1 style={s.heroTitle}>
            Nigeria's Most Secure<br/>
            <span style={{ color: GOLD }}>Property Platform.</span>
          </h1>
          <p style={s.heroSub}>
            Verified listings, escrow payments, and legal protection — starting in Nigeria's most active hubs, from campus gates to city centres.
          </p>
          <div style={s.heroBtns}>
            <button style={s.btnGold} onClick={scrollToWaitlist}>
              Join the Waitlist →
            </button>
            <button style={s.btnOutline} onClick={() => navigate('/listings')}>
              Browse Listings
            </button>
          </div>
          <div style={s.pills}>
            {['🛡️ SwiftShield Escrow','📋 SwiftDoc Agreements','✅ Verified Agents','👥 Room Sharing'].map(p => (
              <div key={p} style={s.pill}>{p}</div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TRUST / SECURITY BAR ── */}
      <div style={s.trustBar}>
        {[
          ['🔒', 'Escrow Protected', 'Every payment secured'],
          ['✅', 'Verified Agents Only', 'Physical identity checks'],
          ['⚖️', 'Free Legal Support', 'Professional tenancy docs'],
          ['🏛️', 'Registered Entity', 'CAC BN 7310264'],
        ].map(([icon, title, sub]) => (
          <div key={title} style={s.trustItem}>
            <span style={s.trustIcon}>{icon}</span>
            <div>
              <div style={s.trustTitle}>{title}</div>
              <div style={s.trustSub}>{sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── PROBLEM / SOLUTION ── */}
      <section style={s.section}>
        <div style={s.inner}>
          <h2 style={s.sectionTitle}>The Nigerian Rental Market is Broken.</h2>
          <div style={s.painGrid}>
            {[
              ['😤', 'Agents collect rent and disappear', 'You pay, they vanish. No contract, no recourse, no refund.'],
              ['📄', 'No legal agreement. No protection.', 'A handshake and a WhatsApp message is not a tenancy agreement.'],
              ['"Close"', "'Close to campus' means a 25-minute okada ride.", 'Listings are vague by design. Distance is never what they claim.'],
            ].map(([icon, title, body]) => (
              <div key={title} style={s.painCard}>
                <div style={s.painIcon}>{icon}</div>
                <div style={s.painTitle}>{title}</div>
                <div style={s.painBody}>{body}</div>
              </div>
            ))}
          </div>
          <div style={s.solutionBanner}>
            <span style={{ fontSize: 20, marginRight: 10 }}>✅</span>
            <strong style={{ color: G, fontSize: 17 }}>SouthSwift fixes all three.</strong>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section style={{ ...s.section, background: '#F8FAF8' }}>
        <div style={s.inner}>
          <h2 style={s.sectionTitle}>How SwiftShield Works</h2>
          <div style={s.stepsRow}>
            {[
              ['1', '🔍', 'Find a verified listing', 'Browse properties listed only by identity-verified, NIN-checked agents.'],
              ['2', '🛡️', 'Pay into escrow — not to the agent', 'Your rent is held by SouthSwift until you physically confirm the property is as described.'],
              ['3', '✅', 'Confirm move-in. Funds release.', "Once you're satisfied and move in, we release the funds. If something is wrong, you are protected."],
            ].map(([num, icon, title, body]) => (
              <div key={num} style={s.stepCard}>
                <div style={s.stepNum}>{num}</div>
                <div style={s.stepIcon}>{icon}</div>
                <div style={s.stepTitle}>{title}</div>
                <div style={s.stepBody}>{body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES GRID ── */}
      <section style={s.section}>
        <div style={s.inner}>
          <h2 style={s.sectionTitle}>Everything in One Platform</h2>
          <div style={s.featGrid}>
            {[
              ['🛡️', 'SwiftShield Escrow', 'Your rent is held safely until you confirm the property is exactly as listed. If something is wrong, you get your money back.'],
              ['📋', 'SwiftDoc Agreements', 'A legally binding tenancy agreement is auto-generated the moment your payment clears. No lawyer needed. No informal agreements.'],
              ['✅', 'Verified Agents Only', 'Every agent on SouthSwift has been identity-verified. Their NIN, photo, and agency details are on record. Fraud has a face here.'],
              ['👥', 'Room Sharing', 'Students and young professionals can co-rent with SwiftShield protection for each person. Everyone pays their share. Everyone gets a document.'],
            ].map(([icon, title, body]) => (
              <div key={title} style={s.featCard}>
                <div style={s.featIcon}>{icon}</div>
                <div style={s.featTitle}>{title}</div>
                <div style={s.featBody}>{body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── UNIVERSITY BANNER ── */}
      <section style={{ ...s.section, background: G }}>
        <div style={{ ...s.inner, textAlign: 'center' }}>
          <h2 style={{ ...s.sectionTitle, color: 'white', fontFamily: 'Georgia,serif' }}>
            Starting Where Trust Matters Most.
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 16, maxWidth: 660, margin: '0 auto 24px', lineHeight: 1.8 }}>
            We're launching first in Nigeria's highest-demand rental hubs. By solving the rental crisis
            in the country's toughest markets, we're setting a new standard for verified housing that
            will eventually cover every street in Nigeria.
          </p>
          <p style={{ color: GOLD, fontWeight: 700, fontSize: 15, marginBottom: 28, letterSpacing: 0.3 }}>
            Now securing rentals in Ilorin · Ibadan · Ogbomoso · Lagos · Abuja
          </p>
          <div style={s.uniPoints}>
            {[
              ['📍', 'Proximity Search', 'Find homes by landmarks you actually know — not vague directions.'],
              ['🛡️', 'Escrow Safety', 'Your money is only released when you are satisfied with the property.'],
              ['⚖️', 'Legal Peace of Mind', 'Professional tenancy agreements included with every deal.'],
            ].map(([icon, title, body]) => (
              <div key={title} style={s.uniPoint}>
                <span style={{ fontSize: 22 }}>{icon}</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: 'white', marginBottom: 3 }}>{title}</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>{body}</div>
                </div>
              </div>
            ))}
          </div>
          <button style={{ ...s.btnGold, marginTop: 32 }} onClick={scrollToWaitlist}>Get Priority Access →</button>
        </div>
      </section>

      {/* ── WAITLIST FORM ── */}
      <section id="waitlist" style={{ ...s.section, borderTop: `4px solid ${G}` }}>
        <div style={{ ...s.inner, maxWidth: 620 }}>
          <h2 style={{ ...s.sectionTitle, marginBottom: 8 }}>Be First. Join the Waitlist.</h2>
          <p style={{ color: '#666', fontSize: 15, marginBottom: 6, lineHeight: 1.7 }}>
            We're launching soon. Get early access, launch pricing, and first pick of verified listings in your city.
          </p>
          <p style={{ fontSize: 13, color: '#888', marginBottom: 20, fontStyle: 'italic' }}>
            Be the first to know when verified properties in your area go live.
          </p>
          <div style={s.counter}>
            <span style={{ fontSize: 22, marginRight: 8 }}>🚀</span>
            <span>Join <strong style={{ color: G }}>1,000+ users</strong> already on the waitlist</span>
          </div>

          {submitted ? (
            <div style={s.successCard}>
              <div style={s.successIcon}>🎉</div>
              <h3 style={{ color: G, margin: '0 0 8px', fontSize: 20 }}>You're on the list!</h3>
              <p style={{ color: '#444', fontSize: 14, margin: '0 0 20px', lineHeight: 1.7 }}>
                Check your email for a confirmation from ceo@southswift.com.ng<br/>
                We'll notify you the moment SouthSwift launches in your city.
              </p>
              <button style={s.btnGreen} onClick={() => navigate('/listings')}>
                Browse Listings →
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={s.wlForm}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={s.label}>Email Address *</label>
                <input style={s.input} type="email" placeholder="you@example.com"
                  value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
              </div>
              <div>
                <label style={s.label}>Phone Number *</label>
                <input style={s.input} type="tel" placeholder="+234 800 000 0000"
                  value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <label style={s.label}>I am a *</label>
                <select style={s.input} value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))} required>
                  <option value="">Select role...</option>
                  <option value="tenant">Tenant (looking to rent)</option>
                  <option value="agent">Agent (listing properties)</option>
                  <option value="landlord">Landlord (property owner)</option>
                </select>
              </div>
              <div>
                <label style={s.label}>City *</label>
                <input style={s.input} type="text" placeholder="e.g. Ilorin, Lagos, Ibadan"
                  value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
              </div>
              <div>
                <label style={s.label}>State</label>
                <select style={s.input} value={form.state}
                  onChange={e => setForm(f => ({ ...f, state: e.target.value }))}>
                  <option value="">Select state...</option>
                  {STATES.map(st => <option key={st} value={st}>{st}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <button type="submit" style={{ ...s.btnGreen, width: '100%', padding: '14px', fontSize: 15, opacity: loading ? 0.7 : 1 }} disabled={loading}>
                  {loading ? 'Joining...' : 'Get Priority Access →'}
                </button>
                <p style={{ fontSize: 11, color: '#999', textAlign: 'center', marginTop: 10 }}>
                  No spam. We only email when SouthSwift launches in your city.
                </p>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={s.footer}>
        <div style={s.footerInner}>
          <div style={s.footerTop}>
            <div style={s.footerBrand}>
              <div style={s.footerLogo}>South<span style={{ color: GOLD }}>Swift</span></div>
              <div style={s.footerTagline}>Nigeria's Verified Property Transaction Platform</div>
            </div>
            <div style={s.footerCols}>
              <div style={s.footerCol}>
                <div style={s.footerColTitle}>Platform</div>
                <a href="/listings" style={s.footerLink}>Browse Listings</a>
                <a href="#waitlist" style={s.footerLink}
                  onClick={e => { e.preventDefault(); scrollToWaitlist(); }}>
                  Join Waitlist
                </a>
                <a href="/register?role=agent" style={s.footerLink}>For Agents</a>
                <a href="/register?role=landlord" style={s.footerLink}>For Landlords</a>
              </div>
              <div style={s.footerCol}>
                <div style={s.footerColTitle}>Legal</div>
                <a href="/privacy-policy" style={s.footerLink}>Privacy Policy</a>
                <a href="/terms-of-service" style={s.footerLink}>Terms of Service</a>
                <a href="/escrow-policy" style={s.footerLink}>Escrow Policy</a>
              </div>
              <div style={s.footerCol}>
                <div style={s.footerColTitle}>Contact</div>
                <a href="mailto:ceo@southswift.com.ng" style={s.footerLink}>ceo@southswift.com.ng</a>
                <a href="tel:+2348168185692" style={s.footerLink}>+234 816 818 5692</a>
                <a href="https://southswift.com.ng" style={s.footerLink}>southswift.com.ng</a>
              </div>
            </div>
          </div>
          <div style={s.footerBottom}>
            © 2025 SouthSwift Enterprise · CAC BN 7310264 · Built with ❤️ for Nigerian renters
          </div>
        </div>
      </footer>
    </div>
  );
}

const s = {
  page:          { fontFamily: 'Arial,sans-serif', color: '#111' },

  // Hero
  hero:          { background: `radial-gradient(ellipse at 60% 40%, #243B2F 0%, ${G} 50%, #0A1A0A 100%)`,
                   padding: '80px 20px 70px', color: 'white' },
  heroInner:     { maxWidth: 820, margin: '0 auto' },
  heroTag:       { display: 'inline-block', background: 'rgba(200,150,60,0.18)',
                   border: '1px solid rgba(200,150,60,0.45)', color: GOLD,
                   fontSize: 12, fontWeight: 700, padding: '6px 16px',
                   borderRadius: 20, marginBottom: 22, letterSpacing: 0.3 },
  heroTitle:     { fontSize: 52, fontWeight: 900, margin: '0 0 16px', lineHeight: 1.15,
                   fontFamily: 'Georgia,serif' },
  heroSub:       { fontSize: 17, color: 'rgba(255,255,255,0.75)', marginBottom: 36, lineHeight: 1.7 },
  heroBtns:      { display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 40 },
  btnGold:       { background: GOLD, color: 'white', border: 'none', padding: '14px 30px',
                   borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: 15,
                   boxShadow: '0 4px 14px rgba(200,150,60,0.35)' },
  btnOutline:    { background: 'transparent', color: 'white', border: '2px solid rgba(255,255,255,0.5)',
                   padding: '12px 28px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 15 },
  pills:         { display: 'flex', gap: 10, flexWrap: 'wrap' },
  pill:          { background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                   color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: 600,
                   padding: '6px 14px', borderRadius: 20 },

  // Sections
  section:       { padding: '72px 20px', background: 'white' },
  inner:         { maxWidth: 1080, margin: '0 auto' },
  sectionTitle:  { fontSize: 32, fontWeight: 900, color: G, fontFamily: 'Georgia,serif',
                   margin: '0 0 40px', textAlign: 'center' },

  // Pain cards
  painGrid:      { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 20, marginBottom: 32 },
  painCard:      { borderLeft: '4px solid #DC2626', background: '#FFF5F5',
                   borderRadius: 12, padding: '20px 22px' },
  painIcon:      { fontSize: 28, marginBottom: 10 },
  painTitle:     { fontSize: 15, fontWeight: 800, color: '#111', marginBottom: 8 },
  painBody:      { fontSize: 13, color: '#666', lineHeight: 1.7 },
  solutionBanner:{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                   background: '#F0FDF4', border: '1px solid #BBF7D0',
                   borderRadius: 12, padding: '16px 24px' },

  // Steps
  stepsRow:      { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 24 },
  stepCard:      { background: 'white', border: '1px solid #E5E7EB', borderRadius: 16,
                   padding: '28px 24px', textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' },
  stepNum:       { width: 36, height: 36, borderRadius: '50%', background: G, color: 'white',
                   fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center',
                   justifyContent: 'center', margin: '0 auto 14px' },
  stepIcon:      { fontSize: 32, marginBottom: 12 },
  stepTitle:     { fontSize: 15, fontWeight: 800, color: G, marginBottom: 8 },
  stepBody:      { fontSize: 13, color: '#666', lineHeight: 1.7 },

  // Trust bar
  trustBar:      { display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 0,
                   background: 'white', borderBottom: '1px solid #E5E7EB',
                   boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
  trustItem:     { display: 'flex', alignItems: 'center', gap: 12,
                   padding: '18px 32px', borderRight: '1px solid #F3F4F6',
                   flex: '1 1 200px', minWidth: 180 },
  trustIcon:     { fontSize: 26, flexShrink: 0 },
  trustTitle:    { fontSize: 13, fontWeight: 800, color: '#111', marginBottom: 2 },
  trustSub:      { fontSize: 11, color: '#888' },

  // Features
  featGrid:      { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 20 },
  featCard:      { border: `2px solid #E5E7EB`, borderRadius: 16, padding: '24px',
                   transition: 'border-color 0.2s' },
  featIcon:      { fontSize: 36, marginBottom: 12 },
  featTitle:     { fontSize: 16, fontWeight: 800, color: G, marginBottom: 8 },
  featBody:      { fontSize: 13, color: '#555', lineHeight: 1.8 },

  // University banner bullets
  uniPoints:     { display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560, margin: '0 auto' },
  uniPoint:      { display: 'flex', alignItems: 'flex-start', gap: 14, textAlign: 'left',
                   background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '14px 18px' },

  // Waitlist form
  counter:       { display: 'flex', alignItems: 'center', background: '#F0F9F0',
                   border: '1px solid #BBF7D0', borderRadius: 10, padding: '12px 16px',
                   marginBottom: 28, fontSize: 14, color: '#444' },
  wlForm:        { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
                   background: 'white', borderRadius: 16, padding: '28px',
                   border: '1px solid #E5E7EB', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' },
  label:         { display: 'block', fontSize: 12, fontWeight: 700, color: '#444',
                   marginBottom: 5 },
  input:         { width: '100%', border: '1px solid #DDD', borderRadius: 8,
                   padding: '11px 13px', fontSize: 14, boxSizing: 'border-box', outline: 'none' },
  btnGreen:      { background: G, color: 'white', border: 'none', padding: '12px 28px',
                   borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: 14 },
  successCard:   { background: '#F0FDF4', border: '2px solid #BBF7D0', borderRadius: 16,
                   padding: '36px', textAlign: 'center' },
  successIcon:   { fontSize: 48, marginBottom: 14 },

  // Footer
  footer:        { background: G, color: 'white', padding: '56px 20px 28px' },
  footerInner:   { maxWidth: 1080, margin: '0 auto' },
  footerTop:     { display: 'flex', gap: 48, flexWrap: 'wrap', marginBottom: 40,
                   justifyContent: 'space-between' },
  footerBrand:   { maxWidth: 260 },
  footerLogo:    { fontSize: 28, fontWeight: 900, fontFamily: 'Georgia,serif', marginBottom: 8 },
  footerTagline: { fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 },
  footerCols:    { display: 'flex', gap: 48, flexWrap: 'wrap' },
  footerCol:     { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 140 },
  footerColTitle:{ fontSize: 12, fontWeight: 800, color: GOLD, textTransform: 'uppercase',
                   letterSpacing: 1, marginBottom: 4 },
  footerLink:    { fontSize: 13, color: 'rgba(255,255,255,0.6)', textDecoration: 'none', cursor: 'pointer' },
  footerBottom:  { borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 20,
                   fontSize: 12, color: 'rgba(255,255,255,0.45)', textAlign: 'center' },
};
