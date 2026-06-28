import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { getListing, initiateDeal, getRoomShareStatus, isPaystackCheckoutUrl } from '../utils/api';
import { useAuth } from '../App';
import { Shield, MapPin, Bed, Bath, CheckCircle, Home, Star } from 'lucide-react';

const G    = '#1B4332';
const GOLD = '#C8963C';

// Inline SVG fallback. via.placeholder.com is dead and let iOS render alt text as
// link-coloured overlay on top of the broken image — switch to a self-contained data URI.
const PLACEHOLDER = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 480'%3E%3Crect width='800' height='480' fill='%231B4332'/%3E%3Cpath d='M400 180 L470 230 L470 310 L330 310 L330 230 Z' fill='%23C8963C' opacity='0.6'/%3E%3Ctext x='400' y='370' font-family='Arial' font-size='24' font-weight='700' fill='white' text-anchor='middle' opacity='0.7'%3ESouthSwift%3C/text%3E%3C/svg%3E";
const THUMB_PLACEHOLDER = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 70'%3E%3Crect width='100' height='70' fill='%231B4332'/%3E%3C/svg%3E";

// Fix Leaflet default marker icon broken by webpack
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const swiftIcon = new L.Icon({
  iconUrl: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42">' +
    '<path d="M16 0C7.16 0 0 7.16 0 16c0 12 16 26 16 26S32 28 32 16C32 7.16 24.84 0 16 0z" fill="#1B4332"/>' +
    '<circle cx="16" cy="16" r="8" fill="white"/>' +
    '<text x="16" y="20" text-anchor="middle" font-size="10" font-weight="900" fill="#1B4332">S</text>' +
    '</svg>'
  )}`,
  iconSize:    [32, 42],
  iconAnchor:  [16, 42],
  popupAnchor: [0, -42],
});


// -- MAP COMPONENT -------------------------------------------------------------
function ListingMap({ address, city, state, lat, lng }) {
  const [coords, setCoords] = useState(
    lat && lng ? [parseFloat(lat), parseFloat(lng)] : null
  );
  const [mapError, setMapError] = useState(false);

  useEffect(() => {
    if (coords) return;
    let cancelled = false;
    const query = encodeURIComponent(`${address}, ${city}, ${state}, Nigeria`);
    fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`, {
      headers: { 'Accept-Language': 'en' }
    })
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (data && data.length > 0) {
          setCoords([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
        } else { setMapError(true); }
      })
      .catch(() => { if (!cancelled) setMapError(true); });
    return () => { cancelled = true; };
  }, [address, city, state, coords]);

  if (mapError || (!coords && !lat && !lng)) return (
    <div style={ms.placeholder}><MapPin size={20} color="#CCC" /><span>Location unavailable</span></div>
  );
  if (!coords) return (
    <div style={ms.placeholder}><MapPin size={20} color="#CCC" /><span>Loading map...</span></div>
  );

  return (
    <MapContainer center={coords} zoom={15}
      style={{ width: '100%', height: 280, borderRadius: 12 }}
      scrollWheelZoom={false}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <Marker position={coords} icon={swiftIcon}>
        <Popup>{address}, {city}</Popup>
      </Marker>
    </MapContainer>
  );
}

const ms = {
  placeholder: { height: 280, background: '#F3F4F6', borderRadius: 12,
                 display: 'flex', flexDirection: 'column', alignItems: 'center',
                 justifyContent: 'center', gap: 8, color: '#999', fontSize: 13 },
};

