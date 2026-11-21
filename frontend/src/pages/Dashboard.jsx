// ── DASHBOARD ─────────────────────────────────────────────────────────────────
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  getMyDeals, getMyListings, submitVerification, uploadIntroVideo, deleteListing,
  getBanks, resolveAccount, getReferralSummary,
} from '../utils/api';
import ShareListing from '../components/ShareListing';
import WithdrawModal from '../components/WithdrawModal';
import BankSearchSelect from '../components/BankSearchSelect';
import { formatNaira } from '../utils/format';
import { useAuth } from '../App';
import { Shield, Home, CheckCircle, Gift, Copy, Wallet } from 'lucide-react';

const G = '#1B4332'; const GOLD = '#C8963C';

const statusColor = { initiated:'#888', payment_pending:'#F59E0B', escrow_held:'#3B82F6',
  docs_generated:'#8B5CF6', movein_pending:'#F59E0B', completed:'#22C55E',
  disputed:'#EF4444', cancelled:'#9CA3AF' };

const withdrawalMeta = {
  pending:  { background:'#FEF3C7', color:'#92400E' },
  approved: { background:'#DBEAFE', color:'#1E40AF' },
  paid:     { background:'#DCFCE7', color:'#166534' },
  rejected: { background:'#FEE2E2', color:'#DC2626' },
};

