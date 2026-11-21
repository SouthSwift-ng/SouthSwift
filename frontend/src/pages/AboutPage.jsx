import { useNavigate } from 'react-router-dom';

const G    = '#1B4332';
const GOLD = '#C8963C';

const FEATURES = [
  {
    icon: '✅',
    title: 'Agent checks',
    body: 'Our team checks every agent, landlord, developer and agency before they can list a property. We review their identity and business details, and we are building automated NIN and CAC checks to make this faster and stronger.',
  },
  {
    icon: '🛡️',
    title: 'Escrow-protected payments',
    body: "Your rent is never sent blindly to a stranger's personal account. We hold your payment safely and release it to the agent or landlord only after you move in and confirm.",
  },
  {
    icon: '🧾',
    title: 'Fees shown upfront',
    body: 'You see what you will pay before you pay it. No hidden charges.',
  },
  {
    icon: '🏠',
    title: 'Support after move-in',
    badge: 'Coming soon',
    body: 'We are working on help for the things you need after you move in. We will tell you when it is ready.',
  },
  {
    icon: '🤝',
    title: 'One place for everyone',
    body: 'Independent agents, direct landlords, property developers and established agencies are all welcome, so you can find hostels, apartments and homes in one place.',
  },
];

const STEPS = [
  { num: '01', title: 'Find a listing', body: 'Browse verified listings and chat with the agent or landlord inside SouthSwift.' },
  { num: '02', title: 'Inspect the property', body: 'Visit the property. A small inspection fee applies, shown upfront.' },
  { num: '03', title: 'Pay into escrow', body: 'Pay into escrow, not to a personal account.' },
  { num: '04', title: 'Move in and confirm', body: 'Move in and confirm in the app once everything matches the listing.' },
  { num: '05', title: 'We release payment', body: 'We release the payment to the agent or landlord after you confirm.' },
];

const VALUES = [
  {
    num: '01',
    title: 'Trust First',
    body: 'Trust is our currency. Everything we build, from agent checks to escrow protection, is designed to protect your money and your peace of mind.',
  },
  {
    num: '02',
    title: 'End-to-End Commitment',
    body: "We don't stop at connection. We walk beside you from inspection to key handover.",
  },
  {
    num: '03',
    title: 'Radical Transparency',
    body: 'No hidden charges, no bait-and-switch listings, and no middleman games. What you see on SouthSwift is what you get.',
  },
  {
    num: '04',
    title: 'Inclusive Growth',
    body: 'By welcoming agents, landlords, developers and agencies onto one trusted platform, we help honest property professionals grow while helping everyday Nigerians settle into homes where they can thrive.',
  },
];

const PILLARS = [
  {
    label: 'Our Mission',
    body: 'To reduce fraud and friction in Nigerian real estate by providing a verified, escrow-protected way to rent, which protects property seekers and supports honest agents, landlords, developers and agencies.',
  },
  {
    label: 'Our Vision',
    body: "To become West Africa's most trusted digital real estate platform, growing from university hubs like Ado-Ekiti into major cities across Nigeria and beyond.",
  },
  {
    label: 'Our Purpose',
    body: 'We exist to protect your hard-earned money, restore confidence in property transactions, and make moving into a new home feel like an exciting milestone rather than a stressful risk.',
  },
];