// -- LISTING DETAIL PAGE -------------------------------------------------------
export default function ListingDetail() {
  const { id }            = useParams();
  const navigate          = useNavigate();
  const { user }          = useAuth();
  const [listing, setL]       = useState(null);
  const [loading, setLoad]    = useState(true);
  const [imgIdx, setImgIdx]   = useState(0);
  const [form, setForm]       = useState({ lease_duration_months: '', move_in_date: '' });
  const [dealing, setDealing] = useState(false);
  const [roomShare, setRoomShare] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [dealMode, setDealMode] = useState('standard'); // 'standard' | 'room_share'
  // SwiftDoc → SwiftCounsel → SwiftShield gate. Pure UI mask — no backend changes.
  // 'booking' (date + lease) → 'swiftdoc' (tenant info) → 'swiftcounsel' (legal) → 'payment'.
  const [step, setStep] = useState('booking');
  const [docForm, setDocForm] = useState({
    tenant_nin: '', occupation: '', employer: '',
    next_of_kin_name: '', next_of_kin_phone: '',
  });
  const [docErrors, setDocErrors] = useState({});
  const [legalAgreed, setLegalAgreed] = useState({ terms: false, escrow: false, accurate: false });

  useEffect(() => {
    getListing(id)
      .then(r => {
        setL(r.data);
        if (r.data.is_room_share) {
          getRoomShareStatus(id).then(rs => {
            setRoomShare(rs.data);
            // Once anyone holds a slot the whole property can't be rented outright
            if (parseInt(rs.data.room_share_slots_filled) > 0) setDealMode('room_share');
          }).catch(() => {});
        }
      })
      .catch(() => toast.error('Listing not found.'))
      .finally(() => setLoad(false));
  }, [id]);

  // Step 1 → Step 2: validate the booking fields, then advance to SwiftDoc.
  const handleContinueToSwiftDoc = () => {
    if (!user) { navigate('/login'); return; }
    const errors = {};
    if (!form.move_in_date) errors.move_in_date = 'Move-in date is required.';
    if (!form.lease_duration_months) errors.lease_duration_months = 'Lease duration is required.';
    if (Object.keys(errors).length) { setFormErrors(errors); return; }
    setFormErrors({});
    setStep('swiftdoc');
  };

  // Step 2 → Step 3: validate SwiftDoc tenant info, then advance to SwiftCounsel.
  const handleContinueToSwiftCounsel = () => {
    const errors = {};
    if (!docForm.tenant_nin || docForm.tenant_nin.replace(/\D/g,'').length !== 11)
      errors.tenant_nin = 'Enter your 11-digit NIN.';
    if (!docForm.occupation.trim()) errors.occupation = 'Occupation is required.';
    if (!docForm.next_of_kin_name.trim()) errors.next_of_kin_name = 'Next of kin name is required.';
    if (!docForm.next_of_kin_phone.replace(/\D/g,'').match(/^\d{10,14}$/))
      errors.next_of_kin_phone = 'Enter a valid phone number.';
    if (Object.keys(errors).length) { setDocErrors(errors); return; }
    setDocErrors({});
    setStep('swiftcounsel');
  };

  // Step 3 → Step 4: all three legal checkboxes must be ticked.
  const handleContinueToPayment = () => {
    if (!legalAgreed.terms || !legalAgreed.escrow || !legalAgreed.accurate) {
      toast.error('Please tick all three legal acknowledgments to continue.');
      return;
    }
    setStep('payment');
  };

  // Step 4 (final): fire the existing initiateDeal call. Backend is unchanged.
  const handleDeal = async () => {
    if (!user) { navigate('/login'); return; }
    setDealing(true);
    try {
      const res = await initiateDeal({
        listing_id:            id,
        lease_duration_months: form.lease_duration_months,
        move_in_date:          form.move_in_date,
        is_room_share:         !!listing.is_room_share && dealMode === 'room_share',
      });
      toast.success('Deal initiated! Redirecting to payment...');
      const paymentUrl = res.data.payment_url;
      if (isPaystackCheckoutUrl(paymentUrl)) {
        window.location.href = paymentUrl;
      } else {
        toast.error('Invalid payment URL. Please contact support.');
      }
    } catch (err) {
      if (!err.response) {
        // Timed out / no response — the deal may have been created server-side.
        // Keep the button disabled so a blind retry can't double-submit.
        toast.error('Network timeout — your deal may still have been created. Please check "My Deals" in your dashboard before trying again.', { duration: 8000 });
        return;
      }
      toast.error(err.response?.data?.error || 'Failed to initiate deal.');
    }
    setDealing(false);
  };

  if (loading) return <div style={s.loading}>Loading listing...</div>;
  if (!listing) return <div style={s.loading}>Listing not found.</div>;

  const images    = listing.images?.length ? listing.images : [PLACEHOLDER];
  const amenities = Array.isArray(listing.amenities) ? listing.amenities : [];
  const slotsFilled = parseInt(roomShare?.room_share_slots_filled) || 0;
  const slotsFull = listing.is_room_share && roomShare &&
    slotsFilled >= parseInt(roomShare.room_share_slots);
  const isRoomShareDeal = !!listing.is_room_share && dealMode === 'room_share';
  // Same fallback as the backend: agent never set a per-person price → even split of rent
  const perPersonPrice = Number(listing.room_share_price_per_person) ||
    Math.round(Number(listing.rent_price) / Math.max(parseInt(listing.room_share_slots) || 2, 1));
  const dealRent   = isRoomShareDeal ? perPersonPrice : Number(listing.rent_price);
  const dealBlocked = isRoomShareDeal ? slotsFull : (listing.is_room_share && slotsFilled > 0);

  return (
    <div style={s.page}>
      <div style={s.container}>
        {/* GALLERY */}
        <div style={s.gallery}>
          <img src={images[imgIdx]} alt="" style={s.mainImg}
            onError={e => { if (e.target.src !== PLACEHOLDER) e.target.src = PLACEHOLDER; }}/>
          {listing.is_swiftshield && (
            <div style={s.shieldBadge}><Shield size={13} color="white" strokeWidth={3}/> SwiftShield Protected</div>
          )}
          {images.length > 1 && (
            <div style={s.thumbRow}>
              {images.map((img, i) => (
                <img key={i} src={img} alt="" onClick={() => setImgIdx(i)}
                  style={{...s.thumb, border: i===imgIdx ? `3px solid ${G}` : '3px solid transparent'}}
                  onError={e => { if (e.target.src !== THUMB_PLACEHOLDER) e.target.src = THUMB_PLACEHOLDER; }}/>
              ))}
            </div>
          )}
        </div>

        {/* VIDEO TOUR */}
        {listing.videos?.length > 0 && (
          <div style={{ background:'white', borderRadius:14, padding:'18px 20px', border:'1px solid #E5E7EB', marginBottom:20 }}>
            <h3 style={{ fontSize:15, fontWeight:700, color:G, margin:'0 0 12px' }}>Video Tour</h3>
            <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
              {listing.videos.map((src, i) => (
                <video key={i} src={src} controls playsInline preload="metadata"
                  style={{ width:'100%', maxWidth:480, borderRadius:10, background:'#000' }}/>
              ))}
            </div>
          </div>
        )}

        <div style={s.body}>
          <div style={s.left}>
            {/* Title */}
            <div style={s.titleCard}>
              <div style={s.priceRow}>
                <span style={s.price}>&#8358;{Number(listing.rent_price).toLocaleString()}</span>
                <span style={s.period}>/{listing.rent_period==='monthly'?'month':'year'}</span>
              </div>
              <h1 style={s.title}>{listing.title}</h1>
              <div style={s.locationRow}><MapPin size={14} color={GOLD}/><span>{listing.address}, {listing.city}, {listing.state}</span></div>
              <div style={s.specs}>
                <span style={s.spec}><Bed size={14}/> {listing.bedrooms} Bedrooms</span>
                <span style={s.spec}><Bath size={14}/> {listing.bathrooms} Bathrooms</span>
                <span style={s.spec}><Home size={14}/> {listing.property_type}</span>
              </div>
            </div>

            {listing.description && (
              <div style={s.card}><h3 style={s.cardTitle}>About this property</h3><p style={s.desc}>{listing.description}</p></div>
            )}
            {amenities.length > 0 && (
              <div style={s.card}>
                <h3 style={s.cardTitle}>Amenities</h3>
                <div style={s.amenGrid}>{amenities.map(a => <span key={a} style={s.amenTag}>&#10003; {a}</span>)}</div>
              </div>
            )}

            {/* OpenStreetMap pin */}
            <div style={s.card}>
              <h3 style={s.cardTitle}><MapPin size={15}/> Location</h3>
              <ListingMap address={listing.address} city={listing.city} state={listing.state} lat={listing.latitude} lng={listing.longitude}/>
              <p style={s.mapNote}>&#128274; Full address confirmed after SwiftShield escrow is initiated.</p>
            </div>

            {/* Agent */}
            <div style={s.card}>
              <h3 style={s.cardTitle}>Listed by</h3>
              <div style={s.agentRow}>
                <div style={s.agentAvatar}>{listing.agent_name?.[0]||'A'}</div>
                <div style={{flex:1}}>
                  <div style={s.agentName}>{listing.agent_name}</div>
                  {listing.agency_name && <div style={s.agentSub}>{listing.agency_name}</div>}
                  <div style={s.agentMeta}>
                    {listing.verification_status==='verified' && <span style={s.verTag}><CheckCircle size={11}/> Verified Agent</span>}
                    {listing.agent_rating>0 && <span style={s.ratingTag}><Star size={11}/> {listing.agent_rating}</span>}
                    {listing.total_deals>0 && <span style={s.dealsTag}>{listing.total_deals} deals</span>}
                  </div>
                </div>
              </div>
              {listing.agent_bio && <p style={s.agentBio}>{listing.agent_bio}</p>}
            </div>
          </div>

          {/* RIGHT - Booking */}
          <div style={s.right}>
            <div style={s.bookCard}>
              <div style={s.bookHeader}><Shield size={18} color={GOLD}/>
                <span style={s.bookTitle}>{isRoomShareDeal ? 'Join Room Share Deal' : 'Start SwiftShield Deal'}</span>
              </div>
              <p style={s.bookDesc}>Your payment is held in escrow and only released when you confirm move-in. 100% protected.</p>

              {listing.is_room_share && (
                <div style={{marginBottom:16}}>
                  <div style={{display:'flex', gap:8}}>
                    {[['standard','Rent Entire Property'],['room_share','Join Room Share']].map(([mode,label]) => {
                      const active   = dealMode === mode;
                      const disabled = mode === 'standard' && slotsFilled > 0;
                      return (
                        <button key={mode} type="button" disabled={disabled}
                          onClick={() => setDealMode(mode)}
                          style={{flex:1, padding:'9px 6px', borderRadius:8, fontSize:12, fontWeight:700,
                                  cursor: disabled ? 'not-allowed' : 'pointer',
                                  border: active ? `2px solid ${G}` : '1px solid #DDD',
                                  background: active ? '#F0F9F0' : 'white',
                                  color: active ? G : '#666',
                                  opacity: disabled ? 0.45 : 1}}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  {slotsFilled > 0 && (
                    <p style={{fontSize:11, color:'#888', margin:'6px 0 0'}}>
                      Room share tenants have already joined, so this property can only be rented as a room share.
                    </p>
                  )}
                </div>
              )}

              {isRoomShareDeal && roomShare && (
                <div style={{background:'#F0F9F0',borderRadius:10,padding:'14px 16px',marginBottom:16}}>
                  <div style={{fontWeight:700,fontSize:13,color:G,marginBottom:10}}>Room Share - {roomShare.room_share_slots} Slots</div>
                  <div style={{display:'flex',gap:8,marginBottom:8}}>
                    {Array.from({length:parseInt(roomShare.room_share_slots)}).map((_,i) => {
                      const filled = i < parseInt(roomShare.room_share_slots_filled||0);
                      return <div key={i} style={{width:36,height:36,borderRadius:'50%',flexShrink:0,background:filled?G:'#E5E7EB',display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontSize:16,fontWeight:700}}>{filled?'v':''}</div>;
                    })}
                  </div>
                  <div style={{fontSize:12,color:'#666'}}>{roomShare.room_share_slots_filled||0} of {roomShare.room_share_slots} slots filled
                    {slotsFull && <span style={{color:'#DC2626',fontWeight:700,marginLeft:8}}>FULL</span>}
                  </div>
                </div>
              )}

              {(() => {
                const rent = dealRent;
                const tenantFee = Math.round(rent * 0.025);
                const landlordFee = Math.round(rent * 0.025);
                const total = rent + tenantFee;
                const stepIdx = ['booking','swiftdoc','swiftcounsel','payment'].indexOf(step);

                return (
                  <>
                    <div style={s.stepRow}>
                      {['Booking','SwiftDoc','SwiftCounsel','Pay'].map((label, i) => (
                        <div key={label} style={{
                          flex:1, textAlign:'center', fontSize:10, fontWeight:700,
                          color: i <= stepIdx ? G : '#BBB',
                          padding:'4px 0',
                          borderBottom: `3px solid ${i <= stepIdx ? GOLD : '#EEE'}`,
                        }}>
                          {i+1}. {label}
                        </div>
                      ))}
                    </div>

                    {step === 'booking' && (
                      <>
                        <p style={{fontSize:12, color:'#666', margin:'12px 0 8px'}}>
                          Step 1 of 4 — confirm your move-in date and lease length. Documentation and payment come next.
                        </p>
                        <label style={s.label}>Move-in Date *</label>
                        <input type="date" style={{...s.input, borderColor: formErrors.move_in_date ? '#DC2626' : '#DDD'}} value={form.move_in_date}
                          min={new Date().toISOString().split('T')[0]}
                          onChange={e => { setForm(f=>({...f,move_in_date:e.target.value})); setFormErrors(fe=>({...fe,move_in_date:''})); }}/>
                        {formErrors.move_in_date && <span style={s.fieldError}>{formErrors.move_in_date}</span>}
                        <label style={s.label}>Lease Duration *</label>
                        <select style={{...s.input, borderColor: formErrors.lease_duration_months ? '#DC2626' : '#DDD'}} value={form.lease_duration_months}
                          onChange={e => { setForm(f=>({...f,lease_duration_months:Number(e.target.value)})); setFormErrors(fe=>({...fe,lease_duration_months:''})); }}>
                          <option value="">Select duration</option>
                          {[6,12,18,24].map(m=><option key={m} value={m}>{m} months</option>)}
                        </select>
                        {formErrors.lease_duration_months && <span style={s.fieldError}>{formErrors.lease_duration_months}</span>}
                        <button onClick={handleContinueToSwiftDoc} disabled={dealBlocked||!form.move_in_date||!form.lease_duration_months}
                          style={{...s.dealBtn, opacity:(dealBlocked||!form.move_in_date||!form.lease_duration_months)?0.5:1}}>
                          {dealBlocked ? (isRoomShareDeal ? 'All Slots Filled' : 'Room Share Only') : 'Continue to SwiftDoc →'}
                        </button>
                      </>
                    )}

                    {step === 'swiftdoc' && (
                      <>
                        <h4 style={{margin:'14px 0 6px', fontSize:14, color:G, fontWeight:800}}>📄 SwiftDoc — Tenant Details</h4>
                        <p style={{fontSize:12, color:'#666', margin:'0 0 12px'}}>
                          These details go onto your legally binding tenancy agreement.
                        </p>
                        <label style={s.label}>National Identity Number (NIN) *</label>
                        <input style={{...s.input, borderColor: docErrors.tenant_nin ? '#DC2626' : '#DDD'}}
                          inputMode="numeric" maxLength={11}
                          value={docForm.tenant_nin}
                          onChange={e => { setDocForm(f=>({...f, tenant_nin: e.target.value.replace(/\D/g,'')})); setDocErrors(de=>({...de, tenant_nin:''})); }}
                          placeholder="11-digit NIN"/>
                        {docErrors.tenant_nin && <span style={s.fieldError}>{docErrors.tenant_nin}</span>}

                        <label style={s.label}>Occupation *</label>
                        <input style={{...s.input, borderColor: docErrors.occupation ? '#DC2626' : '#DDD'}}
                          value={docForm.occupation}
                          onChange={e => { setDocForm(f=>({...f, occupation: e.target.value})); setDocErrors(de=>({...de, occupation:''})); }}
                          placeholder="e.g. Software Engineer, Student, Trader"/>
                        {docErrors.occupation && <span style={s.fieldError}>{docErrors.occupation}</span>}

                        <label style={s.label}>Employer / Business Name</label>
                        <input style={s.input} value={docForm.employer}
                          onChange={e => setDocForm(f=>({...f, employer: e.target.value}))}
                          placeholder="Optional"/>

                        <label style={s.label}>Next of Kin — Full Name *</label>
                        <input style={{...s.input, borderColor: docErrors.next_of_kin_name ? '#DC2626' : '#DDD'}}
                          value={docForm.next_of_kin_name}
                          onChange={e => { setDocForm(f=>({...f, next_of_kin_name: e.target.value})); setDocErrors(de=>({...de, next_of_kin_name:''})); }}/>
                        {docErrors.next_of_kin_name && <span style={s.fieldError}>{docErrors.next_of_kin_name}</span>}

                        <label style={s.label}>Next of Kin — Phone *</label>
                        <input style={{...s.input, borderColor: docErrors.next_of_kin_phone ? '#DC2626' : '#DDD'}}
                          inputMode="tel" value={docForm.next_of_kin_phone}
                          onChange={e => { setDocForm(f=>({...f, next_of_kin_phone: e.target.value})); setDocErrors(de=>({...de, next_of_kin_phone:''})); }}
                          placeholder="+234..."/>
                        {docErrors.next_of_kin_phone && <span style={s.fieldError}>{docErrors.next_of_kin_phone}</span>}

                        <div style={{display:'flex', gap:8, marginTop:14}}>
                          <button onClick={() => setStep('booking')} style={s.backBtn}>← Back</button>
                          <button onClick={handleContinueToSwiftCounsel} style={{...s.dealBtn, marginTop:0, flex:2}}>
                            Continue to SwiftCounsel →
                          </button>
                        </div>
                      </>
                    )}

                    {step === 'swiftcounsel' && (
                      <>
                        <h4 style={{margin:'14px 0 6px', fontSize:14, color:G, fontWeight:800}}>⚖️ SwiftCounsel — Legal Review</h4>
                        <p style={{fontSize:12, color:'#666', margin:'0 0 12px'}}>
                          Please review and acknowledge the key terms below before proceeding to payment.
                        </p>
                        <div style={s.legalBox}>
                          <p style={s.legalP}>
                            <strong>Lease:</strong> {form.lease_duration_months}-month tenancy starting {form.move_in_date || '—'}, at ₦{rent.toLocaleString()}/{listing.rent_period==='monthly'?'month':'year'}.
                          </p>
                          <p style={s.legalP}>
                            <strong>Escrow:</strong> Your full payment is held by SouthSwift SwiftShield until you confirm move-in. Funds are only released to the landlord after you confirm satisfactory move-in within the agreed window.
                          </p>
                          <p style={s.legalP}>
                            <strong>Refund:</strong> If the landlord fails to deliver the property in the condition advertised, you can raise a dispute and request a refund within 14 days.
                          </p>
                          <p style={s.legalP}>
                            <strong>Platform fee:</strong> 5% total (2.5% tenant + 2.5% landlord). Non-refundable once escrow is held.
                          </p>
                        </div>

                        <label style={s.legalCheck}>
                          <input type="checkbox" checked={legalAgreed.terms}
                            onChange={e => setLegalAgreed(a => ({...a, terms: e.target.checked}))}/>
                          <span>I have read and agree to the SouthSwift <a href="/legal/terms" target="_blank" rel="noreferrer" style={{color:G}}>Terms of Service</a>.</span>
                        </label>
                        <label style={s.legalCheck}>
                          <input type="checkbox" checked={legalAgreed.escrow}
                            onChange={e => setLegalAgreed(a => ({...a, escrow: e.target.checked}))}/>
                          <span>I understand that my payment is held in escrow and only released after I confirm move-in.</span>
                        </label>
                        <label style={s.legalCheck}>
                          <input type="checkbox" checked={legalAgreed.accurate}
                            onChange={e => setLegalAgreed(a => ({...a, accurate: e.target.checked}))}/>
                          <span>The information I provided in SwiftDoc is accurate and may be used to generate a legally binding tenancy agreement.</span>
                        </label>

                        <div style={{display:'flex', gap:8, marginTop:14}}>
                          <button onClick={() => setStep('swiftdoc')} style={s.backBtn}>← Back</button>
                          <button onClick={handleContinueToPayment} style={{...s.dealBtn, marginTop:0, flex:2}}>
                            Continue to Payment →
                          </button>
                        </div>
                      </>
                    )}

                    {step === 'payment' && (
                      <>
                        <h4 style={{margin:'14px 0 6px', fontSize:14, color:G, fontWeight:800}}>🛡️ SwiftShield — Secure Payment</h4>
                        <div style={s.feeBreakdown}>
                          <div style={s.feeRow}><span>{isRoomShareDeal ? 'Per Person' : 'Rent'}</span><span style={{fontWeight:600}}>&#8358;{rent.toLocaleString()}</span></div>
                          <div style={s.feeRow}><span style={{color:GOLD}}>SwiftShield Fee — Tenant (2.5%)</span><span style={{color:GOLD,fontWeight:600}}>&#8358;{tenantFee.toLocaleString()}</span></div>
                          <div style={s.feeRow}><span style={{color:GOLD}}>SwiftShield Fee — Landlord (2.5%)</span><span style={{color:GOLD,fontWeight:600}}>&#8358;{landlordFee.toLocaleString()}</span></div>
                          <div style={s.feeRow}><span style={{fontSize:11,color:'#888'}}>Total Platform Fee (5%)</span><span style={{fontSize:11,color:'#888'}}>&#8358;{(tenantFee+landlordFee).toLocaleString()}</span></div>
                          <div style={{...s.feeRow,borderTop:'1px solid #E5E7EB',paddingTop:8,marginTop:4}}><span style={{fontWeight:800}}>Your Total</span><span style={{fontWeight:800,color:G}}>&#8358;{total.toLocaleString()}</span></div>
                          <div style={s.feeRow}><span style={{fontSize:11,color:'#666'}}>Landlord Receives (after move-in)</span><span style={{fontSize:11,color:'#666'}}>&#8358;{(rent-landlordFee).toLocaleString()}</span></div>
                        </div>
                        <div style={{display:'flex', gap:8}}>
                          <button onClick={() => setStep('swiftcounsel')} disabled={dealing} style={s.backBtn}>← Back</button>
                          <button onClick={handleDeal} disabled={dealing||dealBlocked}
                            style={{...s.dealBtn, marginTop:0, flex:2, opacity:(dealing||dealBlocked)?0.5:1}}>
                            {dealing ? 'Starting payment…' : `Pay ₦${total.toLocaleString()} via SwiftShield`}
                          </button>
                        </div>
                      </>
                    )}

                    <div style={s.trustRow}>
                      {['Escrow Protected','Legal Doc Included','Verified Agent'].map(t=>(
                        <span key={t} style={s.trustTag}>✓ {t}</span>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const s = {
  page:        { fontFamily:'Arial,sans-serif', background:'#F8FAF8', minHeight:'80vh' },
  container:   { maxWidth:1100, margin:'0 auto', padding:'28px 20px' },
  loading:     { textAlign:'center', padding:80, fontSize:16, color:G },
  gallery:     { borderRadius:16, overflow:'hidden', marginBottom:28, position:'relative' },
  mainImg:     { width:'100%', height:420, objectFit:'cover', display:'block' },
  shieldBadge: { position:'absolute', top:16, left:16, background:G, color:'white',
                 fontSize:12, fontWeight:700, padding:'6px 14px', borderRadius:20,
                 display:'flex', alignItems:'center', gap:6 },
  thumbRow:    { display:'flex', gap:8, padding:'10px', background:'rgba(0,0,0,0.03)', overflowX:'auto' },
  thumb:       { width:100, height:68, objectFit:'cover', borderRadius:8, cursor:'pointer', flexShrink:0 },
  body:        { display:'flex', gap:24, alignItems:'flex-start', flexWrap:'wrap' },
  left:        { flex:1.6, minWidth:300 },
  right:       { flex:1, minWidth:280, position:'sticky', top:80 },
  card:        { background:'white', borderRadius:14, padding:'20px 22px', marginBottom:18, border:'1px solid #E5E7EB' },
  cardTitle:   { fontSize:15, fontWeight:700, color:G, margin:'0 0 14px', display:'flex', alignItems:'center', gap:6 },
  titleCard:   { background:'white', borderRadius:14, padding:'20px 22px', marginBottom:18, border:'1px solid #E5E7EB' },
  priceRow:    { display:'flex', alignItems:'baseline', gap:4, marginBottom:6 },
  price:       { fontSize:30, fontWeight:900, color:G },
  period:      { fontSize:14, color:'#888' },
  title:       { fontSize:22, fontWeight:800, color:'#111', margin:'0 0 10px' },
  locationRow: { display:'flex', alignItems:'center', gap:6, fontSize:13, color:'#666', marginBottom:14 },
  specs:       { display:'flex', gap:18, flexWrap:'wrap' },
  spec:        { display:'flex', alignItems:'center', gap:5, fontSize:13, color:'#555', background:'#F3F4F6', padding:'5px 12px', borderRadius:20 },
  desc:        { fontSize:14, color:'#444', lineHeight:1.7, margin:0 },
  amenGrid:    { display:'flex', flexWrap:'wrap', gap:8 },
  amenTag:     { background:'#F0F9F0', color:G, fontSize:12, fontWeight:600, padding:'5px 12px', borderRadius:20 },
  mapNote:     { fontSize:11, color:'#999', marginTop:8, textAlign:'center' },
  agentRow:    { display:'flex', gap:14, alignItems:'flex-start' },
  agentAvatar: { width:48, height:48, borderRadius:'50%', background:G, color:'white',
                 display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:18, flexShrink:0 },
  agentName:   { fontSize:15, fontWeight:700, color:'#111', marginBottom:2 },
  agentSub:    { fontSize:12, color:'#888', marginBottom:6 },
  agentMeta:   { display:'flex', gap:8, flexWrap:'wrap' },
  verTag:      { display:'flex', alignItems:'center', gap:3, background:'#DCFCE7', color:'#166534', fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:10 },
  ratingTag:   { display:'flex', alignItems:'center', gap:3, background:'#FEF3C7', color:'#92400E', fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:10 },
  dealsTag:    { background:'#EFF6FF', color:'#1D4ED8', fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:10 },
  agentBio:    { fontSize:13, color:'#555', marginTop:12, lineHeight:1.6 },
  bookCard:    { background:'white', borderRadius:16, padding:'24px', border:`2px solid ${G}`, boxShadow:'0 4px 20px rgba(27,67,50,0.1)' },
  bookHeader:  { display:'flex', alignItems:'center', gap:8, marginBottom:8 },
  bookTitle:   { fontSize:16, fontWeight:800, color:G },
  bookDesc:    { fontSize:12.5, color:'#666', marginBottom:18, lineHeight:1.6 },
  feeBreakdown:{ background:'#F8FAF8', borderRadius:10, padding:'14px 16px', marginBottom:18 },
  feeRow:      { display:'flex', justifyContent:'space-between', fontSize:13, color:'#555', marginBottom:6 },
  label:       { display:'block', fontSize:12, fontWeight:700, color:'#444', marginBottom:5, marginTop:12 },
  input:       { width:'100%', border:'1px solid #DDD', borderRadius:8, padding:'10px 12px', fontSize:13, boxSizing:'border-box', outline:'none' },
  dealBtn:     { width:'100%', background:G, color:'white', border:'none', padding:'14px', borderRadius:12, cursor:'pointer', fontWeight:800, fontSize:15, marginTop:16 },
  trustRow:    { display:'flex', flexWrap:'wrap', gap:6, marginTop:14 },
  trustTag:    { fontSize:10, color:'#666', background:'#F3F4F6', padding:'3px 8px', borderRadius:10 },
  fieldError:  { display:'block', fontSize:11, color:'#DC2626', marginTop:4 },
  stepRow:     { display:'flex', gap:4, marginBottom:4 },
  backBtn:     { flex:1, background:'#F3F4F6', color:'#444', border:'none', padding:'13px',
                 borderRadius:12, cursor:'pointer', fontWeight:700, fontSize:13 },
  legalBox:    { background:'#F8FAF8', border:'1px solid #E5E7EB', borderRadius:10,
                 padding:'12px 14px', marginBottom:12 },
  legalP:      { fontSize:12, color:'#333', margin:'0 0 8px', lineHeight:1.5 },
  legalCheck:  { display:'flex', gap:8, alignItems:'flex-start', fontSize:12.5,
                 color:'#333', marginBottom:10, cursor:'pointer', lineHeight:1.5 },
};