export function Dashboard() {
  const { user }           = useAuth();
  const [deals, setDeals]  = useState([]);
  const [myListings, setMyListings] = useState([]);
  const [tab, setTab]      = useState('deals');
  const [verForm, setVerForm] = useState({ nin:'', agency_name:'', bio:'', account_number:'', bank_code:'', account_name:'' });
  const [verDocs, setVerDocs] = useState({ id_document: null, selfie: null });
  const [introVideo, setIntroVideo] = useState(null);
  const [introUploading, setIntroUploading] = useState(false);
  const [banks, setBanks] = useState([]);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [referral, setReferral] = useState(null);
  const [referralLoading, setReferralLoading] = useState(true);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const requestDelete = (l) => setDeleteTarget(l);

  const cancelDelete = () => {
    if (deleting) return;
    setDeleteTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await deleteListing(deleteTarget.id);
      toast.success('Listing deleted.');
      setDeleteTarget(null);
      await refreshMyListings();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete listing.');
    }
    setDeleting(false);
  };

  // Close the delete modal on Escape
  useEffect(() => {
    if (!deleteTarget) return;
    const onKey = (e) => { if (e.key === 'Escape') cancelDelete(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteTarget, deleting]);

  const refreshMyListings = () =>
    getMyListings().then(r => {
      setMyListings(r.data);
    }).catch(()=>{});

  const refreshReferral = () =>
    getReferralSummary()
      .then(r => setReferral(r.data))
      .catch(() => {})
      .finally(() => setReferralLoading(false));

  useEffect(() => {
    if (!user?.role) return; // wait until ProtectedRoute resolves the user
    getMyDeals().then(r => setDeals(r.data)).catch(()=>{});
    refreshReferral();
    if (['agent','admin'].includes(user.role)) {
      refreshMyListings();
      getBanks().then(r => setBanks(r.data)).catch(()=>{}); // best-effort; dropdown stays empty if down
    }
  }, [user?.role]);

  // Debounced Paystack /bank/resolve — fires once both fields look complete.
  // An AbortController kills any in-flight lookup if the user keeps typing so a
  // stale response can't overwrite the current account_name with the wrong bank's.
  useEffect(() => {
    if (!['agent','admin'].includes(user?.role)) return;
    if (!/^\d{10}$/.test(verForm.account_number) || !verForm.bank_code) {
      setResolveError('');
      setResolving(false);
      return;
    }
    setResolving(true);
    setResolveError('');
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await resolveAccount(verForm.account_number, verForm.bank_code);
        if (cancelled) return;
        setVerForm(f => ({...f, account_name: r.data.account_name}));
      } catch (err) {
        if (cancelled) return;
        setResolveError(err.response?.data?.error || 'Could not resolve account.');
      } finally {
        if (!cancelled) setResolving(false);
      }
    }, 600);
    return () => { cancelled = true; clearTimeout(t); };
  }, [verForm.account_number, verForm.bank_code, user?.role]);

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
            <h1 style={s.hTitle}>Welcome, {user?.full_name?.split(' ')[0]} </h1>
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
            ['🏠', myListings.length, 'My Listings'],
            ['🎁', `₦${formatNaira(referral?.balance || 0)}`, 'Referral Balance']].map(([icon,num,label])=>(
            <div key={label} style={s.statCard}>
              <div style={s.statNum}>{num}</div>
              <div style={s.statLabel}>{label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={s.tabs}>
          {[
            ['deals','My Deals'],
            ['listings','My Listings'],
            ...(['agent','admin'].includes(user?.role) ? [['verification','Agent Verification']] : []),
            ['rewards','Rewards'],
          ].map(([t,label])=>(
            <button key={t} onClick={()=>setTab(t)} style={{...s.tab, ...(tab===t?s.tabActive:{})}}>
              {label}
            </button>
          ))}
        </div>

        {/* Deals */}
        {tab==='deals' && (
          <div>
            {deals.length===0
              ? <div style={s.empty}><Shield size={40} color="#DDD"/><p>No deals yet. Find a property to get started.</p><Link to="/listings" style={s.linkBtn}>Browse Listings</Link></div>
              : deals.map(d=>{
                const readyToContinue = Number(d.inspection_fee) > 0 && (d.has_paid_inspection || d.inspection_skipped) && ['initiated','payment_pending'].includes(d.status);
                const isInspectionReady = readyToContinue && d.has_paid_inspection;
                const isSkippedReady = readyToContinue && d.inspection_skipped;
                const badgeLabel = isInspectionReady ? 'Inspection paid' : isSkippedReady ? 'Inspection skipped' : d.status.replace(/_/g,' ');
                const badgeColor = isInspectionReady ? '#166534' : isSkippedReady ? '#92400E' : statusColor[d.status];
                const badgeBg = isInspectionReady ? '#DCFCE7' : isSkippedReady ? '#FEF3C7' : statusColor[d.status]+'22';
                return (
                  <div key={d.id} style={{...s.dealRow, flexDirection:'column', alignItems:'stretch'}}>
                    <Link to={`/deals/${d.id}`} style={{display:'flex', justifyContent:'space-between', alignItems:'center', textDecoration:'none', color:'inherit'}}>
                      <div>
                        <div style={s.dealTitle}>{d.listing_title}</div>
                        <div style={s.dealSub}>{d.city} · {new Date(d.created_at).toLocaleDateString('en-NG')}</div>
                      </div>
                      <div style={s.dealRight}>
                        <div style={s.dealAmt}>₦{formatNaira(d.rent_amount)}</div>
                        <div style={{...s.statusBadge, background:badgeBg, color:badgeColor}}>{badgeLabel}</div>
                      </div>
                    </Link>
                    {readyToContinue && (
                      <Link to={`/listings/${d.listing_id}?resume=1`} onClick={e=>e.stopPropagation()} style={{marginTop:10, background:G, color:'white', padding:'9px 14px', borderRadius:10, textDecoration:'none', fontWeight:800, fontSize:13, textAlign:'center', display:'block'}}>
                        Continue Booking →
                      </Link>
                    )}
                  </div>
                );
              })
            }
          </div>
        )}

        {/* Listings */}
        {tab==='listings' && (
          <div>
            {myListings.length===0
              ? <div style={s.empty}><Home size={40} color="#DDD"/><p>No listings yet.</p><Link to="/create-listing" style={s.linkBtn}>Create First Listing</Link></div>
              : myListings.map(l=>(
                <div key={l.id} style={s.listingCard}>
                  <div style={{...s.dealRow, border:'none', borderRadius:0, marginBottom:0}}>
                    <div>
                      <div style={s.dealTitle}>{l.title}</div>
                      <div style={s.dealSub}>{l.city}, {l.state} · {l.bedrooms} bed · {l.property_type}</div>
                    </div>
                    <div style={s.dealRight}>
                      <div style={s.dealAmt}>₦{formatNaira(l.rent_price)}</div>
                      <div style={{...s.statusBadge, background:l.is_available?'#DCFCE7':'#FEE2E2', color:l.is_available?'#166534':'#DC2626'}}>
                        {l.is_available?'Available':'Occupied'}
                      </div>
                    </div>
                  </div>
                  <div style={s.rowActions}>
                      <ShareListing listing={l} />
                      <Link to={`/edit-listing/${l.id}`} style={s.editBtn}>Edit</Link>
                      <button onClick={() => requestDelete(l)} style={s.deleteBtn}>Delete</button>
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
                <label style={s.label}>Bank</label>
                <BankSearchSelect
                  banks={banks}
                  value={verForm.bank_code || ''}
                  loading={!banks.length}
                  inputStyle={s.input}
                  onChange={bank => setVerForm(f => ({
                    ...f,
                    bank_code: bank?.code || '',
                    account_name: '',
                  }))}
                />
              </div>
              <div>
                <label style={s.label}>Bank Account Number</label>
                <input style={s.input} type="text" inputMode="numeric" maxLength={10} placeholder="10-digit account number"
                  value={verForm.account_number || ''}
                  onChange={e => setVerForm(f => ({...f, account_number: e.target.value.replace(/\D/g,''), account_name: ''}))} />
                {resolving && <span style={{fontSize:11,color:'#888',marginTop:4,display:'block'}}>Looking up account…</span>}
                {resolveError && <span style={{fontSize:11,color:'#DC2626',marginTop:4,display:'block'}}>{resolveError}</span>}
                {verForm.account_name && !resolving && !resolveError && (
                  <span style={{fontSize:12,color:'#166534',marginTop:6,display:'block',fontWeight:700}}>
                    ✓ {verForm.account_name}
                  </span>
                )}
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

        {/* Rewards */}
        {tab==='rewards' && (
          <div>
            {referralLoading ? (
              <div style={s.empty}>Loading your rewards…</div>
            ) : (
              <>
                <div style={s.rewardHero}>
                  <div>
                    <div style={s.rewardLabel}>Available balance</div>
                    <div style={s.rewardBalance}>₦{formatNaira(referral?.balance || 0)}</div>
                    <div style={s.rewardSub}>
                      Earn ₦1,000 each time someone you refer completes a rental.
                    </div>
                  </div>
                  <button
                    onClick={() => setWithdrawOpen(true)}
                    disabled={(referral?.balance || 0) < (referral?.min_withdrawal || 1000) || !!referral?.pending_withdrawal}
                    style={{
                      ...s.withdrawBtn,
                      opacity: ((referral?.balance || 0) < (referral?.min_withdrawal || 1000) || referral?.pending_withdrawal) ? 0.55 : 1,
                    }}
                  >
                    <Wallet size={16} /> Withdraw
                  </button>
                </div>

                {referral?.pending_withdrawal && (
                  <div style={s.pendingBox}>
                    A withdrawal of ₦{formatNaira(referral.pending_withdrawal.amount)} is{' '}
                    <strong>{referral.pending_withdrawal.status}</strong>. You can withdraw again once it is resolved.
                  </div>
                )}

                <div style={s.shareCard}>
                  <div>
                    <div style={s.shareLabel}>Your referral code</div>
                    <div style={s.shareCode}>{referral?.referral_code || '—'}</div>
                  </div>
                  <div style={s.shareActions}>
                    <button
                      style={s.copyBtn}
                      onClick={() => {
                        navigator.clipboard?.writeText(referral?.referral_code || '');
                        toast.success('Referral code copied.');
                      }}
                    >
                      <Copy size={13} /> Copy code
                    </button>
                    <button
                      style={s.copyBtn}
                      onClick={() => {
                        const link = referral?.referral_link || `${window.location.origin}/register?ref=${referral?.referral_code || ''}`;
                        navigator.clipboard?.writeText(link);
                        toast.success('Referral link copied.');
                      }}
                    >
                      Copy link
                    </button>
                  </div>
                </div>

                <h3 style={s.rewardSectionTitle}>Reward history</h3>
                {referral?.rewards?.length ? (
                  <div style={s.rewardList}>
                    {referral.rewards.map(r => (
                      <div key={r.id} style={s.rewardRow}>
                        <div>
                          <div style={s.rewardRowTitle}>{r.referred_name || 'Referred user'}</div>
                          <div style={s.rewardRowSub}>
                            {r.listing_title || 'Property rental'} · {new Date(r.created_at).toLocaleDateString('en-NG')}
                          </div>
                        </div>
                        <div style={s.rewardAmount}>+₦{formatNaira(r.amount)}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={s.empty}>
                    <Gift size={36} color="#DDD" />
                    <p>No rewards yet. Share your code to start earning.</p>
                  </div>
                )}

                <h3 style={s.rewardSectionTitle}>Withdrawals</h3>
                {referral?.withdrawals?.length ? (
                  <div style={s.rewardList}>
                    {referral.withdrawals.map(w => (
                      <div key={w.id} style={s.rewardRow}>
                        <div>
                          <div style={s.rewardRowTitle}>₦{formatNaira(w.amount)}</div>
                          <div style={s.rewardRowSub}>
                            {w.bank_name || 'Bank'} · {w.account_number} · {new Date(w.requested_at).toLocaleDateString('en-NG')}
                          </div>
                          {w.admin_note && <div style={s.rewardRowNote}>{w.admin_note}</div>}
                        </div>
                        <div style={{ ...s.withdrawalBadge, ...(withdrawalMeta[w.status] || {}) }}>
                          {w.status}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={s.rewardEmpty}>No withdrawal requests yet.</div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <WithdrawModal
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        summary={referral}
        onSuccess={refreshReferral}
      />

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div style={s.modalOverlay} onClick={cancelDelete}>
          <div style={s.modalCard} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Delete listing">
            <button onClick={cancelDelete} aria-label="Close" style={s.modalClose}>✕</button>
            <h3 style={s.modalTitle}>Delete this listing?</h3>
            <p style={s.modalText}>
              <strong>"{deleteTarget.title}"</strong> will be permanently removed. This action cannot be undone.
            </p>
            <div style={s.modalActions}>
              <button onClick={cancelDelete} disabled={deleting} style={s.modalCancel}>Cancel</button>
              <button onClick={confirmDelete} disabled={deleting} style={{...s.modalDelete, opacity: deleting ? 0.6 : 1}}>
                {deleting ? 'Deleting…' : 'Delete Listing'}
              </button>
            </div>
          </div>
        </div>
      )}
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
  listingCard:{ background:'white', borderRadius:10, marginBottom:10, border:'1px solid #E5E7EB', overflow:'visible' },
  rowActions:{ display:'flex', gap:8, padding:'10px 16px', borderTop:'1px solid #F3F4F6', background:'#FAFAFA' },
  editBtn:   { flex:1, display:'block', textAlign:'center', textDecoration:'none', background:'#F0F9F0', color:G, border:`1px solid ${G}`, padding:'7px 12px', borderRadius:8, cursor:'pointer', fontWeight:700, fontSize:12 },
  deleteBtn: { flex:1, background:'#FEE2E2', color:'#DC2626', border:'1px solid #FECACA', padding:'7px 12px', borderRadius:8, cursor:'pointer', fontWeight:700, fontSize:12 },
  modalOverlay:{ position:'fixed', inset:0, background:'rgba(15,23,42,0.55)', zIndex:1000,
                 display:'flex', alignItems:'center', justifyContent:'center', padding:20 },
  modalCard: { background:'white', borderRadius:16, maxWidth:420, width:'100%',
               padding:'32px 28px 24px', position:'relative', textAlign:'center',
               boxShadow:'0 20px 60px rgba(0,0,0,0.25)' },
  modalClose:{ position:'absolute', top:12, right:12, background:'#F3F4F6', border:'none',
               width:30, height:30, borderRadius:'50%', cursor:'pointer', color:'#6B7280',
               fontSize:13, fontWeight:700, lineHeight:1 },
  modalIcon: { width:56, height:56, borderRadius:'50%', background:'#FEF2F2',
               display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px',
               border:'1px solid #FECACA' },
  modalTitle:{ fontSize:19, fontWeight:800, color:'#111', margin:'0 0 8px' },
  modalText: { fontSize:14, color:'#6B7280', lineHeight:1.5, margin:'0 0 24px' },
  modalActions:{ display:'flex', gap:10 },
  modalCancel:{ flex:1, background:'#F3F4F6', color:'#444', border:'none', padding:'11px',
                borderRadius:10, cursor:'pointer', fontWeight:700, fontSize:14 },
  modalDelete:{ flex:1, background:'#DC2626', color:'white', border:'none', padding:'11px',
                borderRadius:10, cursor:'pointer', fontWeight:700, fontSize:14 },

  rewardHero:{ background:G, borderRadius:16, padding:'24px', color:'white', display:'flex',
               justifyContent:'space-between', alignItems:'center', gap:16, flexWrap:'wrap',
               marginBottom:14 },
  rewardLabel:{ fontSize:11, fontWeight:800, letterSpacing:1.5, textTransform:'uppercase', color:GOLD },
  rewardBalance:{ fontSize:34, fontWeight:900, margin:'4px 0 6px', fontFamily:'Georgia,serif' },
  rewardSub:{ fontSize:12, color:'rgba(255,255,255,0.7)', lineHeight:1.6 },
  withdrawBtn:{ display:'flex', alignItems:'center', gap:7, background:GOLD, color:'white', border:'none',
                padding:'12px 22px', borderRadius:10, cursor:'pointer', fontWeight:800, fontSize:14 },
  pendingBox:{ background:'#FEF3C7', border:'1px solid #FDE68A', color:'#92400E', borderRadius:10,
               padding:'12px 14px', fontSize:12.5, lineHeight:1.6, marginBottom:14 },
  shareCard:{ background:'white', border:'1px solid #E5E7EB', borderRadius:12, padding:'18px 20px',
              display:'flex', justifyContent:'space-between', alignItems:'center', gap:14,
              flexWrap:'wrap', marginBottom:22 },
  shareLabel:{ fontSize:11, fontWeight:700, color:'#888', textTransform:'uppercase', letterSpacing:1, marginBottom:4 },
  shareCode:{ fontSize:20, fontWeight:900, color:G, fontFamily:'Courier New,monospace', letterSpacing:2 },
  shareActions:{ display:'flex', gap:8, flexWrap:'wrap' },
  copyBtn:{ display:'flex', alignItems:'center', gap:5, background:'#F0F9F0', color:G,
            border:'1px solid #BBF7D0', padding:'8px 12px', borderRadius:8, cursor:'pointer',
            fontWeight:700, fontSize:12 },
  rewardSectionTitle:{ fontSize:15, fontWeight:800, color:'#111', margin:'0 0 10px' },
  rewardList:{ background:'white', border:'1px solid #E5E7EB', borderRadius:12, overflow:'hidden', marginBottom:22 },
  rewardRow:{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12,
              padding:'13px 16px', borderBottom:'1px solid #F3F4F6' },
  rewardRowTitle:{ fontSize:13.5, fontWeight:700, color:'#111', marginBottom:2 },
  rewardRowSub:{ fontSize:11.5, color:'#888' },
  rewardRowNote:{ fontSize:11.5, color:'#92400E', marginTop:4 },
  rewardAmount:{ fontSize:14, fontWeight:800, color:'#16A34A', whiteSpace:'nowrap' },
  withdrawalBadge:{ fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:0.6,
                    padding:'4px 9px', borderRadius:20 },
  rewardEmpty:{ fontSize:13, color:'#888', padding:'16px 0 24px' },
};

export default Dashboard;
