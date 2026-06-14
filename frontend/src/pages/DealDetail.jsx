import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  getDeal, confirmMoveIn, raiseDispute, cancelDeal, sendMessage, getMessages,
  createListing, getDashboard, getPendingAgents,
  verifyAgent, getAllDeals, releaseFunds, resolveDispute,
  getAgent, submitReview, getAgentReviews, getWaitlist
} from '../utils/api';
import { useAuth } from '../App';
import { Shield, CheckCircle, AlertTriangle, FileText, MessageSquare } from 'lucide-react';

const G    = '#1B4332';
const GOLD = '#C8963C';

// ── DEAL DETAIL ──────────────────────────────────────────────────────────────
export function DealDetail() {
  const { id }          = useParams();
  const { user }        = useAuth();
  const [deal, setDeal] = useState(null);
  const [loading, setL] = useState(true);
  const [reason, setR]  = useState('');
  const [messages, setMessages] = useState([]);
  const [msgText, setMsgText]   = useState('');
  const [msgLoading, setML]     = useState(false);
  const [reviewForm, setRF] = useState({ rating: 5, comment: '' });
  const [reviewed, setReviewed] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const fetchMessages = () =>
    getMessages(id).then(r => setMessages(r.data)).catch(() => {});

  useEffect(() => { fetchMessages(); }, [id]);

  useEffect(() => {
    getDeal(id).then(r=>setDeal(r.data)).finally(()=>setL(false));
  }, [id]);

  const handleConfirm = async () => {
    try {
      await confirmMoveIn(id);
      toast.success('Move-in confirmed! Funds are being released. 🎉');
      getDeal(id).then(r=>setDeal(r.data));
    } catch(err) { toast.error(err.response?.data?.error||'Failed.'); }
  };

  const handleDispute = async () => {
    if (!reason.trim()) { toast.error('Please describe the issue.'); return; }
    try {
      await raiseDispute(id, reason);
      toast.success('Dispute raised. SouthSwift will review within 24 hours.');
      getDeal(id).then(r=>setDeal(r.data));
    } catch(err) { toast.error(err.response?.data?.error||'Failed.'); }
  };

  const handleSendMessage = async () => {
    if (!msgText.trim()) return;
    const receiverId = user?.id === deal.tenant_id ? deal.agent_id : deal.tenant_id;
    setML(true);
    try {
      await sendMessage(id, receiverId, msgText.trim());
      setMsgText('');
      await fetchMessages();
    } catch(err) {
      toast.error(err.response?.data?.error || 'Failed to send message.');
    }
    setML(false);
  };

  const handleReview = async () => {
    try {
      await submitReview({ deal_id: id, rating: reviewForm.rating, comment: reviewForm.comment });
      toast.success('Review submitted! ⭐');
      setReviewed(true);
    } catch(err) { toast.error(err.response?.data?.error || 'Failed to submit review.'); }
  };

  const handleCancel = async () => {
    if (!cancelReason) { toast.error('Please select a cancellation reason.'); return; }
    try {
      await cancelDeal(id, cancelReason);
      toast.success('Deal cancelled.');
      setShowCancelConfirm(false);
      getDeal(id).then(r=>setDeal(r.data));
    } catch(err) { toast.error(err.response?.data?.error||'Failed to cancel deal.'); }
  };

  if (loading) return <div style={ps.loading}>🛡️ Loading deal...</div>;
  if (!deal)   return <div style={ps.loading}>Deal not found.</div>;

  const isTenant = deal.tenant_id === user?.id;
  const isParty = deal.tenant_id === user?.id || deal.agent_id === user?.id;
  const canCancel = isParty && ['initiated','payment_pending'].includes(deal.status);
  const canConfirm = isTenant && ['escrow_held','docs_generated'].includes(deal.status);

  return (
    <div style={ps.page}>
      <div style={ps.container}>
        <div style={ps.dealHeader}>
          <Shield size={24} color={GOLD}/>
          <div>
            <h1 style={ps.dealTitle}>{deal.listing_title}</h1>
            <div style={ps.dealSub}>{deal.city}, {deal.state}</div>
          </div>
          <div style={{...ps.statusBig,
            background:deal.status==='completed'?'#DCFCE7':deal.status==='cancelled'?'#FEE2E2':deal.status==='disputed'?'#FEE2E2':'#FEF3C7',
            color:deal.status==='completed'?'#166534':deal.status==='cancelled'?'#DC2626':deal.status==='disputed'?'#DC2626':'#92400E'}}>
            {deal.status === 'initiated' || deal.status === 'payment_pending' ? 'AWAITING PAYMENT' : deal.status.replace(/_/g,' ').toUpperCase()}
          </div>
        </div>

        <div style={ps.layout}>
          <div style={ps.left}>
            <div style={ps.infoCard}>
              <h3 style={ps.cardTitle}>Deal Breakdown</h3>
              {[['Rent Amount',`₦${Number(deal.rent_amount).toLocaleString()}`],
                ['SwiftShield Fee — Tenant (2.5%)',`₦${Number(deal.service_fee_tenant).toLocaleString()}`],
                ['SwiftShield Fee — Landlord (2.5%)',`₦${Number(deal.service_fee_landlord).toLocaleString()}`],
                ['Total Platform Fee (5%)',`₦${(Number(deal.service_fee_tenant)+Number(deal.service_fee_landlord)).toLocaleString()}`],
                ['Tenant Total',`₦${Number(deal.total_paid).toLocaleString()}`],
                ['Landlord Disbursement',`₦${(Number(deal.rent_amount)-Number(deal.service_fee_landlord)).toLocaleString()}`],
                ['Lease Duration',`${deal.lease_duration_months} months`],
                ['Move-in Date', deal.move_in_date ? new Date(deal.move_in_date).toLocaleDateString('en-NG') : 'Not set'],
                ['Deal ID', deal.id.slice(0,8)+'...'],
                ['Paystack Ref', deal.paystack_reference||'Awaiting Payment'],
              ].map(([k,v])=>(
                <div key={k} style={ps.row}>
                  <span style={ps.rowK}>{k}</span>
                  <span style={ps.rowV}>{v}</span>
                </div>
              ))}
            </div>

            <div style={ps.infoCard}>
              <h3 style={ps.cardTitle}>Parties</h3>
              {[['Tenant', deal.tenant_name, deal.tenant_phone],
                ['Agent',  deal.agent_name,  deal.agent_phone]].map(([role,name,phone])=>(
                <div key={role} style={ps.party}>
                  <div style={ps.partyRole}>{role}</div>
                  <div style={ps.partyName}>{name}</div>
                  <div style={ps.partyPhone}>{phone}</div>
                </div>
              ))}
            </div>

            {deal.swiftdoc_url && (
              <div style={ps.infoCard}>
                <h3 style={ps.cardTitle}><FileText size={15}/> SwiftDoc — Tenancy Agreement</h3>
                <a href={deal.swiftdoc_url} target="_blank" rel="noreferrer" style={ps.docLink}>
                  📄 Download Your SwiftDoc Agreement
                </a>
              </div>
            )}
          </div>

          <div style={ps.right}>
            {/* SwiftShield Progress */}
            <div style={ps.progressCard}>
              <h3 style={ps.cardTitle}>SwiftShield Progress</h3>
              {['initiated','escrow_held','docs_generated','completed'].map((step,i)=>{
                const steps = ['initiated','escrow_held','docs_generated','completed'];
                const curIdx = steps.indexOf(deal.status);
                const done = i <= curIdx;
                const labels = ['Deal Initiated','Funds in Escrow','Docs Generated','Completed'];
                return (
                  <div key={step} style={ps.step}>
                    <div style={{...ps.dot, background:done?'#22C55E':'#DDD'}}>{done?'✓':''}</div>
                    <span style={{...ps.stepLabel, color:done?'#111':'#999', fontWeight:done?700:400}}>{labels[i]}</span>
                  </div>
                );
              })}
            </div>

            {canConfirm && (
              <div style={ps.actionCard}>
                <h3 style={{...ps.cardTitle, color:'#166534'}}>✅ Ready to Move In?</h3>
                <p style={ps.actionDesc}>Once you confirm, funds will be released to your landlord and the deal will be complete.</p>
                <button onClick={handleConfirm} style={ps.confirmBtn}>
                  Confirm Move-In & Release Funds
                </button>
              </div>
            )}

            {canCancel && (
              <div style={{...ps.actionCard, background:'#FFF7ED', border:'1px solid #FED7AA'}}>
                {!showCancelConfirm ? (
                  <>
                    <h3 style={{...ps.cardTitle, color:'#9A3412'}}>Cancel Deal</h3>
                    <p style={{fontSize:12.5, color:'#9A3412', marginBottom:14}}>No payment has been made. You can cancel this deal freely.</p>
                    <button onClick={()=>setShowCancelConfirm(true)} style={{...ps.disputeBtn, background:'#EA580C'}}>Cancel Deal</button>
                  </>
                ) : (
                  <>
                    <h3 style={{...ps.cardTitle, color:'#9A3412'}}>Are you sure you want to cancel this deal?</h3>
                    <p style={{fontSize:12, color:'#9A3412', marginBottom:10}}>This action cannot be undone.</p>
                    <label style={{display:'block',fontSize:12,fontWeight:700,color:'#444',marginBottom:5}}>Reason for cancellation *</label>
                    <select style={{width:'100%',border:'1px solid #FED7AA',borderRadius:8,padding:'10px 12px',fontSize:13,boxSizing:'border-box',marginBottom:10}} value={cancelReason} onChange={e=>setCancelReason(e.target.value)}>
                      <option value="">Select a reason</option>
                      <option value="Property no longer available">Property no longer available</option>
                      <option value="Changed my mind">Changed my mind</option>
                      <option value="Found alternative property">Found alternative property</option>
                      <option value="Landlord unresponsive">Landlord unresponsive</option>
                      <option value="Other">Other</option>
                    </select>
                    <div style={{display:'flex',gap:8}}>
                      <button onClick={()=>setShowCancelConfirm(false)} style={{flex:1,background:'#F3F4F6',color:'#444',border:'none',padding:'11px',borderRadius:10,cursor:'pointer',fontWeight:700,fontSize:13}}>Go Back</button>
                      <button onClick={handleCancel} disabled={!cancelReason} style={{flex:1,background:'#DC2626',color:'white',border:'none',padding:'11px',borderRadius:10,cursor:'pointer',fontWeight:700,fontSize:13,opacity:cancelReason?1:0.5}}>Confirm Cancellation</button>
                    </div>
                  </>
                )}
              </div>
            )}

            {isTenant && !['completed','disputed','cancelled'].includes(deal.status) && !canCancel && (
              <div style={ps.disputeCard}>
                <h3 style={{...ps.cardTitle, color:'#DC2626'}}><AlertTriangle size={15}/> Raise a Dispute</h3>
                <textarea style={ps.textarea} placeholder="Describe the issue in detail..." value={reason} onChange={e=>setR(e.target.value)} />
                <button onClick={handleDispute} style={ps.disputeBtn}>Raise Dispute with SouthSwift</button>
              </div>
            )}

            {['escrow_held','docs_generated','movein_pending','completed','disputed'].includes(deal.status) && (
              <div style={ps.infoCard}>
                <h3 style={ps.cardTitle}><MessageSquare size={15}/> SwiftConnect</h3>
                <div style={{maxHeight:220, overflowY:'auto', marginBottom:10}}>
                  {messages.length === 0
                    ? <p style={{fontSize:12, color:'#888', textAlign:'center', padding:'20px 0'}}>No messages yet.</p>
                    : messages.map(m => (
                        <div key={m.id} style={{
                          display:'flex', flexDirection:'column',
                          alignItems: m.sender_id === user?.id ? 'flex-end' : 'flex-start',
                          marginBottom:8
                        }}>
                          <div style={{
                            background: m.sender_id === user?.id ? G : '#F3F4F6',
                            color: m.sender_id === user?.id ? 'white' : '#111',
                            padding:'8px 12px', borderRadius:10, fontSize:12.5, maxWidth:'80%'
                          }}>
                            {m.content}
                          </div>
                          <span style={{fontSize:10, color:'#999', marginTop:2}}>{m.sender_name}</span>
                        </div>
                      ))
                  }
                </div>
                <div style={{display:'flex', gap:8}}>
                  <input
                    style={{...ps.input, flex:1, padding:'8px 10px'}}
                    placeholder="Type a message..."
                    value={msgText}
                    onChange={e => setMsgText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !msgLoading && handleSendMessage()}
                  />
                  <button
                    disabled={msgLoading || !msgText.trim()}
                    onClick={handleSendMessage}
                    style={{background:G, color:'white', border:'none', padding:'8px 14px',
                            borderRadius:8, cursor:'pointer', fontWeight:700, fontSize:12,
                            opacity: msgLoading ? 0.6 : 1}}
                  >
                    Send
                  </button>
                </div>
              </div>
            )}

            {deal.status === 'completed' && user?.id === deal.tenant_id && !reviewed && (
              <div style={{...ps.actionCard, background:'#FFFBEB', border:'1px solid #FDE68A'}}>
                <h3 style={{...ps.cardTitle, color:'#92400E'}}>⭐ Rate Your Agent</h3>
                <p style={{fontSize:12, color:'#78350F', marginBottom:10}}>
                  How was your experience with {deal.agent_name}?
                </p>
                <div style={{display:'flex', gap:6, marginBottom:10}}>
                  {[1,2,3,4,5].map(n => (
                    <button key={n} onClick={() => setRF(f=>({...f, rating:n}))}
                      style={{fontSize:22, background:'none', border:'none', cursor:'pointer',
                              opacity: n <= reviewForm.rating ? 1 : 0.3}}>
                      ⭐
                    </button>
                  ))}
                </div>
                <textarea style={{...ps.textarea, borderColor:'#FDE68A'}}
                  placeholder="Optional comment..."
                  value={reviewForm.comment}
                  onChange={e => setRF(f=>({...f, comment:e.target.value}))} />
                <button onClick={handleReview} style={{...ps.confirmBtn, background:'#92400E'}}>
                  Submit Review
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── CREATE LISTING ───────────────────────────────────────────────────────────
// ── CREATE LISTING (with Nominatim / OpenStreetMap address search) ───────────
export function CreateListing() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: '', description: '', property_type: 'apartment',
    bedrooms: 1, bathrooms: 1, rent_price: '', rent_period: 'yearly',
    address: '', city: '', state: '', amenities: '',
    latitude: null, longitude: null,
    is_room_share: false, room_share_price_per_person: '', room_share_slots: 2,
  });
  const [loading, setL]      = useState(false);
  const [images, setImages]  = useState([]);
  const [previews, setPreviews] = useState([]);
  const [videos, setVideos]  = useState([]);

  // Nominatim address search
  const [addrQuery, setAddrQuery]         = useState('');
  const [addrResults, setAddrResults]     = useState([]);
  const [addrSearching, setAddrSearching] = useState(false);
  const [addrTimer, setAddrTimer]         = useState(null);

  const handleImages = (e) => {
    const files = Array.from(e.target.files).slice(0, 6);
    setImages(files);
    setPreviews(files.map(f => URL.createObjectURL(f)));
  };

  const handleVideos = (e) => {
    setVideos(Array.from(e.target.files).slice(0, 3));
  };

  const handleAddrInput = (value) => {
    setAddrQuery(value);
    setForm(f => ({ ...f, address: value, latitude: null, longitude: null }));
    if (addrTimer) clearTimeout(addrTimer);
    if (value.length < 4) { setAddrResults([]); return; }
    const t = setTimeout(async () => {
      setAddrSearching(true);
      try {
        const q = encodeURIComponent(`${value}, Nigeria`);
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=5&countrycodes=ng&addressdetails=1`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const data = await res.json();
        setAddrResults(data);
      } catch { setAddrResults([]); }
      setAddrSearching(false);
    }, 500);
    setAddrTimer(t);
  };

  const selectAddr = (result) => {
    const city  = result.address?.city || result.address?.town || result.address?.village || '';
    const state = result.address?.state || '';
    setAddrQuery(result.display_name);
    setAddrResults([]);
    setForm(f => ({
      ...f,
      address:   result.display_name,
      city:      city  || f.city,
      state:     state || f.state,
      latitude:  parseFloat(result.lat),
      longitude: parseFloat(result.lon),
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (form.is_room_share && !(Number(form.room_share_price_per_person) > 0)) {
      toast.error('Please set a price per person for the room share.');
      return;
    }
    setL(true);
    try {
      const data = {
        ...form,
        amenities: form.amenities ? form.amenities.split(',').map(a => a.trim()) : [],
        images,
        videos,
      };
      const res = await createListing(data);
      toast.success('Listing created! 🏠');
      navigate(`/listings/${res.data.id}`);
    } catch(err) {
      toast.error(err.response?.data?.error || 'Failed to create listing.');
    }
    setL(false);
  };

  return (
    <div style={ps.page}>
      <div style={{ ...ps.container, maxWidth: 640 }}>
        <h1 style={ps.pageTitle}>Add New Listing</h1>
        <form onSubmit={submit} style={ps.form}>

          {/* Title */}
          <div>
            <label style={ps.label}>Property Title *</label>
            <input style={ps.input} type="text" value={form.title} placeholder="3-Bedroom Flat in Lekki Phase 1"
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}/>
          </div>

          {/* ── ADDRESS SEARCH (Nominatim / OpenStreetMap) ── */}
          <div style={{ position: 'relative' }}>
            <label style={ps.label}>Full Address *</label>
            <input
              style={ps.input}
              type="text"
              placeholder="Start typing address in Nigeria..."
              value={addrQuery}
              onChange={e => handleAddrInput(e.target.value)}
              autoComplete="off"
            />
            {addrSearching && <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>Searching...</div>}
            {addrResults.length > 0 && (
              <div style={ps.addrDropdown}>
                {addrResults.map((r, i) => (
                  <div key={i} style={ps.addrItem} onClick={() => selectAddr(r)}>
                    📍 {r.display_name}
                  </div>
                ))}
              </div>
            )}
            {form.latitude && (
              <span style={{ fontSize: 11, color: '#22C55E', marginTop: 4, display: 'block' }}>
                ✓ Location pinned ({form.latitude.toFixed(4)}, {form.longitude.toFixed(4)})
              </span>
            )}
          </div>

          {/* City + State — auto-filled by autocomplete but editable */}
          <div style={ps.row2}>
            <div style={{ flex: 1 }}>
              <label style={ps.label}>City *</label>
              <input style={ps.input} type="text" value={form.city} placeholder="Lagos"
                onChange={e => setForm(f => ({ ...f, city: e.target.value }))}/>
            </div>
            <div style={{ flex: 1 }}>
              <label style={ps.label}>State *</label>
              <select style={ps.input} value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))}>
                <option value="">Select</option>
                {['Lagos','Abuja','Rivers','Oyo','Kwara','Osun','Ekiti','Enugu','Kano','Kaduna','Ogun','Delta'].map(st => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Rent */}
          <div>
            <label style={ps.label}>Rent Price (₦) *</label>
            <input style={ps.input} type="number" value={form.rent_price} placeholder="800000"
              onChange={e => setForm(f => ({ ...f, rent_price: e.target.value }))}/>
          </div>

          {/* Room Share Toggle */}
          <div>
            <label style={ps.label}>
              <input type="checkbox" checked={form.is_room_share}
                onChange={e => setForm(f => ({ ...f, is_room_share: e.target.checked }))}
                style={{ marginRight: 8 }}/>
              Room Share Available
            </label>
            <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
              Enable if multiple tenants can co-rent this property by splitting the cost.
            </p>
          </div>

          {form.is_room_share && (
            <div style={ps.row2}>
              <div style={{ flex: 1 }}>
                <label style={ps.label}>Price Per Person (₦) *</label>
                <input style={ps.input} type="number"
                  placeholder="e.g. 200000"
                  value={form.room_share_price_per_person}
                  onChange={e => setForm(f => ({ ...f, room_share_price_per_person: e.target.value }))}/>
              </div>
              <div style={{ flex: 1 }}>
                <label style={ps.label}>Number of Slots *</label>
                <select style={ps.input} value={form.room_share_slots}
                  onChange={e => setForm(f => ({ ...f, room_share_slots: Number(e.target.value) }))}>
                  {[2, 3, 4].map(n => <option key={n} value={n}>{n} tenants</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Description */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={ps.label}>Description</label>
            <textarea style={{ ...ps.input, minHeight: 100, resize: 'vertical' }} value={form.description}
              placeholder="Describe the property in detail — size, condition, neighbourhood, nearby landmarks, access to utilities..."
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}/>
          </div>

          {/* Amenities */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={ps.label}>Amenities</label>
            <input style={ps.input} type="text" value={form.amenities}
              placeholder="e.g. Generator, Swimming Pool, Gym, Security, Parking"
              onChange={e => setForm(f => ({ ...f, amenities: e.target.value }))}/>
            <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
              Separate each amenity with a comma. Avoid special characters like &amp; or /
            </p>
          </div>

          {/* Photos */}
          <div>
            <label style={ps.label}>Property Photos (up to 6)</label>
            <input type="file" accept="image/*" multiple onChange={handleImages}
              style={{ ...ps.input, padding: '6px' }}/>
            {previews.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                {previews.map((src, i) => (
                  <img key={i} src={src} alt=""
                    style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 6, border: '1px solid #DDD' }}/>
                ))}
              </div>
            )}
          </div>

          {/* Videos */}
          <div>
            <label style={ps.label}>Property Video Tour (up to 3)</label>
            <input type="file" accept="video/*" multiple onChange={handleVideos}
              style={{ ...ps.input, padding: '6px' }}/>
            <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
              Optional. Up to 3 short walkthrough videos (max 100MB each).
            </p>
            {videos.length > 0 && (
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: '#444' }}>
                {videos.map((f, i) => <li key={i}>{f.name}</li>)}
              </ul>
            )}
          </div>

          {/* Type + Beds */}
          <div style={ps.row2}>
            <div style={{ flex: 1 }}>
              <label style={ps.label}>Type</label>
              <select style={ps.input} value={form.property_type}
                onChange={e => setForm(f => ({ ...f, property_type: e.target.value }))}>
                {['apartment','house','room','duplex','bungalow','studio'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={ps.label}>Bedrooms</label>
              <select style={ps.input} value={form.bedrooms}
                onChange={e => setForm(f => ({ ...f, bedrooms: Number(e.target.value) }))}>
                {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          {/* Rent Period */}
          <div>
            <label style={ps.label}>Rent Period</label>
            <select style={ps.input} value={form.rent_period}
              onChange={e => setForm(f => ({ ...f, rent_period: e.target.value }))}>
              <option value="yearly">Yearly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          <button style={{ ...ps.confirmBtn, opacity: loading ? 0.7 : 1 }} disabled={loading}>
            {loading ? 'Creating...' : '🏠 Create Listing'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── ADMIN PANEL ──────────────────────────────────────────────────────────────
export function AdminPanel() {
  const [tab, setTab]     = useState('dashboard');
  const [stats, setStats] = useState({});
  const [agents, setAgents] = useState([]);
  const [deals, setDeals]   = useState([]);
  const [disputes, setDisputes] = useState([]);
  const [resForm, setResForm]   = useState({});
  const [waitlistData, setWaitlistData] = useState([]);

  useEffect(() => {
    getDashboard().then(r=>setStats(r.data)).catch(()=>{});
    getPendingAgents().then(r=>setAgents(r.data)).catch(()=>{});
    getAllDeals().then(r => {
      setDeals(r.data);
      setDisputes(r.data.filter(d => d.status === 'disputed'));
    }).catch(() => {});
    getWaitlist().then(r => setWaitlistData(r.data)).catch(() => {});
  }, []);

  const handleVerify = async (userId, action) => {
    try {
      await verifyAgent(userId, action);
      toast.success(`Agent ${action}d`);
      getPendingAgents().then(r=>setAgents(r.data));
    } catch(err) { toast.error('Failed'); }
  };

  return (
    <div style={ps.page}>
      <div style={ps.container}>
        <h1 style={ps.pageTitle}>🛡️ SouthSwift Admin</h1>
        <div style={ps.tabs}>
          {['dashboard','agents','deals','disputes','waitlist'].map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{...ps.tab, ...(tab===t?ps.tabA:{})}}>
              {t.charAt(0).toUpperCase()+t.slice(1)}
            </button>
          ))}
        </div>

        {tab==='dashboard' && (
          <div style={ps.statsGrid}>
            {[['👥',stats.total_users,'Total Users'],['🏠',stats.total_listings,'Listings'],
              ['✅',stats.completed_deals,'Completed Deals'],['🛡️',stats.verified_agents,'Verified Agents'],
              ['₦',`${Number(stats.total_revenue_ngn||0).toLocaleString()}`,'Total Revenue']].map(([icon,num,label])=>(
              <div key={label} style={ps.aStat}>
                <div style={ps.aStatIcon}>{icon}</div>
                <div style={ps.aStatNum}>{num}</div>
                <div style={ps.aStatLabel}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {tab==='agents' && (
          <div>
            <h3 style={{color:G, marginBottom:16}}>Pending Agent Verifications ({agents.length})</h3>
            {agents.length===0
              ? <p style={{color:'#888'}}>No pending verifications.</p>
              : agents.map(a=>(
                <div key={a.id} style={ps.agentRow}>
                  <div style={ps.agentAvatar}>{a.full_name[0]}</div>
                  <div style={{flex:1}}>
                    <div style={ps.agentName}>{a.full_name}</div>
                    <div style={ps.agentDetail}>{a.email} · {a.phone} · NIN: {a.nin}</div>
                    {a.agency_name && <div style={ps.agentDetail}>Agency: {a.agency_name}</div>}
                    {a.bio && <div style={ps.agentDetail}>{a.bio}</div>}
                  </div>
                  <div style={ps.agentBtns}>
                    <button onClick={()=>handleVerify(a.id,'verify')} style={ps.verBtn}>✓ Verify</button>
                    <button onClick={()=>handleVerify(a.id,'reject')} style={ps.rejBtn}>✗ Reject</button>
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {tab==='deals' && (
          <div>
            <h3 style={{color:G, marginBottom:16}}>All Deals ({deals.length})</h3>
            {deals.map(d=>(
              <div key={d.id} style={ps.dealRowA}>
                <div style={{flex:2}}>
                  <div style={ps.agentName}>{d.listing_title} — {d.city}</div>
                  <div style={ps.agentDetail}>Tenant: {d.tenant_name} · Agent: {d.agent_name}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontWeight:700, color:G}}>₦{Number(d.rent_amount).toLocaleString()}</div>
                  <div style={{fontSize:11, color:'#888'}}>{d.status}</div>
                  {d.status==='escrow_held' && (
                    <button onClick={async()=>{await releaseFunds(d.id);toast.success('Funds released');}} style={ps.relBtn}>Release Funds</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'waitlist' && (
          <div>
            <h3 style={{color:G, marginBottom:16}}>Waitlist Signups ({waitlistData.length})</h3>
            {waitlistData.length === 0
              ? <p style={{color:'#888'}}>No waitlist signups yet.</p>
              : (
                <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%', borderCollapse:'collapse', background:'white', borderRadius:10, overflow:'hidden', border:'1px solid #E5E7EB'}}>
                    <thead>
                      <tr style={{background:G, color:'white'}}>
                        {['Email','Phone','Role','City','State','Signed Up'].map(h => (
                          <th key={h} style={{padding:'10px 14px', textAlign:'left', fontSize:12, fontWeight:700}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {waitlistData.map((w, i) => (
                        <tr key={w.id} style={{borderBottom:'1px solid #F3F4F6', background: i%2===0?'white':'#F8FAF8'}}>
                          <td style={{padding:'10px 14px', fontSize:13}}>{w.email}</td>
                          <td style={{padding:'10px 14px', fontSize:13, color:'#888'}}>{w.phone || '—'}</td>
                          <td style={{padding:'10px 14px', fontSize:12}}>
                            <span style={{background:'rgba(27,67,50,0.1)', color:G, padding:'2px 8px', borderRadius:10, fontWeight:700, textTransform:'capitalize'}}>
                              {w.role || '—'}
                            </span>
                          </td>
                          <td style={{padding:'10px 14px', fontSize:13, color:'#444'}}>{w.city || '—'}</td>
                          <td style={{padding:'10px 14px', fontSize:13, color:'#444'}}>{w.state || '—'}</td>
                          <td style={{padding:'10px 14px', fontSize:12, color:'#888'}}>
                            {new Date(w.created_at).toLocaleDateString('en-NG')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
          </div>
        )}

        {tab === 'disputes' && (
          <div>
            <h3 style={{color:G, marginBottom:16}}>Active Disputes ({disputes.length})</h3>
            {disputes.length === 0
              ? <p style={{color:'#888'}}>No active disputes.</p>
              : disputes.map(d => (
                  <div key={d.id} style={{background:'#FFF7F7', borderRadius:10, padding:'16px 18px',
                                          marginBottom:14, border:'1px solid #FECACA'}}>
                    <div style={{fontWeight:700, fontSize:14, color:'#111', marginBottom:4}}>
                      {d.listing_title} — {d.city}
                    </div>
                    <div style={{fontSize:12, color:'#888', marginBottom:4}}>
                      Tenant: {d.tenant_name} · Agent: {d.agent_name} · ₦{Number(d.rent_amount).toLocaleString()}
                    </div>
                    <div style={{fontSize:12, color:'#DC2626', marginBottom:10}}>
                      <strong>Dispute:</strong> {d.dispute_reason}
                    </div>
                    <textarea
                      placeholder="Enter resolution details..."
                      value={resForm[d.id]?.resolution || ''}
                      onChange={e => setResForm(f => ({...f, [d.id]: {...f[d.id], resolution: e.target.value}}))}
                      style={{width:'100%', border:'1px solid #FECACA', borderRadius:8, padding:'8px',
                              fontSize:12, height:60, boxSizing:'border-box', marginBottom:8}}
                    />
                    <div style={{display:'flex', gap:8}}>
                      {['tenant','agent','split'].map(w => (
                        <button key={w} onClick={() => setResForm(f => ({...f, [d.id]: {...f[d.id], winner:w}}))}
                          style={{padding:'5px 12px', borderRadius:6, border:'1px solid #DDD',
                                  background: resForm[d.id]?.winner === w ? G : 'white',
                                  color: resForm[d.id]?.winner === w ? 'white' : '#444',
                                  cursor:'pointer', fontSize:12, textTransform:'capitalize'}}>
                          {w}
                        </button>
                      ))}
                      <button
                        disabled={!resForm[d.id]?.resolution || !resForm[d.id]?.winner}
                        onClick={async () => {
                          try {
                            await resolveDispute(d.id, resForm[d.id]);
                            toast.success('Dispute resolved');
                            getAllDeals().then(r => {
                              setDeals(r.data);
                              setDisputes(r.data.filter(x => x.status === 'disputed'));
                            });
                          } catch(err) { toast.error('Failed to resolve dispute.'); }
                        }}
                        style={{marginLeft:'auto', background:'#DC2626', color:'white', border:'none',
                                padding:'6px 14px', borderRadius:8, cursor:'pointer', fontWeight:700, fontSize:12}}>
                        Resolve
                      </button>
                    </div>
                  </div>
                ))
            }
          </div>
        )}
      </div>
    </div>
  );
}

// ── AGENT PROFILE ────────────────────────────────────────────────────────────
export function AgentProfile() {
  const { id }          = useParams();
  const [agent, setAgent] = useState(null);
  const [reviews, setReviews] = useState([]);

  useEffect(() => {
    getAgent(id).then(r => setAgent(r.data)).catch(() => {});
    getAgentReviews(id).then(r => setReviews(r.data)).catch(() => {});
  }, [id]);
  if (!agent) return <div style={ps.loading}>Loading...</div>;

  return (
    <div style={ps.page}>
      <div style={{...ps.container, maxWidth:680}}>
        <div style={ps.agentHero}>
          <div style={{...ps.agentAvatar, width:72, height:72, fontSize:28}}>{agent.full_name[0]}</div>
          <div>
            <h1 style={ps.pageTitle}>{agent.full_name}</h1>
            {agent.agency_name && <div style={{color:GOLD, fontWeight:600}}>{agent.agency_name}</div>}
            {agent.verification_status==='verified' && <div style={{color:'#22C55E', fontWeight:700, fontSize:13}}><CheckCircle size={13}/> SouthSwift Verified Agent</div>}
            <div style={ps.agentDetail}>⭐ {agent.rating||'0.0'} · {agent.total_deals||0} completed deals · {agent.city}, {agent.state}</div>
          </div>
        </div>
        {agent.bio && <div style={ps.agentBio}>{agent.bio}</div>}
        {agent.intro_video_url && (
          <div style={{...ps.agentBio, marginTop:16}}>
            <h3 style={{fontSize:15, fontWeight:700, color:G, margin:'0 0 12px'}}>Intro Video</h3>
            <video src={agent.intro_video_url} controls playsInline preload="metadata"
              style={{width:'100%', maxWidth:560, borderRadius:10, background:'#000'}}/>
          </div>
        )}
        {reviews.length > 0 && (
          <div style={{background:'white', borderRadius:12, padding:'20px', border:'1px solid #E5E7EB', marginTop:16}}>
            <h3 style={{fontSize:15, fontWeight:700, color:G, margin:'0 0 14px'}}>
              Tenant Reviews ({reviews.length})
            </h3>
            {reviews.map((r, i) => (
              <div key={i} style={{borderBottom:'1px solid #F3F4F6', paddingBottom:12, marginBottom:12}}>
                <div style={{display:'flex', justifyContent:'space-between', marginBottom:4}}>
                  <span style={{fontWeight:700, fontSize:13, color:'#111'}}>{r.reviewer_name}</span>
                  <span style={{color:GOLD}}>{'⭐'.repeat(r.rating)}</span>
                </div>
                {r.comment && <p style={{fontSize:13, color:'#444', margin:0}}>{r.comment}</p>}
                <span style={{fontSize:10, color:'#999'}}>{new Date(r.created_at).toLocaleDateString('en-NG')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const ps = {
  page:       { fontFamily:'Arial,sans-serif', minHeight:'80vh', background:'#F8FAF8' },
  container:  { maxWidth:1000, margin:'0 auto', padding:'28px 20px' },
  loading:    { textAlign:'center', padding:80, fontSize:16, color:G },
  dealHeader: { display:'flex', alignItems:'center', gap:14, background:'white', borderRadius:14,
                padding:'20px 24px', marginBottom:24, border:'1px solid #E5E7EB', flexWrap:'wrap' },
  dealTitle:  { fontSize:20, fontWeight:800, color:'#111', margin:0 },
  dealSub:    { fontSize:13, color:'#888' },
  statusBig:  { padding:'6px 16px', borderRadius:20, fontSize:12, fontWeight:700, marginLeft:'auto' },
  layout:     { display:'flex', gap:22, alignItems:'flex-start', flexWrap:'wrap' },
  left:       { flex:1.5, minWidth:280 },
  right:      { flex:1, minWidth:260 },
  infoCard:   { background:'white', borderRadius:12, padding:'18px 20px', marginBottom:16, border:'1px solid #E5E7EB' },
  cardTitle:  { display:'flex', alignItems:'center', gap:6, fontSize:15, fontWeight:700, color:G, margin:'0 0 14px' },
  row:        { display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:'1px solid #F3F4F6' },
  rowK:       { fontSize:12, color:'#888' },
  rowV:       { fontSize:13, fontWeight:600, color:'#111' },
  party:      { marginBottom:14, paddingBottom:14, borderBottom:'1px solid #F3F4F6' },
  partyRole:  { fontSize:10, fontWeight:700, color:GOLD, textTransform:'uppercase', letterSpacing:1 },
  partyName:  { fontSize:14, fontWeight:700, color:'#111' },
  partyPhone: { fontSize:12, color:'#888' },
  docLink:    { display:'inline-block', background:'#F0F9F0', color:G, padding:'10px 16px',
                borderRadius:8, textDecoration:'none', fontWeight:700, fontSize:13, marginTop:4 },
  progressCard:{ background:'white', borderRadius:12, padding:'18px 20px', marginBottom:16, border:'1px solid #E5E7EB' },
  step:       { display:'flex', alignItems:'center', gap:10, marginBottom:12 },
  dot:        { width:22, height:22, borderRadius:'50%', color:'white', fontSize:11, fontWeight:700,
                display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
  stepLabel:  { fontSize:13 },
  actionCard: { background:'#F0FDF4', borderRadius:12, padding:'18px 20px', border:'1px solid #BBF7D0', marginBottom:16 },
  actionDesc: { fontSize:12.5, color:'#166534', marginBottom:14 },
  confirmBtn: { width:'100%', background:G, color:'white', border:'none', padding:'12px',
                borderRadius:10, cursor:'pointer', fontWeight:700, fontSize:14 },
  disputeCard:{ background:'#FFF7F7', borderRadius:12, padding:'18px 20px', border:'1px solid #FECACA' },
  textarea:   { width:'100%', border:'1px solid #FECACA', borderRadius:8, padding:'10px',
                fontSize:13, height:80, boxSizing:'border-box', resize:'vertical', marginBottom:10 },
  disputeBtn: { width:'100%', background:'#DC2626', color:'white', border:'none', padding:'11px',
                borderRadius:10, cursor:'pointer', fontWeight:700, fontSize:13 },
  form:       { background:'white', borderRadius:14, padding:'28px', border:'1px solid #E5E7EB' },
  pageTitle:  { fontSize:24, fontWeight:800, color:'#111', margin:'0 0 20px' },
  label:      { display:'block', fontSize:12, fontWeight:700, color:'#444', marginBottom:5, marginTop:14 },
  input:      { width:'100%', border:'1px solid #DDD', borderRadius:8, padding:'10px 12px',
                fontSize:13, boxSizing:'border-box', outline:'none' },
  row2:       { display:'flex', gap:14 },
  addrDropdown:{ position:'absolute', top:'100%', left:0, right:0, background:'white',
                 border:'1px solid #DDD', borderRadius:8, zIndex:200,
                 boxShadow:'0 4px 16px rgba(0,0,0,0.12)', maxHeight:220, overflowY:'auto' },
  addrItem:    { padding:'10px 14px', fontSize:13, color:'#333', cursor:'pointer',
                 borderBottom:'1px solid #F3F4F6', lineHeight:1.4 },
  tabs:       { display:'flex', gap:6, marginBottom:22 },
  tab:        { background:'transparent', border:'1px solid #DDD', padding:'8px 18px', borderRadius:8, cursor:'pointer', fontSize:13, color:'#666' },
  tabA:       { background:G, color:'white', border:`1px solid ${G}` },
  statsGrid:  { display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:14 },
  aStat:      { background:'white', borderRadius:12, padding:'20px', textAlign:'center', border:'1px solid #E5E7EB' },
  aStatIcon:  { fontSize:24, marginBottom:6 },
  aStatNum:   { fontSize:24, fontWeight:900, color:G },
  aStatLabel: { fontSize:11, color:'#888', marginTop:3 },
  agentRow:   { display:'flex', gap:14, background:'white', borderRadius:10, padding:'16px 18px',
                marginBottom:10, border:'1px solid #E5E7EB', alignItems:'center' },
  dealRowA:   { display:'flex', justifyContent:'space-between', background:'white', borderRadius:10,
                padding:'14px 18px', marginBottom:10, border:'1px solid #E5E7EB' },
  agentAvatar:{ width:44, height:44, borderRadius:'50%', background:G, color:'white',
                display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, flexShrink:0 },
  agentName:  { fontWeight:700, fontSize:14, color:'#111' },
  agentDetail:{ fontSize:12, color:'#888', marginTop:2 },
  agentBtns:  { display:'flex', gap:8, flexShrink:0 },
  verBtn:     { background:'#DCFCE7', color:'#166534', border:'none', padding:'7px 14px', borderRadius:8, cursor:'pointer', fontWeight:700, fontSize:12 },
  rejBtn:     { background:'#FEE2E2', color:'#DC2626', border:'none', padding:'7px 14px', borderRadius:8, cursor:'pointer', fontWeight:700, fontSize:12 },
  relBtn:     { background:GOLD, color:'white', border:'none', padding:'4px 10px', borderRadius:6, cursor:'pointer', fontSize:11, marginTop:4 },
  agentHero:  { display:'flex', gap:20, alignItems:'center', background:'white', borderRadius:14, padding:'24px', border:'1px solid #E5E7EB', marginBottom:20 },
  agentBio:   { background:'white', borderRadius:12, padding:'20px', border:'1px solid #E5E7EB', fontSize:14, color:'#444', lineHeight:1.7 },
};

export default DealDetail;
