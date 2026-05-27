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
  const [form, setForm]           = useState({ email:'', phone:'', role:'', city:'', state:'' });
  const [loading, setLoading]     = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [searchQuery, setSearch]  = useState('');
  const [searchType, setSearchType] = useState('Rent');

  const scrollToWaitlist = () =>
    document.getElementById('waitlist').scrollIntoView({ behavior: 'smooth' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.role) { toast.error('Email and role are required.'); return; }
    setLoading(true);
    try {
      await joinWaitlist(form);
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
        }).catch(() => {});
      }
      setSubmitted(true);
      toast.success("You're on the waitlist!");
    } catch (err) {
      toast.error(err.response?.data?.error || 'Something went wrong.');
    }
    setLoading(false);
  };

  return (
    <div style={s.page}>

      {/* ── NAVBAR ── */}
      <nav style={s.nav}>
        <div style={s.navInner}>
          <span style={s.navLogo}>SouthSwift</span>
          <div style={s.navLinks} className="ss-desktop">
            <a href="/listings" style={s.navLink}>Find a Property</a>
            <a href="/register?role=agent" style={s.navLink}>List a Property</a>
            <button onClick={() => document.getElementById('how-it-works').scrollIntoView({behavior:'smooth'})} style={s.navLinkBtn}>How It Works</button>
            <a href="/register?role=agent" style={s.navLink}>For Agents</a>
            <button onClick={() => document.getElementById('escrow').scrollIntoView({behavior:'smooth'})} style={s.navLinkBtn}>Security &amp; Escrow</button>
          </div>
          <a href="/login" style={s.signInBtn}>Sign In</a>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={s.hero}>
        <div style={s.heroInner}>

          {/* Left */}
          <div style={s.heroLeft}>
            <h1 style={s.heroTitle}>
              Rent Property<br/>
              Without Risk. Your<br/>
              Money Is Protected.
            </h1>
            <p style={s.heroSub}>
              A secure rental platform with escrow protection, verified listings, and digital legal agreements.
            </p>
            <div style={s.heroBtns}>
              <button onClick={() => navigate('/listings')} style={s.heroBtnPrimary}>Find a Property</button>
              <button onClick={() => navigate('/register?role=agent')} style={s.heroBtnSecondary}>List a Property</button>
            </div>
          </div>

          {/* Right — photo + floating cards */}
          <div style={s.heroRight}>
            <div style={s.heroImgWrap}>
              <img
                src="https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800&q=80"
                alt="Property"
                style={s.heroImg}
                onError={e => { e.target.style.display='none'; }}
              />
              {/* Lawyer badge — top right */}
              <div style={s.lawyerBadge}>
                <div style={s.lawyerAvatar}>AR</div>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:'#111' }}>Aaron R.</div>
                  <div style={{ fontSize:11, color:'#22C55E', fontWeight:600 }}>Certified lawyer</div>
                </div>
              </div>
              {/* Feature pills — bottom left, stacked vertically */}
              <div style={s.heroPills}>
                {[
                  { icon:'⚖️', title:'Legal Support',       sub:'In-app lawyers' },
                  { icon:'💬', title:'In-App Chat & Calls', sub:'Direct communication' },
                  { icon:'🧾', title:'No illegal fees',     sub:'Transparent paywall' },
                ].map(p => (
                  <div key={p.title} style={s.heroPill}>
                    <span style={{ fontSize:18 }}>{p.icon}</span>
                    <div>
                      <div style={{ fontSize:12, fontWeight:700, color:'#111' }}>{p.title}</div>
                      <div style={{ fontSize:11, color:'#666' }}>{p.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── TRUST BAR ── */}
      <div style={s.trustBar}>
        <div style={s.trustBarInner}>
          {[
            { icon:'🔒', title:'Secure payments',     sub:'Escrow-based' },
            { icon:'📋', title:'Transparent terms',   sub:'No hidden conditions' },
            { icon:'✅', title:'No unverified agents',sub:'KYC for all agents' },
            { icon:'📄', title:'No paper contracts',  sub:'Do all online' },
          ].map(t => (
            <div key={t.title} style={s.trustItem}>
              <span style={{ fontSize:22 }}>{t.icon}</span>
              <div>
                <div style={s.trustTitle}>{t.title}</div>
                <div style={s.trustSub}>{t.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── SEARCH + MAP ── */}
      <section style={s.searchSection}>
        <div style={s.searchInner}>

          {/* Map placeholder */}
          <div style={s.mapWrap}>
            <div style={s.mapPlaceholder}>
              <div style={s.mapOverlay}>
                <div style={{ textAlign:'center', color:'#555' }}>
                  <div style={{ fontSize:32, marginBottom:8 }}>🗺️</div>
                  <div style={{ fontSize:13, fontWeight:600 }}>Nigeria Property Map</div>
                  <div style={{ fontSize:11, color:'#888', marginTop:4 }}>Live map loads with listings</div>
                </div>
                {/* City bubbles */}
                {[
                  { label:'3K+', top:'52%', left:'36%' },
                  { label:'2K',  top:'58%', left:'46%' },
                  { label:'1.9K',top:'62%', left:'52%' },
                  { label:'829', top:'20%', left:'30%' },
                  { label:'1.4K',top:'18%', left:'50%' },
                  { label:'738', top:'30%', left:'28%' },
                  { label:'472', top:'44%', left:'22%' },
                  { label:'103', top:'36%', left:'54%' },
                  { label:'125', top:'58%', left:'68%' },
                  { label:'77',  top:'76%', left:'18%' },
                ].map((b,i) => (
                  <div key={i} style={{ ...s.mapBubble, top:b.top, left:b.left }}>
                    {b.label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Search panel */}
          <div style={s.searchPanel}>
            <h2 style={s.searchTitle}>Find property in Nigeria</h2>

            {/* Search bar */}
            <div style={s.searchBar}>
              <div style={s.searchTypeToggle}>
                {['Rent','Buy'].map(t => (
                  <button key={t}
                    onClick={() => setSearchType(t)}
                    style={{ ...s.typeBtn, ...(searchType===t ? s.typeBtnActive : {}) }}>
                    {t}
                  </button>
                ))}
              </div>
              <input
                style={s.searchInput}
                placeholder="Enter an address, city or ZIP code"
                value={searchQuery}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key==='Enter' && navigate(`/listings?city=${searchQuery}`)}
              />
              <button
                style={s.searchBtn}
                onClick={() => navigate(`/listings?city=${searchQuery}`)}>
                🔍
              </button>
            </div>

            <div style={s.searchMeta}>
              <span style={{ color:'#555', fontSize:13 }}>9,238 rentals available</span>
              <span style={{ color:'#888', fontSize:13 }}>Newest first</span>
            </div>

            {/* Sample listing cards */}
            {[
              { badge:'Verified', title:'2-room apartment in the city center', addr:'Igwe Orizu Rd, Nnewi, Anambra 234046', price:'₦1.5M / monthly' },
              { badge:'Verified', title:'Single-room apartment', addr:'Mr. John Doe, 15 Adeola Odeku Street, Victoria Island, Lagos 101241', price:'₦800K / monthly' },
            ].map((l,i) => (
              <div key={i} style={s.listingCard} onClick={() => navigate('/listings')}>
                <div style={s.listingImg}>
                  <div style={{ ...s.listingImgBg, background: i===0?'#E8F4F0':'#F4EEE8' }} />
                  <div style={s.listingBadge}>{l.badge}</div>
                </div>
                <div style={s.listingInfo}>
                  <div style={s.listingTitle}>{l.title}</div>
                  <div style={s.listingAddr}>{l.addr}</div>
                  <div style={s.listingPrice}>{l.price}</div>
                </div>
              </div>
            ))}

            <button onClick={() => navigate('/listings')} style={s.showAllBtn}>
              Show all →
            </button>
          </div>
        </div>
      </section>

      {/* ── ESCROW SECTION ── */}
      <section id="escrow" style={s.escrowSection}>
        <div style={s.escrowInner}>
          <h2 style={s.escrowTitle}>Escrow you can trust</h2>
          <p style={s.escrowSub}>
            A transparent, step-by-step escrow flow with legal review, key confirmation, and instant dispute protection.
          </p>
          <div style={s.escrowSteps}>
            {[
              { num:'01', icon:'💳', title:'Deposit',  sub:'Money deposited in SouthSwift vault' },
              { num:'02', icon:'⏱️', title:'Review',   sub:'Agreement reviewed by in-app lawyer' },
              { num:'03', icon:'✅', title:'Confirm',  sub:'Key handover confirmed by tenant' },
              { num:'04', icon:'💳', title:'Release',  sub:'Funds released to landlord' },
            ].map((step,i) => (
              <div key={i} style={s.escrowStep}>
                <div style={s.escrowStepIcon}>{step.icon}</div>
                <div style={s.escrowStepNum}>{step.num}. {step.title}</div>
                <div style={s.escrowStepSub}>{step.sub}</div>
                {i < 3 && <div style={s.escrowConnector} />}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" style={s.howSection}>
        <div style={s.howInner}>
          <h2 style={s.sectionTitle}>How SouthSwift Works</h2>
          <p style={s.sectionSub}>From search to move-in — every step protected.</p>
          <div style={s.howGrid}>
            {[
              { step:'1', title:'Find a Verified Listing', body:'Browse thousands of properties verified by SouthSwift. Every agent has been identity-checked.', icon:'🔍' },
              { step:'2', title:'Pay into SwiftShield Escrow', body:'Your rent is held securely. Not a single naira reaches the agent until you confirm move-in.', icon:'🛡️' },
              { step:'3', title:'Inspect & Confirm Move-In', body:'Visit the property. If it matches the listing, tap to confirm. Funds release instantly to the agent.', icon:'🏠' },
              { step:'4', title:'Get Your SwiftDoc Agreement', body:'A legally-binding AI-generated tenancy agreement is emailed to both parties automatically.', icon:'📋' },
            ].map((item,i) => (
              <div key={i} style={s.howCard}>
                <div style={s.howIcon}>{item.icon}</div>
                <div style={s.howStep}>Step {item.step}</div>
                <div style={s.howTitle}>{item.title}</div>
                <div style={s.howBody}>{item.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOR AGENTS ── */}
      <section style={s.agentSection}>
        <div style={s.agentInner}>
          <div style={s.agentLeft}>
            <div style={s.agentTag}>For Agents</div>
            <h2 style={s.agentTitle}>Build Trust. Close Deals Faster.</h2>
            <p style={s.agentBody}>
              Get your green Verified badge, list properties with zero paper hassle, and receive rent payments
              directly to your bank account the moment your tenant confirms move-in.
            </p>
            <ul style={s.agentList}>
              {['Free identity verification','Automatic tenancy agreements','Same-day bank transfers','No fake tenants — escrow filters them out'].map(item => (
                <li key={item} style={s.agentListItem}>✓ {item}</li>
              ))}
            </ul>
            <button onClick={() => navigate('/register?role=agent')} style={s.agentBtn}>
              Become a Verified Agent →
            </button>
          </div>
          <div style={s.agentRight}>
            <div style={s.agentCard}>
              <div style={s.agentCardAvatar}>AO</div>
              <div style={s.agentCardName}>Agent Oluwaseun</div>
              <div style={s.agentCardBadge}>✅ SouthSwift Verified</div>
              <div style={s.agentCardStats}>
                <div style={s.agentStat}><div style={s.agentStatNum}>47</div><div style={s.agentStatLabel}>Deals</div></div>
                <div style={s.agentStat}><div style={s.agentStatNum}>4.9</div><div style={s.agentStatLabel}>Rating</div></div>
                <div style={s.agentStat}><div style={s.agentStatNum}>2yr</div><div style={s.agentStatLabel}>Active</div></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── UNIVERSITY BANNER ── */}
      <section style={s.uniBanner}>
        <div style={s.uniInner}>
          <h2 style={s.uniTitle}>Starting Where Trust Matters Most.</h2>
          <p style={s.uniBody}>
            Securing residential rentals, student housing networks, and commercial properties across
            Nigeria's high-growth urban corridors and major educational hubs.
          </p>
          <div style={s.uniPoints}>
            {[
              { icon:'📍', title:'Proximity Search', body:'Find homes by landmarks you know — not vague directions.' },
              { icon:'🛡️', title:'Escrow Safety', body:'Your money is only released when you are satisfied.' },
              { icon:'⚖️', title:'Legal Peace of Mind', body:'Professional tenancy agreements included with every deal.' },
            ].map(p => (
              <div key={p.title} style={s.uniPoint}>
                <span style={{ fontSize:22 }}>{p.icon}</span>
                <div>
                  <div style={s.uniPointTitle}>{p.title}</div>
                  <div style={s.uniPointBody}>{p.body}</div>
                </div>
              </div>
            ))}
          </div>
          <button style={s.uniBtn} onClick={scrollToWaitlist}>Get Priority Access →</button>
        </div>
      </section>

      {/* ── WAITLIST ── */}
      <section id="waitlist" style={s.waitlistSection}>
        <div style={s.waitlistInner}>
          <h2 style={s.waitlistTitle}>Be First. Join the Waitlist.</h2>
          <p style={s.waitlistSub}>
            We're launching soon. Get early access, launch pricing, and first pick of verified listings.
          </p>
          <p style={{ fontSize:13, color:'#888', marginBottom:20, fontStyle:'italic', textAlign:'center' }}>
            Be the first to know when verified properties in your area go live.
          </p>
          <div style={s.counter}>
            <span style={{ fontSize:20, marginRight:8 }}>🚀</span>
            <span>Join <strong style={{ color:G }}>1,000+ users</strong> already on the waitlist</span>
          </div>

          {submitted ? (
            <div style={s.successCard}>
              <div style={{ fontSize:32, marginBottom:12 }}>🎉</div>
              <h3 style={{ color:G, margin:'0 0 8px', fontSize:20 }}>You're on the list!</h3>
              <p style={{ color:'#555', fontSize:14, margin:'0 0 16px', lineHeight:1.7 }}>
                Check your email for a confirmation. We'll notify you the moment SouthSwift launches in your city.
              </p>
              <button onClick={() => navigate('/listings')} style={s.waitlistSubmitBtn}>
                Browse Listings →
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={s.wlForm} className="ss-wl-form">
              <div style={{ gridColumn:'1 / -1' }}>
                <label style={s.wlLabel}>Email Address *</label>
                <input style={s.wlInput} type="email" placeholder="your@email.com"
                  value={form.email} onChange={e => setForm(f=>({...f,email:e.target.value}))} required />
              </div>
              <div>
                <label style={s.wlLabel}>Phone Number *</label>
                <input style={s.wlInput} type="tel" placeholder="+234 800 000 0000"
                  value={form.phone} onChange={e => setForm(f=>({...f,phone:e.target.value}))} />
              </div>
              <div>
                <label style={s.wlLabel}>I am a *</label>
                <select style={s.wlInput} value={form.role} onChange={e => setForm(f=>({...f,role:e.target.value}))} required>
                  <option value="">Select role</option>
                  <option value="tenant">Tenant (looking to rent)</option>
                  <option value="agent">Agent (listing properties)</option>
                  <option value="landlord">Landlord (property owner)</option>
                </select>
              </div>
              <div>
                <label style={s.wlLabel}>City *</label>
                <input style={s.wlInput} type="text" placeholder="e.g. Lagos, Ilorin, Ibadan"
                  value={form.city} onChange={e => setForm(f=>({...f,city:e.target.value}))} />
              </div>
              <div>
                <label style={s.wlLabel}>State</label>
                <select style={s.wlInput} value={form.state} onChange={e => setForm(f=>({...f,state:e.target.value}))}>
                  <option value="">Select state</option>
                  {STATES.map(st => <option key={st} value={st}>{st}</option>)}
                </select>
              </div>
              <div style={{ gridColumn:'1 / -1' }}>
                <button type="submit" style={{ ...s.waitlistSubmitBtn, opacity: loading ? 0.7 : 1 }} disabled={loading}>
                  {loading ? 'Joining...' : 'Get Priority Access →'}
                </button>
                <p style={{ fontSize:11, color:'#aaa', textAlign:'center', marginTop:8 }}>
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
              <span style={s.footerLogo}>SouthSwift</span>
              <p style={s.footerTagline}>Nigeria's Verified Property Transaction Platform</p>
              <p style={{ fontSize:11, color:'rgba(255,255,255,0.35)', marginTop:4 }}>CAC BN 7310264</p>
            </div>
            <div style={s.footerCols}>
              <div style={s.footerCol}>
                <div style={s.footerColTitle}>Platform</div>
                <a href="/listings" style={s.footerLink}>Browse Listings</a>
                <a href="#waitlist" style={s.footerLink} onClick={e=>{e.preventDefault();scrollToWaitlist();}}>Join Waitlist</a>
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
  page:      { fontFamily:'Arial,sans-serif', background:'white', minHeight:'100vh' },

  // Navbar
  nav:       { background:'white', borderBottom:'1px solid #E5E7EB', position:'sticky', top:0, zIndex:100,
               height:60, display:'flex', alignItems:'center' },
  navInner:  { maxWidth:1200, margin:'0 auto', padding:'0 24px', width:'100%',
               display:'flex', alignItems:'center', gap:32 },
  navLogo:   { fontSize:18, fontWeight:900, color:'#111', fontFamily:'Georgia,serif', marginRight:'auto' },
  navLinks:  { display:'flex', alignItems:'center', gap:28 },
  navLink:   { fontSize:14, color:'#444', textDecoration:'none', fontWeight:500 },
  navLinkBtn:{ fontSize:14, color:'#444', background:'none', border:'none', cursor:'pointer',
               fontWeight:500, padding:0, fontFamily:'Arial,sans-serif' },
  signInBtn: { background:G, color:'white', border:'none', padding:'8px 20px',
               borderRadius:20, fontSize:14, fontWeight:700, cursor:'pointer', textDecoration:'none' },

  // Hero
  hero:      { padding:'72px 24px 60px', background:'white' },
  heroInner: { maxWidth:1200, margin:'0 auto', display:'flex', alignItems:'center', gap:48, flexWrap:'wrap' },
  heroLeft:  { flex:'1 1 400px', minWidth:320 },
  heroTitle: { fontSize:48, fontWeight:900, color:'#111', lineHeight:1.15, margin:'0 0 20px',
               fontFamily:'Georgia,serif' },
  heroSub:   { fontSize:16, color:'#666', lineHeight:1.7, margin:'0 0 32px', maxWidth:420 },
  heroBtns:  { display:'flex', gap:12, flexWrap:'wrap' },
  heroBtnPrimary:  { background:GOLD, color:'white', border:'none', padding:'13px 28px',
                     borderRadius:8, fontSize:15, fontWeight:700, cursor:'pointer' },
  heroBtnSecondary:{ background:'white', color:'#111', border:'2px solid #DDD', padding:'13px 28px',
                     borderRadius:8, fontSize:15, fontWeight:700, cursor:'pointer' },

  // Hero image
  heroRight: { flex:'1 1 460px', minWidth:300 },
  heroImgWrap:{ position:'relative', borderRadius:16, overflow:'hidden' },
  heroImg:    { width:'100%', height:420, objectFit:'cover', display:'block', borderRadius:16 },
  lawyerBadge:{ position:'absolute', top:16, right:16, background:'white', borderRadius:12,
                padding:'10px 14px', display:'flex', alignItems:'center', gap:10,
                boxShadow:'0 2px 12px rgba(0,0,0,0.12)' },
  lawyerAvatar:{ width:36, height:36, borderRadius:'50%', background:'#1B4332', color:'white',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:12, fontWeight:700, flexShrink:0 },
  heroPills:  { position:'absolute', bottom:16, left:16,
                display:'flex', flexDirection:'column', gap:8 },
  heroPill:   { background:'white', borderRadius:10, padding:'10px 14px',
                display:'flex', alignItems:'center', gap:10,
                boxShadow:'0 2px 8px rgba(0,0,0,0.1)' },

  // Trust bar
  trustBar:  { background:'#F8FAF8', borderTop:'1px solid #E5E7EB', borderBottom:'1px solid #E5E7EB', padding:'20px 24px' },
  trustBarInner:{ maxWidth:1200, margin:'0 auto', display:'flex', justifyContent:'space-around',
                  flexWrap:'wrap', gap:20 },
  trustItem: { display:'flex', alignItems:'center', gap:10 },
  trustTitle:{ fontSize:13, fontWeight:700, color:'#111' },
  trustSub:  { fontSize:12, color:'#888' },

  // Search + map
  searchSection:{ padding:'64px 24px', background:'white' },
  searchInner:  { maxWidth:1200, margin:'0 auto', display:'flex', gap:40, alignItems:'flex-start', flexWrap:'wrap' },
  mapWrap:   { flex:'1 1 400px', minWidth:300 },
  mapPlaceholder:{ width:'100%', height:460, borderRadius:12, background:'#F0EDE4',
                   border:'1px solid #E0DDD8', position:'relative', overflow:'hidden' },
  mapOverlay:{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' },
  mapBubble: { position:'absolute', background:G, color:'white', fontSize:10, fontWeight:700,
               padding:'4px 8px', borderRadius:12, transform:'translate(-50%,-50%)', whiteSpace:'nowrap' },

  // Search panel
  searchPanel:  { flex:'1 1 360px', minWidth:300 },
  searchTitle:  { fontSize:22, fontWeight:800, color:'#111', margin:'0 0 20px' },
  searchBar:    { display:'flex', alignItems:'center', border:'1px solid #DDD', borderRadius:8,
                  overflow:'hidden', marginBottom:12 },
  searchTypeToggle:{ display:'flex', flexShrink:0 },
  typeBtn:      { padding:'10px 14px', border:'none', background:'transparent', fontSize:13,
                  fontWeight:600, cursor:'pointer', color:'#555', borderRight:'1px solid #DDD' },
  typeBtnActive:{ background:G, color:'white' },
  searchInput:  { flex:1, border:'none', outline:'none', padding:'10px 12px', fontSize:13 },
  searchBtn:    { padding:'10px 14px', background:'none', border:'none', cursor:'pointer', fontSize:16 },
  searchMeta:   { display:'flex', justifyContent:'space-between', marginBottom:16 },

  // Listing cards
  listingCard:  { display:'flex', gap:12, padding:'12px 0', borderTop:'1px solid #F3F4F6', cursor:'pointer' },
  listingImg:   { width:100, height:72, borderRadius:8, overflow:'hidden', position:'relative', flexShrink:0 },
  listingImgBg: { width:'100%', height:'100%' },
  listingBadge: { position:'absolute', top:4, left:4, background:'white', color:'#22C55E',
                  fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:6, border:'1px solid #22C55E' },
  listingInfo:  { flex:1 },
  listingTitle: { fontSize:13, fontWeight:700, color:'#111', marginBottom:3 },
  listingAddr:  { fontSize:11, color:'#888', marginBottom:6, lineHeight:1.5 },
  listingPrice: { fontSize:14, fontWeight:800, color:G },
  showAllBtn:   { width:'100%', textAlign:'right', background:'none', border:'none',
                  color:G, fontSize:13, fontWeight:700, cursor:'pointer', padding:'8px 0', marginTop:8 },

  // Escrow
  escrowSection:{ padding:'80px 24px', background:'#F8FAF8' },
  escrowInner:  { maxWidth:760, margin:'0 auto', textAlign:'center' },
  escrowTitle:  { fontSize:32, fontWeight:900, color:'#111', fontFamily:'Georgia,serif', margin:'0 0 12px' },
  escrowSub:    { fontSize:15, color:'#666', margin:'0 0 52px', lineHeight:1.7 },
  escrowSteps:  { display:'flex', flexDirection:'column', gap:0, textAlign:'left', maxWidth:500, margin:'0 auto' },
  escrowStep:   { display:'flex', alignItems:'flex-start', gap:16, position:'relative', paddingBottom:8 },
  escrowStepIcon:{ width:40, height:40, borderRadius:'50%', background:G, color:'white',
                   display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0, zIndex:1 },
  escrowStepNum: { paddingTop:10, fontSize:14, fontWeight:700, color:'#111' },
  escrowStepSub: { paddingTop:10, fontSize:13, color:'#666', marginTop:2 },
  escrowConnector:{ position:'absolute', left:19, top:40, bottom:-8, width:2, background:'#E5E7EB' },

  // How it works
  howSection:   { padding:'80px 24px', background:'white' },
  howInner:     { maxWidth:1200, margin:'0 auto' },
  sectionTitle: { fontSize:32, fontWeight:900, color:'#111', fontFamily:'Georgia,serif',
                  margin:'0 0 12px', textAlign:'center' },
  sectionSub:   { fontSize:15, color:'#666', textAlign:'center', margin:'0 0 48px' },
  howGrid:      { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:24 },
  howCard:      { background:'#F8FAF8', borderRadius:14, padding:'28px 24px',
                  border:'1px solid #E5E7EB' },
  howIcon:      { fontSize:28, marginBottom:12 },
  howStep:      { fontSize:11, fontWeight:700, color:GOLD, textTransform:'uppercase',
                  letterSpacing:1, marginBottom:8 },
  howTitle:     { fontSize:16, fontWeight:800, color:'#111', marginBottom:10 },
  howBody:      { fontSize:13, color:'#666', lineHeight:1.7 },

  // Agent section
  agentSection: { padding:'80px 24px', background:G },
  agentInner:   { maxWidth:1200, margin:'0 auto', display:'flex', gap:60,
                  alignItems:'center', flexWrap:'wrap' },
  agentLeft:    { flex:'1 1 400px' },
  agentTag:     { display:'inline-block', background:'rgba(200,150,60,0.2)', color:GOLD,
                  fontSize:12, fontWeight:700, padding:'4px 14px', borderRadius:20,
                  marginBottom:16, border:`1px solid ${GOLD}` },
  agentTitle:   { fontSize:32, fontWeight:900, color:'white', fontFamily:'Georgia,serif',
                  margin:'0 0 16px', lineHeight:1.3 },
  agentBody:    { fontSize:15, color:'rgba(255,255,255,0.75)', lineHeight:1.8, margin:'0 0 24px' },
  agentList:    { listStyle:'none', padding:0, margin:'0 0 28px' },
  agentListItem:{ fontSize:14, color:'rgba(255,255,255,0.85)', marginBottom:10, display:'flex',
                  alignItems:'center', gap:8 },
  agentBtn:     { background:GOLD, color:'white', border:'none', padding:'14px 28px',
                  borderRadius:8, fontSize:15, fontWeight:700, cursor:'pointer' },
  agentRight:   { flex:'1 1 280px', display:'flex', justifyContent:'center' },
  agentCard:    { background:'white', borderRadius:16, padding:'28px 24px', width:260, textAlign:'center',
                  boxShadow:'0 8px 32px rgba(0,0,0,0.15)' },
  agentCardAvatar:{ width:64, height:64, borderRadius:'50%', background:G, color:'white',
                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:22,
                    fontWeight:700, margin:'0 auto 12px' },
  agentCardName:{ fontSize:16, fontWeight:800, color:'#111', marginBottom:6 },
  agentCardBadge:{ background:'#DCFCE7', color:'#166534', fontSize:12, fontWeight:700,
                   padding:'4px 12px', borderRadius:20, display:'inline-block', marginBottom:20 },
  agentCardStats:{ display:'flex', justifyContent:'space-around' },
  agentStat:    { textAlign:'center' },
  agentStatNum: { fontSize:20, fontWeight:900, color:G },
  agentStatLabel:{ fontSize:11, color:'#888' },

  // University banner
  uniBanner:    { padding:'72px 24px', background:'#0A1A0A' },
  uniInner:     { maxWidth:900, margin:'0 auto', textAlign:'center' },
  uniTitle:     { fontSize:32, fontWeight:900, color:'white', fontFamily:'Georgia,serif', margin:'0 0 16px' },
  uniBody:      { fontSize:15, color:'rgba(255,255,255,0.7)', maxWidth:660, margin:'0 auto 36px', lineHeight:1.8 },
  uniPoints:    { display:'flex', flexDirection:'column', gap:14, maxWidth:540, margin:'0 auto 36px', textAlign:'left' },
  uniPoint:     { display:'flex', alignItems:'flex-start', gap:14, background:'rgba(255,255,255,0.06)',
                  borderRadius:10, padding:'14px 18px' },
  uniPointTitle:{ fontSize:14, fontWeight:800, color:'white', marginBottom:3 },
  uniPointBody: { fontSize:13, color:'rgba(255,255,255,0.6)', lineHeight:1.6 },
  uniBtn:       { background:GOLD, color:'white', border:'none', padding:'14px 32px',
                  borderRadius:8, fontSize:15, fontWeight:700, cursor:'pointer' },

  // Waitlist
  waitlistSection:{ padding:'80px 24px', background:'white', borderTop:'4px solid '+G },
  waitlistInner:  { maxWidth:580, margin:'0 auto' },
  waitlistTitle:  { fontSize:32, fontWeight:900, color:'#111', fontFamily:'Georgia,serif',
                    margin:'0 0 12px', textAlign:'center' },
  waitlistSub:    { fontSize:15, color:'#666', textAlign:'center', margin:'0 0 8px', lineHeight:1.7 },
  counter:        { background:'#F0F9F0', border:'1px solid #BBF7D0', borderRadius:10,
                    padding:'12px 16px', fontSize:14, color:G, display:'flex',
                    alignItems:'center', marginBottom:28, justifyContent:'center' },
  wlForm:         { display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 },
  wlLabel:        { display:'block', fontSize:12, fontWeight:700, color:'#444', marginBottom:6 },
  wlInput:        { width:'100%', border:'1px solid #DDD', borderRadius:8, padding:'11px 12px',
                    fontSize:13, boxSizing:'border-box', outline:'none', background:'white' },
  waitlistSubmitBtn:{ width:'100%', background:G, color:'white', border:'none', padding:'14px',
                       borderRadius:8, fontSize:15, fontWeight:700, cursor:'pointer' },
  successCard:    { background:'#F0F9F0', border:'1px solid #BBF7D0', borderRadius:16,
                    padding:'40px 32px', textAlign:'center' },

  // Footer
  footer:       { background:G, padding:'56px 24px 24px' },
  footerInner:  { maxWidth:1200, margin:'0 auto' },
  footerTop:    { display:'flex', gap:60, flexWrap:'wrap', marginBottom:40 },
  footerBrand:  { flex:'0 0 220px' },
  footerLogo:   { fontSize:22, fontWeight:900, color:'white', fontFamily:'Georgia,serif' },
  footerTagline:{ fontSize:12, color:'rgba(255,255,255,0.5)', marginTop:8, lineHeight:1.6 },
  footerCols:   { flex:1, display:'flex', gap:40, flexWrap:'wrap' },
  footerCol:    { flex:'1 1 140px', display:'flex', flexDirection:'column', gap:10 },
  footerColTitle:{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.4)',
                   textTransform:'uppercase', letterSpacing:1, marginBottom:4 },
  footerLink:   { fontSize:13, color:'rgba(255,255,255,0.7)', textDecoration:'none' },
  footerBottom: { borderTop:'1px solid rgba(255,255,255,0.1)', paddingTop:20,
                  fontSize:12, color:'rgba(255,255,255,0.35)', textAlign:'center' },
};