export default function AboutPage() {
  const navigate = useNavigate();

  return (
    <div style={s.page}>

      {/* ── HERO ── */}
      <section style={s.hero}>
        <div style={s.heroInner}>
          <div style={s.badge}>About SouthSwift</div>
          <h1 style={s.heroTitle}>
            Building the trust infrastructure<br />
            for Nigerian real estate.
          </h1>
          <p style={s.heroSub}>
            We are a digital property platform that brings agents, landlords, developers and real estate
            agencies together in one place — and stays with you from your first search to the day you
            collect your house keys.
          </p>
          <div style={s.heroBtns}>
            <button onClick={() => navigate('/listings')} style={s.primaryBtn}>Browse Verified Listings</button>
            <button onClick={() => navigate('/register?role=agent')} style={s.secondaryBtn}>Get Verified as a Professional</button>
          </div>
        </div>
      </section>

      {/* ── STORY ── */}
      <section style={s.section}>
        <div style={s.narrow}>
          <div style={s.eyebrow}>Our Story</div>
          <h2 style={s.h2}>Why we built SouthSwift</h2>
          <p style={s.p}>
            Every lasting solution starts with a painful truth. We built SouthSwift out of firsthand
            experience, after our founder was scammed not once, but three different times while searching
            for accommodation during his NYSC service year in Lafia.
          </p>
          <p style={s.p}>
            We soon realised this wasn't just one person's bad luck. A close friend went through the same
            ordeal in Abuja, and another friend faced the very same scam right here in Ado-Ekiti. Across
            Nigeria, honest people are losing their hard-earned money to unverified middlemen, while
            credible landlords, developers and agencies struggle to stand out from fraudsters.
          </p>
          <p style={s.p}>
            Starting in Ado-Ekiti, Ekiti State, we set out to change that by building a platform where
            trust is built in before a single Naira changes hands.
          </p>
        </div>
      </section>

      {/* ── WHAT WE DO ── */}
      <section style={{ ...s.section, background: '#F8FAF8' }}>
        <div style={s.container}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={s.eyebrow}>What We Do</div>
            <h2 style={s.h2}>Protection at every step</h2>
          </div>
          <div style={s.grid}>
            {FEATURES.map(f => (
              <div key={f.title} style={s.card}>
                <div style={s.cardIcon}>{f.icon}</div>
                <div style={s.cardTitleRow}>
                  <h3 style={s.cardTitle}>{f.title}</h3>
                  {f.badge && <span style={s.pill}>{f.badge}</span>}
                </div>
                <p style={s.cardBody}>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section style={s.section}>
        <div style={s.narrow}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={s.eyebrow}>How It Works</div>
            <h2 style={s.h2}>From search to keys</h2>
          </div>
          <div style={s.steps}>
            {STEPS.map((step, i) => (
              <div key={step.num} style={s.step}>
                <div style={s.stepNum}>{step.num}</div>
                <div>
                  <div style={s.stepTitle}>{step.title}</div>
                  <div style={s.stepBody}>{step.body}</div>
                </div>
                {i < STEPS.length - 1 && <div style={s.stepConnector} />}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── VALUES ── */}
      <section style={{ ...s.section, background: G }}>
        <div style={s.container}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{ ...s.eyebrow, color: GOLD }}>Our Core Values</div>
            <h2 style={{ ...s.h2, color: 'white' }}>What we stand for</h2>
          </div>
          <div style={s.grid}>
            {VALUES.map(v => (
              <div key={v.num} style={s.valueCard}>
                <div style={s.valueNum}>{v.num}</div>
                <h3 style={s.valueTitle}>{v.title}</h3>
                <p style={s.valueBody}>{v.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── MISSION / VISION / PURPOSE ── */}
      <section style={s.section}>
        <div style={s.container}>
          <div style={s.grid}>
            {PILLARS.map(p => (
              <div key={p.label} style={{ ...s.card, borderTop: `4px solid ${GOLD}` }}>
                <div style={s.eyebrow}>{p.label}</div>
                <p style={{ ...s.cardBody, color: '#333' }}>{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHY SOUTHWIFT ── */}
      <section style={{ ...s.section, background: '#F8FAF8' }}>
        <div style={s.narrow}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={s.eyebrow}>Why SouthSwift?</div>
            <h2 style={s.h2}>Where we are going</h2>
          </div>

          <div style={s.qa}>
            <h3 style={s.q}>Where are we going?</h3>
            <p style={s.p}>
              We launched in Ado-Ekiti on 1 August 2026 to serve students, corps members and families who
              rent often. We are starting with housing, the biggest trust moment in most people's lives.
              Once we have earned your trust with your home, we plan to help with the other things you need
              after you move in, such as trusted artisans, utilities and everyday services. We also plan to
              expand to Akure, Ibadan, Lagos and Abuja.
            </p>
          </div>

          <div style={s.qa}>
            <h3 style={s.q}>How are we different?</h3>
            <p style={s.p}>
              Traditional listing sites are digital noticeboards: once you click a listing, you are on your
              own. We check the people who list, hold your payment in escrow until you move in, and show our
              fees upfront.
            </p>
          </div>

          <div style={s.qa}>
            <h3 style={s.q}>Who is behind SouthSwift?</h3>
            <p style={s.p}>
              We are led by Oladeji Ayeni (Founder and CEO) and backed by a dedicated team passionate about
              building reliable African technology.
            </p>
          </div>

          <div style={s.qa}>
            <h3 style={s.q}>Why the name SouthSwift?</h3>
            <p style={s.p}>
              SouthSwift began in the South, in Ado-Ekiti, where we launched on 1 August 2026. But we are
              building for every Nigerian, in every region. "South" is where our journey starts, not where
              it ends. "Swift" is our promise: quick, simple and safe property moves. As we grow into the
              North, East and West, the name travels with us, and so do the same protections: agent checks,
              escrow-protected payments and fees shown upfront.
            </p>
          </div>

          <div style={s.legalCard}>
            <div style={s.legalTitle}>Legally registered</div>
            <p style={s.legalBody}>
              We operate as SouthSwift Enterprise (CAC Business Name Registration No. 7310264). We are
              preparing to upgrade to a limited liability company.
            </p>
          </div>
        </div>
      </section>

      {/* ── NEXT STEP ── */}
      <section style={s.ctaSection}>
        <div style={s.narrow}>
          <h2 style={{ ...s.h2, color: 'white' }}>Take the next step</h2>
          <p style={{ ...s.p, color: 'rgba(255,255,255,0.75)', textAlign: 'center', marginBottom: 36 }}>
            Ready for a safer way to rent, or want to grow with us?
          </p>
          <div style={s.ctaGrid}>
            <div style={s.ctaCard}>
              <div style={s.ctaTitle}>Looking for a home?</div>
              <p style={s.ctaBody}>Browse verified listings today at southswift.com.ng.</p>
              <button onClick={() => navigate('/listings')} style={s.primaryBtn}>Find a Property</button>
            </div>
            <div style={s.ctaCard}>
              <div style={s.ctaTitle}>Agent, landlord, developer or agency?</div>
              <p style={s.ctaBody}>Get verified and connect with serious, ready-to-pay clients.</p>
              <button onClick={() => navigate('/register?role=agent')} style={s.secondaryBtn}>Get Verified</button>
            </div>
            <div style={s.ctaCard}>
              <div style={s.ctaTitle}>Investors and partners</div>
              <p style={s.ctaBody}>To learn about our traction, roadmap and expansion plans, write to our leadership team.</p>
              <a href="mailto:ceo@southswift.com.ng" style={s.secondaryBtn}>ceo@southswift.com.ng</a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

const s = {
  page:      { fontFamily: 'Arial,sans-serif', background: 'white', minHeight: '100vh', color: '#111' },

  hero:      { background: G, padding: '72px 24px' },
  heroInner: { maxWidth: 900, margin: '0 auto', textAlign: 'center' },
  badge:     { display: 'inline-block', background: 'rgba(200,150,60,0.2)', color: GOLD, fontSize: 12,
               fontWeight: 700, padding: '5px 16px', borderRadius: 20, marginBottom: 20,
               border: `1px solid ${GOLD}`, letterSpacing: 0.5 },
  heroTitle: { fontFamily: 'Georgia,serif', fontSize: 44, fontWeight: 900, color: 'white',
               lineHeight: 1.2, margin: '0 0 20px' },
  heroSub:   { fontSize: 16, color: 'rgba(255,255,255,0.75)', lineHeight: 1.8, maxWidth: 660,
               margin: '0 auto 32px' },
  heroBtns:  { display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' },
  primaryBtn:{ background: GOLD, color: 'white', border: 'none', padding: '13px 26px', borderRadius: 8,
               fontSize: 15, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' },
  secondaryBtn:{ background: 'white', color: G, border: '2px solid #DDD', padding: '12px 24px',
                 borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: 'pointer', textDecoration: 'none',
                 display: 'inline-block' },

  section:   { padding: '72px 24px' },
  container: { maxWidth: 1100, margin: '0 auto' },
  narrow:    { maxWidth: 760, margin: '0 auto' },
  eyebrow:   { fontSize: 12, fontWeight: 800, color: GOLD, textTransform: 'uppercase',
               letterSpacing: 1.5, marginBottom: 10 },
  h2:        { fontFamily: 'Georgia,serif', fontSize: 32, fontWeight: 900, margin: '0 0 16px',
               lineHeight: 1.3 },
  p:         { fontSize: 15, color: '#555', lineHeight: 1.85, margin: '0 0 18px' },

  grid:      { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 20 },
  card:      { background: 'white', border: '1px solid #E5E7EB', borderRadius: 14, padding: '26px 22px' },
  cardIcon:  { fontSize: 26, marginBottom: 12 },
  cardTitleRow:{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: 800, margin: 0 },
  cardBody:  { fontSize: 13.5, color: '#666', lineHeight: 1.75, margin: 0 },
  pill:      { background: '#FEF3C7', color: '#92400E', fontSize: 10, fontWeight: 800,
               padding: '2px 8px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: 0.5 },

  steps:     { display: 'flex', flexDirection: 'column', gap: 0 },
  step:      { display: 'flex', alignItems: 'flex-start', gap: 18, position: 'relative',
               paddingBottom: 26 },
  stepNum:   { width: 44, height: 44, borderRadius: '50%', background: G, color: 'white',
               display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
               fontWeight: 800, flexShrink: 0, zIndex: 1 },
  stepTitle: { fontSize: 16, fontWeight: 800, margin: '10px 0 4px' },
  stepBody:  { fontSize: 14, color: '#666', lineHeight: 1.7 },
  stepConnector:{ position: 'absolute', left: 21, top: 44, bottom: 0, width: 2, background: '#E5E7EB' },

  valueCard:{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 14, padding: '26px 22px' },
  valueNum:  { fontSize: 12, fontWeight: 800, color: GOLD, letterSpacing: 1.5, marginBottom: 10 },
  valueTitle:{ fontSize: 17, fontWeight: 800, color: 'white', margin: '0 0 8px' },
  valueBody: { fontSize: 13.5, color: 'rgba(255,255,255,0.7)', lineHeight: 1.75, margin: 0 },

  qa:        { marginBottom: 28 },
  q:         { fontSize: 18, fontWeight: 800, color: G, margin: '0 0 8px' },
  legalCard: { background: '#F0F9F0', border: '1px solid #BBF7D0', borderRadius: 14,
               padding: '22px 24px', marginTop: 8 },
  legalTitle:{ fontSize: 14, fontWeight: 800, color: G, marginBottom: 6 },
  legalBody: { fontSize: 13.5, color: '#4B5563', lineHeight: 1.7, margin: 0 },

  ctaSection:{ background: G, padding: '72px 24px' },
  ctaGrid:   { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 18 },
  ctaCard:   { background: 'white', borderRadius: 14, padding: '24px 22px', textAlign: 'left' },
  ctaTitle:  { fontSize: 15, fontWeight: 800, color: '#111', marginBottom: 8 },
  ctaBody:   { fontSize: 13, color: '#666', lineHeight: 1.7, margin: '0 0 18px' },
};
