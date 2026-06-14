// ── DASHBOARD ─────────────────────────────────────────────────────────────────
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getMyDeals, getMyListings, submitVerification, uploadIntroVideo } from '../utils/api';
import { useAuth } from '../App';
import { Shield, Home, FileText, CheckCircle, AlertTriangle, Clock } from 'lucide-react';

const G = '#1B4332'; const GOLD = '#C8963C';

const statusColor = { initiated:'#888', payment_pending:'#F59E0B', escrow_held:'#3B82F6',
  docs_generated:'#8B5CF6', movein_pending:'#F59E0B', completed:'#22C55E',
  disputed:'#EF4444', cancelled:'#9CA3AF' };

export function Dashboard() {
  const { user }           = useAuth();
  const [deals, setDeals]  = useState([]);
  const [myListings, setMyListings] = useState([]);
  const [tab, setTab]      = useState('deals');
  const [verForm, setVerForm] = useState({ nin:'', agency_name:'', bio:'', account_number:'', bank_code:'', account_name:'' });
  const [verDocs, setVerDocs] = useState({ id_document: null, selfie: null });
  const [introVideo, setIntroVideo] = useState(null);
  const [introUploading, setIntroUploading] = useState(false);

  useEffect(() => {
    getMyDeals().then(r => setDeals(r.data)).catch(()=>{});
    if (['agent','admin'].includes(user?.role)) {
      getMyListings().then(r => setMyListings(r.data)).catch(()=>{});
    }
  }, []);

  const handleVerify = async (e) => {
    e.preventDefault();
    try {
      await submitVerification({
        nin: verForm.nin,
        agency_name: verForm.agency_name,
        bio: verForm.bio,
        account_number: verForm.account_number,
        bank_code: verForm.bank_code,
        account_name: verForm.account_name,
        id_document: verDocs.id_document,
        selfie: verDocs.selfie
      });
      toast.success('Verification submitted! SouthSwift will review within 48 hours.');
    } catch (err) { toast.error(err.response?.data?.error || 'Failed.'); }
  };
  const handleIntroVideo = async (e) => {
    e.preventDefault();
    if (!introVideo) { toast.error('Please choose a video first.'); return; }
    setIntroUploading(true);
    try {
      await uploadIntroVideo(introVideo);
      toast.success('Intro video uploaded! It now shows on your public profile.');
      setIntroVideo(null);
    } catch (err) { toast.error(err.response?.data?.error || 'Upload failed.'); }
    setIntroUploading(false);
  };

  return (
    <div style={s.page}>
      <div style={s.container}>
        <div style={s.header}>
          <div>
            <h1 style={s.hTitle}>Welcome, {user?.full_name?.split(' ')[0]} 👋</h1>
            <div style={s.hSub}>
              <span style={{...s.roleBadge, background: user?.role==='agent'?'#DCFCE7':'#EFF6FF'}}>
                {user?.role}
              </span>
              {user?.is_verified && <span style={s.verBadge}><CheckCircle size={12}/> Verified</span>}
            </div>
          </div>
          {['agent','admin'].includes(user?.role) && (
            <Link to="/create-listing" style={s.addBtn}>+ Add Listing</Link>
          )}
        </div>

        {/* Stats */}
        <div style={s.stats}>
          {[['🛡️', deals.length, 'Total Deals'],
            ['✅', deals.filter(d=>d.status==='completed').length, 'Completed'],
            ['⏳', deals.filter(d=>['escrow_held','docs_generated'].includes(d.status)).length, 'In Escrow'],
            ['🏠', myListings.length, 'My Listings']].map(([icon,num,label])=>(
            <div key={label} style={s.statCard}>
              <span style={s.statIcon}>{icon}</span>
              <div style={s.statNum}>{num}</div>
              <div style={s.statLabel}>{label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={s.tabs}>
          {['deals','listings','verification'].map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{...s.tab, ...(tab===t?s.tabActive:{})}}>
              {t==='deals'?'My Deals':t==='listings'?'My Listings':'Agent Verification'}
            </button>
          ))}
        </div>

        {/* Deals */}
        {tab==='deals' && (
          <div>
            {deals.length===0
              ? <div style={s.empty}><Shield size={40} color="#DDD"/><p>No deals yet. Find a property to get started.</p><Link to="/listings" style={s.linkBtn}>Browse Listings</Link></div>
              : deals.map(d=>(
                <Link to={`/deals/${d.id}`} key={d.id} style={s.dealRow}>
                  <div>
                    <div style={s.dealTitle}>{d.listing_title}</div>
                    <div style={s.dealSub}>{d.city} · {new Date(d.created_at).toLocaleDateString('en-NG')}</div>
                  </div>
                  <div style={s.dealRight}>
                    <div style={s.dealAmt}>₦{Number(d.rent_amount).toLocaleString()}</div>
                    <div style={{...s.statusBadge, background:statusColor[d.status]+'22', color:statusColor[d.status]}}>{d.status.replace(/_/g,' ')}</div>
                  </div>
                </Link>
              ))
            }
          </div>
        )}

        {/* Listings */}
        {tab==='listings' && (
          <div>
            {myListings.length===0
              ? <div style={s.empty}><Home size={40} color="#DDD"/><p>No listings yet.</p><Link to="/create-listing" style={s.linkBtn}>Create First Listing</Link></div>
              : myListings.map(l=>(
                <div key={l.id} style={s.dealRow}>
                  <div>
                    <div style={s.dealTitle}>{l.title}</div>
                    <div style={s.dealSub}>{l.city}, {l.state} · {l.bedrooms} bed · {l.property_type}</div>
                  </div>
                  <div style={s.dealRight}>
                    <div style={s.dealAmt}>₦{Number(l.rent_price).toLocaleString()}</div>
                    <div style={{...s.statusBadge, background:l.is_available?'#DCFCE7':'#FEE2E2', color:l.is_available?'#166534':'#DC2626'}}>
                      {l.is_available?'Available':'Occupied'}
                    </div>
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {/* Verification */}
        {tab==='verification' && user?.role==='agent' && (
          <>
          <div style={s.verCard}>
            <h3 style={s.verTitle}>Submit Agent Verification</h3>
            <p style={s.verDesc}>Verified agents get a badge, more leads, and tenant trust. SouthSwift reviews within 48 hours.</p>
            <form onSubmit={handleVerify}>
              {[['NIN (National Identity Number)*','nin','NIN12345678'],
                ['Agency Name','agency_name','SunRise Properties Lagos']].map(([lbl,key,ph])=>(
                <div key={key}>
                  <label style={s.label}>{lbl}</label>
                  <input style={s.input} value={verForm[key]} placeholder={ph}
                    onChange={e=>setVerForm(f=>({...f,[key]:e.target.value}))} />
                </div>
              ))}
              <label style={s.label}>Bio / Professional Summary</label>
              <textarea style={{...s.input, height:80}} value={verForm.bio}
                placeholder="Tell tenants about your experience..."
                onChange={e=>setVerForm(f=>({...f,bio:e.target.value}))} />
              <div>
                <label style={s.label}>Bank Account Number</label>
                <input style={s.input} type="text" placeholder="0123456789"
                  value={verForm.account_number || ''}
                  onChange={e => setVerForm(f => ({...f, account_number: e.target.value}))} />
              </div>
              <div>
                <label style={s.label}>Bank Code (e.g. 058 for GTBank)</label>
                <input style={s.input} type="text" placeholder="058"
                  value={verForm.bank_code || ''}
                  onChange={e => setVerForm(f => ({...f, bank_code: e.target.value}))} />
              </div>
              <div>
                <label style={s.label}>Account Name</label>
                <input style={s.input} type="text" placeholder="As shown on your bank account"
                  value={verForm.account_name || ''}
                  onChange={e => setVerForm(f => ({...f, account_name: e.target.value}))} />
              </div>
              <div>
                <label style={s.label}>Government ID Document</label>
                <input type="file" accept="image/*,.pdf"
                  onChange={e => setVerDocs(d => ({...d, id_document: e.target.files[0]}))}
                  style={{...s.input, padding:'6px'}} />
                {verDocs.id_document && <span style={{fontSize:11,color:'#888'}}>✓ {verDocs.id_document.name}</span>}
              </div>
              <div>
                <label style={s.label}>Selfie with ID</label>
                <input type="file" accept="image/*"
                  onChange={e => setVerDocs(d => ({...d, selfie: e.target.files[0]}))}
                  style={{...s.input, padding:'6px'}} />
                {verDocs.selfie && <span style={{fontSize:11,color:'#888'}}>✓ {verDocs.selfie.name}</span>}
              </div>
              <button style={s.verBtn}>Submit for Verification</button>
            </form>
          </div>

          <div style={{...s.verCard, marginTop:16}}>
            <h3 style={s.verTitle}>Agent Intro Video</h3>
            <p style={s.verDesc}>Upload a short video introducing yourself. It appears on your public agent profile. (Optional, max 100MB.)</p>
            <form onSubmit={handleIntroVideo}>
              <input type="file" accept="video/*"
                onChange={e => setIntroVideo(e.target.files[0])}
                style={{...s.input, padding:'6px'}} />
              {introVideo && <span style={{fontSize:11,color:'#888'}}>✓ {introVideo.name}</span>}
              <button style={{...s.verBtn, marginTop:12}} disabled={introUploading}>
                {introUploading ? 'Uploading…' : 'Upload Intro Video'}
              </button>
            </form>
          </div>
          </>
        )}
      </div>
    </div>
  );
}

const s = {
  page:      { fontFamily:'Arial,sans-serif', minHeight:'80vh', background:'#F8FAF8' },
  container: { maxWidth:900, margin:'0 auto', padding:'28px 20px' },
  header:    { display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24, flexWrap:'wrap', gap:12 },
  hTitle:    { fontSize:22, fontWeight:800, color:'#111', margin:'0 0 6px' },
  hSub:      { display:'flex', gap:8, alignItems:'center' },
  roleBadge: { fontSize:11, fontWeight:700, padding:'2px 10px', borderRadius:10, textTransform:'uppercase', color:G },
  verBadge:  { display:'flex', alignItems:'center', gap:4, fontSize:11, color:'#22C55E', fontWeight:700 },
  addBtn:    { background:G, color:'white', padding:'9px 18px', borderRadius:10, textDecoration:'none', fontSize:13, fontWeight:700 },
  stats:     { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:14, marginBottom:28 },
  statCard:  { background:'white', borderRadius:12, padding:'18px 16px', textAlign:'center', border:'1px solid #E5E7EB' },
  statIcon:  { fontSize:24 },
  statNum:   { fontSize:28, fontWeight:900, color:G, margin:'6px 0 2px' },
  statLabel: { fontSize:12, color:'#888' },
  tabs:      { display:'flex', gap:6, marginBottom:20, flexWrap:'wrap' },
  tab:       { background:'transparent', border:'1px solid #DDD', padding:'8px 16px', borderRadius:8, cursor:'pointer', fontSize:13, color:'#666', flexShrink:0 },
  tabActive: { background:G, color:'white', border:`1px solid ${G}` },
  empty:     { textAlign:'center', padding:48, color:'#999' },
  linkBtn:   { display:'inline-block', background:G, color:'white', padding:'9px 20px', borderRadius:10, textDecoration:'none', fontSize:13, fontWeight:700, marginTop:12 },
  dealRow:   { display:'flex', justifyContent:'space-between', alignItems:'center',
               background:'white', borderRadius:10, padding:'14px 16px', marginBottom:10,
               border:'1px solid #E5E7EB', textDecoration:'none', cursor:'pointer',
               flexWrap:'wrap', gap:8 },
  dealTitle: { fontSize:14, fontWeight:700, color:'#111', marginBottom:3, wordBreak:'break-word' },
  dealSub:   { fontSize:12, color:'#888' },
  dealRight: { textAlign:'right' },
  dealAmt:   { fontSize:15, fontWeight:800, color:G, marginBottom:4 },
  statusBadge:{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20 },
  verCard:   { background:'white', borderRadius:14, padding:'28px', border:'1px solid #E5E7EB' },
  verTitle:  { fontSize:18, fontWeight:700, color:G, margin:'0 0 8px' },
  verDesc:   { fontSize:13, color:'#666', marginBottom:20 },
  label:     { display:'block', fontSize:12, fontWeight:700, color:'#444', marginBottom:5, marginTop:12 },
  input:     { width:'100%', border:'1px solid #DDD', borderRadius:8, padding:'10px 12px', fontSize:13, boxSizing:'border-box', outline:'none', resize:'vertical' },
  verBtn:    { background:G, color:'white', border:'none', padding:'11px 24px', borderRadius:10, cursor:'pointer', fontWeight:700, fontSize:14, marginTop:14 },
};

export default Dashboard;
