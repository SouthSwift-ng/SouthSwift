import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { getListing, initiateDeal, getRoomShareStatus, isPaystackCheckoutUrl,
  payInspection, skipInspection, getDeal as getDealById, getMyDeals,
  getCompanyAccount, getNigerianBanks, submitTransfer, getMyTransaction } from '../utils/api';
import { formatNaira, todayLocalISO } from '../utils/format';
import { useAuth } from '../App';
import ShareListing from '../components/ShareListing';
import { Shield, MapPin, Bed, Bath, CheckCircle, Home, Star } from 'lucide-react';

const G    = '#1B4332';
const GOLD = '#C8963C';

// ── INSPECTION FEE TERMS (DRAFT — owner to replace with final legal copy) ──
// Shown + gated by checkbox in the inspection step before inspection payment.
const INSPECTION_TERMS_DRAFT = `

We strongly recommend inspecting the property before making rent payment. This gives you the opportunity to see the property for yourself and make an informed decision.


The inspection fee covers the agent’s transportation to the property you selected. 

If you decide to inspect a different property, an additional transportation fee will apply.

Please note that if you choose not to inspect the property and proceed with payment of the rent, the payment will be non-refundable.`;

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
  // 'booking' (date + lease) → ['inspection' (fee + T&C + pay, only when
  // listing.inspection_fee > 0 and the deal hasn't paid it)] → 'swiftdoc'
  // (tenant info) → 'swiftcounsel' (legal + pay).
  const [step, setStep] = useState('booking');
  const [searchParams, setSearchParams] = useSearchParams();
  const [docForm, setDocForm] = useState({
    tenant_nin: '', occupation: '', employer: '',
    next_of_kin_name: '', next_of_kin_phone: '',
  });
  const [docErrors, setDocErrors] = useState({});
  const [legalAgreed, setLegalAgreed] = useState({ terms: false, escrow: false, accurate: false });

  // ── Inspection step state ──
  // The inspection is paid per deal (deal.has_paid_inspection), never per
  // listing — one tenant's payment must not unlock others.
  const [inspectionDeal, setInspectionDeal] = useState(null);
  const [inspectionAgreed, setInspectionAgreed] = useState(false);
  const [skipConfirm, setSkipConfirm] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [inspPaying, setInspPaying] = useState(false);
  const [inspAccount, setInspAccount] = useState(null);
  const [inspBanks, setInspBanks] = useState([]);
  const [inspTxn, setInspTxn] = useState(null);
  const [inspSubmitting, setInspSubmitting] = useState(false);
  const [checkingInsp, setCheckingInsp] = useState(false);
  const [resumeDeal, setResumeDeal] = useState(null);
  const [inspProof, setInspProof] = useState({
    amount_naira: '', payer_bank: '', transfer_reference: '', transfer_date: '', receipt: null,
  });
  const pollRef = useRef(null);

  useEffect(() => {
    // Reset every piece of wizard state when the listing changes — otherwise a tenant
    // who tabs between listings can carry a half-filled NIN and ticked legal checkboxes
    // from listing A onto listing B's payment flow.
    setStep('booking');
    setForm({ lease_duration_months: '', move_in_date: '' });
    setFormErrors({});
    setDocForm({ tenant_nin: '', occupation: '', employer: '', next_of_kin_name: '', next_of_kin_phone: '' });
    setDocErrors({});
    setLegalAgreed({ terms: false, escrow: false, accurate: false });
    setInspectionDeal(null);
    setResumeDeal(null);
    setInspectionAgreed(false);
    setSkipConfirm(false);
    setInspTxn(null);
    setInspAccount(null);
    setInspProof({ amount_naira: '', payer_bank: '', transfer_reference: '', transfer_date: '', receipt: null });
    setLoad(true);
    setRoomShare(null);
    setDealMode('standard');

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

  // Resume booking after a Paystack inspection payment (DealDetail verifies the
  // reference, then links back here with ?resume=1). Restores the wizard onto
  // the reusable unpaid deal and skips already-paid steps.
  useEffect(() => {
    if (searchParams.get('resume') !== '1' || !listing) return;
    let cancelled = false;
    (async () => {
      try {
        const saved = sessionStorage.getItem(`ss_insp_${id}`);
        if (saved) {
          const s = JSON.parse(saved);
          if (s.form) setForm(s.form);
          if (s.docForm) setDocForm(s.docForm);
          if (s.dealMode) setDealMode(s.dealMode);
        }
        const r = await getMyDeals();
        const mine = (r.data || []).filter(d =>
          String(d.listing_id) === String(id) && ['initiated', 'payment_pending'].includes(d.status));
        const deal = mine.find(d => d.has_paid_inspection) || mine.sort((a, b) =>
          new Date(b.created_at) - new Date(a.created_at))[0];
        if (!cancelled && deal) {
          // Restore booking fields from the deal so the wizard can jump without re-typing
          if (deal.move_in_date) setForm(f => ({ ...f, move_in_date: deal.move_in_date.slice(0,10) }));
          if (deal.lease_duration_months) setForm(f => ({ ...f, lease_duration_months: deal.lease_duration_months }));
          setInspectionDeal(deal);
          setResumeDeal(deal);
          setStep(deal.has_paid_inspection || deal.inspection_skipped ? 'swiftdoc' : 'inspection');
          if (deal.has_paid_inspection) toast.success('Inspection confirmed — continue your booking.');
        }
      } catch { /* stay on booking */ }
      if (!cancelled) setSearchParams({}, { replace: true });
    })();
    return () => { cancelled = true; };
  }, [listing]);

  // Auto-detect an existing held deal after refresh so the tenant doesn't have to
  // re-fill the booking form just to hit "Listing not available". If a deal that
  // holds the reservation (paid/skipped) is found, pre-fill the form and show a
  // resume banner — the backend fix already allows holder re-initiation, this
  // just makes the UX seamless without extra clicks.
  useEffect(() => {
    if (!listing || !user) return;
    if (searchParams.get('resume') === '1') return; // handled above
    if (inspectionDeal || resumeDeal) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await getMyDeals();
        const mine = (r.data || []).filter(d =>
          String(d.listing_id) === String(id) && ['initiated', 'payment_pending'].includes(d.status));
        if (!mine.length) return;
        const held = mine.find(d => d.has_paid_inspection || d.inspection_skipped);
        const newest = mine.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        const candidate = held || newest;
        if (!cancelled && candidate) {
          setResumeDeal(candidate);
          // Pre-fill booking fields from the existing deal so the tenant can Continue
          if (candidate.move_in_date) setForm(f => ({ ...f, move_in_date: candidate.move_in_date.slice(0,10) }));
          if (candidate.lease_duration_months) setForm(f => ({ ...f, lease_duration_months: candidate.lease_duration_months }));
          if (held) {
            setInspectionDeal(held);
            // Don't auto-jump — show banner instead so the tenant isn't yanked away
          }
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [listing, user]);

  // While an inspection proof is pending review, poll the deal so an admin
  // approval advances the wizard without a manual refresh.
  useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (step === 'inspection' && inspectionDeal && !inspectionDeal.has_paid_inspection &&
        inspTxn && inspTxn.status === 'pending_review') {
      pollRef.current = setInterval(async () => {
        try {
          const r = await getDealById(inspectionDeal.id);
          setInspectionDeal(r.data);
          if (r.data.has_paid_inspection) {
            toast.success('Inspection fee confirmed — continue your booking.');
            setStep('swiftdoc');
          }
        } catch { /* keep polling */ }
      }, 20000);
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [step, inspectionDeal, inspTxn]);

  // Step 1 → next: validate booking fields. Listings with an inspection fee
  // create (or reuse) the deal now and route to the inspection step; the fee
  // snapshot + has_paid_inspection live on that deal. Others go to SwiftDoc.
  const handleContinueToSwiftDoc = async () => {
    if (!user) { navigate('/login'); return; }
    const errors = {};
    if (!form.move_in_date) errors.move_in_date = 'Move-in date is required.';
    if (!form.lease_duration_months) errors.lease_duration_months = 'Lease duration is required.';
    if (Object.keys(errors).length) { setFormErrors(errors); return; }
    setFormErrors({});
    if (!(Number(listing?.inspection_fee) > 0)) { setStep('swiftdoc'); return; }
    // Already paid/skipped — no need to hit initiateDeal again; the inspection
    // paid message already confirms the hold. Jump straight to SwiftDoc. Final
    // initiateDeal (handleDeal) will persist any edited dates.
    const alreadyDone = (resumeDeal?.has_paid_inspection || resumeDeal?.inspection_skipped) ||
                        (inspectionDeal?.has_paid_inspection || inspectionDeal?.inspection_skipped);
    if (alreadyDone) {
      const doneDeal = (resumeDeal?.has_paid_inspection || resumeDeal?.inspection_skipped) ? resumeDeal : inspectionDeal;
      if (doneDeal) setInspectionDeal(doneDeal);
      setStep('swiftdoc');
      return;
    }
    setDealing(true);
    try {
      // No swiftdoc_data yet (step 2 hasn't run) — the API accepts that and the
      // final initiate reuses this same unpaid deal, preserving inspection state.
      const res = await initiateDeal({
        listing_id: id,
        lease_duration_months: form.lease_duration_months,
        move_in_date: form.move_in_date,
        is_room_share: !!listing.is_room_share && dealMode === 'room_share',
      });
      const dealRes = await getDealById(res.data.deal_id).catch(() => null);
      const deal = dealRes?.data || { id: res.data.deal_id, inspection_fee: listing.inspection_fee, has_paid_inspection: false };
      setInspectionDeal(deal);
      setSkipConfirm(false);
      if (deal.has_paid_inspection || deal.inspection_skipped) { setStep('swiftdoc'); return; }
      // Pre-load manual rails + any existing inspection proof for this deal.
      getCompanyAccount().then(r => setInspAccount(r.data)).catch(() => {});
      getNigerianBanks().then(r => setInspBanks(r.data.banks || [])).catch(() => {});
      getMyTransaction(deal.id, 'inspection').then(r => {
        if (r.data.transaction) {
          setInspTxn(r.data.transaction);
          setInspProof(p => ({ ...p, amount_naira: String(deal.inspection_fee || '') }));
        } else {
          setInspProof(p => ({ ...p, amount_naira: String(deal.inspection_fee || '') }));
        }
      }).catch(() => {});
      setStep('inspection');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to start booking.');
    }
    setDealing(false);
  };

  // Inspection → SwiftDoc: T&C must be ticked AND the deal paid. Manual payments
  // need admin approval first (pending state below); Paystack verifies instantly.
  const handleContinueFromInspection = () => {
    if (!inspectionAgreed) { toast.error('Please tick the inspection terms to continue.'); return; }
    if (!inspectionDeal?.has_paid_inspection) { toast.error('Please pay the inspection fee first.'); return; }
    setStep('swiftdoc');
  };

  const handlePayInspection = async () => {
    if (!inspectionAgreed) { toast.error('Please tick the inspection terms to continue.'); return; }
    if (!inspectionDeal) { toast.error('Booking not started — go back and continue.'); return; }
    setInspPaying(true);
    try {
      // Persist wizard state — a Paystack redirect leaves this page entirely.
      sessionStorage.setItem(`ss_insp_${id}`, JSON.stringify({ form, docForm, dealMode }));
      const res = await payInspection(inspectionDeal.id);
      if (res.data.payment_url) { window.location.href = res.data.payment_url; return; }
      if (res.data.account) {
        setInspAccount(res.data.account);
        toast.success(`Transfer ₦${Number(res.data.amount_due).toLocaleString()} then submit your proof below.`);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to start inspection payment.');
    }
    setInspPaying(false);
  };

  const handleSubmitInspectionProof = async () => {
    if (!inspectionDeal) return;
    if (!inspProof.amount_naira || !inspProof.payer_bank || !inspProof.transfer_reference || !inspProof.transfer_date || !inspProof.receipt) {
      toast.error('Amount, bank, transfer reference, date and receipt are all required.');
      return;
    }
    setInspSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('deal_id', inspectionDeal.id);
      fd.append('payment_type', 'inspection');
      fd.append('amount_naira', inspProof.amount_naira);
      fd.append('payer_bank', inspProof.payer_bank);
      fd.append('transfer_reference', inspProof.transfer_reference);
      fd.append('transfer_date', inspProof.transfer_date);
      fd.append('receipt', inspProof.receipt);
      const res = await submitTransfer(fd);
      setInspTxn(res.data.transaction);
      toast.success('Proof submitted — awaiting admin confirmation.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit proof.');
    }
    setInspSubmitting(false);
  };

  const handleCheckInspection = async () => {
    if (!inspectionDeal || checkingInsp) return;
    setCheckingInsp(true);
    try {
      const [d, t] = await Promise.all([
        getDealById(inspectionDeal.id),
        getMyTransaction(inspectionDeal.id, 'inspection').catch(() => null),
      ]);
      setInspectionDeal(d.data);
      if (t?.data?.transaction) setInspTxn(t.data.transaction);
      if (d.data.has_paid_inspection) { toast.success('Inspection fee confirmed.'); setStep('swiftdoc'); }
      else toast('Still awaiting admin confirmation.');
    } catch { toast.error('Could not refresh status.'); }
    finally { setCheckingInsp(false); }
  };

  const handleSkipInspection = async () => {
    if (!skipConfirm) { setSkipConfirm(true); toast('Tap again to confirm skip.'); return; }
    setSkipping(true);
    try {
      const res = await skipInspection(inspectionDeal.id);
      toast.success('Inspection skipped. Continue booking.');
      setInspectionDeal(prev => prev ? { ...prev, inspection_skipped: true } : prev);
      setSkipConfirm(false);
      setStep('swiftdoc');
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to skip inspection.'); }
    setSkipping(false);
  };

  // Step 2 → Step 3: validate SwiftDoc tenant info, then advance to SwiftCounsel.
  const handleContinueToSwiftCounsel = () => {
    const errors = {};
    if (docForm.tenant_nin && docForm.tenant_nin.replace(/\D/g,'').length !== 11)
      errors.tenant_nin = 'NIN must be 11 digits.';
    if (!docForm.occupation.trim()) errors.occupation = 'Occupation is required.';
    if (!docForm.next_of_kin_name.trim()) errors.next_of_kin_name = 'Next of kin name is required.';
    if (!docForm.next_of_kin_phone.replace(/\D/g,'').match(/^\d{10,14}$/))
      errors.next_of_kin_phone = 'Enter a valid phone number.';
    if (Object.keys(errors).length) { setDocErrors(errors); return; }
    setDocErrors({});
    setStep('swiftcounsel');
  };

  // Step 3 (final): all three legal checkboxes must be ticked, then fire the
  // existing initiateDeal call. Backend is unchanged.
  const handleDeal = async () => {
    if (!user) { navigate('/login'); return; }
    if (!legalAgreed.terms || !legalAgreed.escrow || !legalAgreed.accurate) {
      toast.error('Please tick all three legal acknowledgments to continue.');
      return;
    }
    setDealing(true);
    try {
      const res = await initiateDeal({
        listing_id:            id,
        lease_duration_months: form.lease_duration_months,
        move_in_date:          form.move_in_date,
        is_room_share:         !!listing.is_room_share && dealMode === 'room_share',
        // Persist what the wizard collected in step 2 so SwiftDoc generation can
        // produce a tenancy agreement with the tenant's real NIN, occupation, and
        // next of kin instead of fabricating them.
        swiftdoc_data: {
          tenant_nin:        docForm.tenant_nin,
          occupation:        docForm.occupation,
          employer:          docForm.employer || '',
          next_of_kin_name:  docForm.next_of_kin_name,
          next_of_kin_phone: docForm.next_of_kin_phone,
        },
      });
      toast.success('Deal initiated!');
      const { payment_mode, payment_url, deal_id } = res.data;
      // Manual bank transfer: no Paystack checkout — send the tenant to the deal
      // page where SouthSwift's account details + proof form are shown.
      if (payment_mode === 'manual' || !isPaystackCheckoutUrl(payment_url)) {
        navigate(`/deals/${deal_id}`);
        return;
      }
      window.location.href = payment_url;
      return;
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
    Math.round(Number(listing.total_payable) / Math.max(parseInt(listing.room_share_slots) || 2, 1));
  const dealRent   = isRoomShareDeal ? perPersonPrice : Number(listing.total_payable);
  const dealBlocked = isRoomShareDeal ? slotsFull : (listing.is_room_share && slotsFilled > 0);

  return (
    <div style={s.page}>
      <div style={s.container}>
        {/* GALLERY */}
        <div style={s.gallery}>
          {/* alt is informational — see ListingCard for the iOS-overlay reasoning */}
          <img src={images[imgIdx]} alt={listing.title || 'Property listing'} style={s.mainImg}
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
              <div style={{...s.priceRow, justifyContent:'space-between', alignItems:'center'}}>
                <span>
                  <span style={s.price}>&#8358;{formatNaira(listing.total_payable)}</span>
                  <span style={s.period}>/{listing.rent_period==='monthly'?'month':'year'}</span>
                </span>
                <ShareListing listing={listing} />
              </div>
              {/* Tenant total is backend-derived (total_payable); base rent never rewritten.
                  Old 800k listings show 820k here automatically after backfill. */}
              {(listing.total_payable || listing.total_payable) && (
                <div style={{fontSize:12.5, color:'#166534', fontWeight:700, margin:'6px 0 2px'}}>
                  Total to pay via SwiftShield: &#8358;{formatNaira(
                     Math.round(Number(listing.total_payable) )
                  )}
                </div>
              )}
              {/* Fee split is agent/admin-only — tenants see the total above, never this box. */}
              {['agent','admin'].includes(user?.role) && listing.agent_fee_percent != null && (
                <div style={{fontSize:11.5, color:'#666', background:'#F8FAF8', border:'1px solid #E5E7EB', borderRadius:8, padding:'8px 10px', marginTop:8}}>
                  Agent fee {listing.agent_fee_percent}% + SouthSwift {listing.southswift_fee_percent}% = {listing.total_fee_percent}% total (audit)
                </div>
              )}
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
                // Prefer backend-derived total_payable (works for old listings too);
                // fall back to 2.5% client estimate only if the field is missing.
                const payableBase = isRoomShareDeal
                  ? (listing.room_share_total_per_person ?? listing.total_payable ?? Math.round(rent * 1.025))
                  : (listing.total_payable ?? Math.round(rent * 1.025));
                const total = payableBase * (Number(form.lease_duration_months)/12 || 1);
                // Inspection step exists only when the listing carries a fee (>0).
                const requiresInspection = Number(listing.inspection_fee) > 0;
                const inspectionDone = !!((resumeDeal?.has_paid_inspection || resumeDeal?.inspection_skipped) ||
                                         (inspectionDeal?.has_paid_inspection || inspectionDeal?.inspection_skipped));
                const STEPS = requiresInspection
                  ? ['booking', 'inspection', 'swiftdoc', 'swiftcounsel']
                  : ['booking', 'swiftdoc', 'swiftcounsel'];
                const STEP_LABELS = requiresInspection
                  ? ['Booking', 'Inspection', 'SwiftDoc', 'SwiftCounsel']
                  : ['Booking', 'SwiftDoc', 'SwiftCounsel'];
                const stepIdx = STEPS.indexOf(step);

                return (
                  <>
                    <div style={s.stepRow}
                         role="progressbar"
                         aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={stepIdx + 1}
                         aria-label={`SwiftShield deal step ${stepIdx + 1} of ${STEPS.length}`}>
                      {STEP_LABELS.map((label, i) => (
                        <div key={label}
                             aria-current={i === stepIdx ? 'step' : undefined}
                             style={{
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
                        {resumeDeal && String(resumeDeal.listing_id) === String(id) && (resumeDeal.has_paid_inspection || resumeDeal.inspection_skipped) && (
                          <div style={{background:'#ECFDF5', border:'1px solid #A7F3D0', borderRadius:10, padding:'12px 14px', marginTop:12, marginBottom:4}}>
                            <div style={{fontSize:12.5, fontWeight:800, color:G}}> You have a reserved booking for this property</div>
                            <div style={{fontSize:11.5, color:'#065F46', marginTop:4}}>
                              Inspection {resumeDeal.inspection_skipped ? 'skipped' : 'paid'} — hold expires 24h after inspection if rent isn't secured. You can continue without re-booking.
                            </div>
                            <div style={{display:'flex', gap:8, marginTop:10}}>
                              <button onClick={() => navigate(`/deals/${resumeDeal.id}`)} style={{...s.backBtn, marginTop:0, flex:1}}>View Deal</button>
                            </div>
                          </div>
                        )}
                        {resumeDeal && String(resumeDeal.listing_id) === String(id) && !resumeDeal.has_paid_inspection && !resumeDeal.inspection_skipped && Number(listing.inspection_fee)>0 && (
                          <div style={{background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:10, padding:'12px 14px', marginTop:12, marginBottom:4}}>
                            <div style={{fontSize:12.5, fontWeight:800, color:'#92400E'}}> Complete your inspection to hold this unit</div>
                            <div style={{fontSize:11.5, color:'#78350F', marginTop:4}}>You started a booking but haven't completed inspection. The unit is not yet reserved — use "Continue to Inspection" below.</div>
                          </div>
                        )}
                        <p style={{fontSize:12, color:'#666', margin:'12px 0 8px'}}>
                          Step 1 of {STEPS.length} — confirm your move-in date and lease length. Documentation and payment come next.
                        </p>
                        <label style={s.label}>Move-in Date *</label>
                        <input type="date" style={{...s.input, borderColor: formErrors.move_in_date ? '#DC2626' : '#DDD'}} value={form.move_in_date}
                          min={todayLocalISO()}
                          onChange={e => { setForm(f=>({...f,move_in_date:e.target.value})); setFormErrors(fe=>({...fe,move_in_date:''})); }}/>
                        {formErrors.move_in_date && <span style={s.fieldError}>{formErrors.move_in_date}</span>}
                        <label style={s.label}>Lease Duration *</label>
                        <select style={{...s.input, borderColor: formErrors.lease_duration_months ? '#DC2626' : '#DDD'}} value={form.lease_duration_months}
                          onChange={e => { setForm(f=>({...f,lease_duration_months:Number(e.target.value)})); setFormErrors(fe=>({...fe,lease_duration_months:''})); }}>
                          <option value="">Select duration</option>
                          {[6,12].map(m=><option key={m} value={m}>{m} months</option>)}
                        </select>
                        {formErrors.lease_duration_months && <span style={s.fieldError}>{formErrors.lease_duration_months}</span>}
                        <button onClick={handleContinueToSwiftDoc} disabled={dealBlocked||!form.move_in_date||!form.lease_duration_months||dealing}
                          style={{...s.dealBtn, opacity:(dealBlocked||!form.move_in_date||!form.lease_duration_months||dealing)?0.5:1}}>
                          {dealing ? 'Starting…' : dealBlocked ? (isRoomShareDeal ? 'All Slots Filled' : 'Room Share Only') : (requiresInspection && !inspectionDone ? 'Continue to Inspection →' : 'Continue to SwiftDoc →')}
                        </button>
                      </>
                    )}

                    {step === 'swiftdoc' && (
                      <>
                        <h4 style={{margin:'14px 0 6px', fontSize:14, color:G, fontWeight:800}}>📄 SwiftDoc — Tenant Details</h4>
                        <p style={{fontSize:12, color:'#666', margin:'0 0 12px'}}>
                          These details go onto your legally binding tenancy agreement.
                        </p>
                        <label style={s.label}>National Identity Number (NIN) <span style={{fontWeight:400,opacity:.6}}>(optional)</span></label>
                        <input style={{...s.input, borderColor: docErrors.tenant_nin ? '#DC2626' : '#DDD'}}
                          inputMode="numeric" maxLength={11}
                          value={docForm.tenant_nin}
                          onChange={e => { setDocForm(f=>({...f, tenant_nin: e.target.value.replace(/\D/g,'')})); setDocErrors(de=>({...de, tenant_nin:''})); }}
                          placeholder="11-digit NIN (optional)"/>
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
                          <button onClick={() => setStep(requiresInspection ? 'inspection' : 'booking')} style={s.backBtn}>← Back</button>
                          <button onClick={handleContinueToSwiftCounsel} style={{...s.dealBtn, marginTop:0, flex:2}}>
                            Continue to SwiftCounsel →
                          </button>
                        </div>
                      </>
                    )}

                    {step === 'inspection' && requiresInspection && (
                      <>
                        <h4 style={{margin:'14px 0 6px', fontSize:14, color:G, fontWeight:800}}> Inspection Fee</h4>
                        <p style={{fontSize:12, color:'#666', margin:'0 0 12px'}}>
                          Step 2 of {STEPS.length} — pay the inspection fee to continue booking.
                        </p>
                        <div style={s.legalBox}>
                          <p style={s.legalP}>
                            <strong>Fee:</strong> ₦{Number(inspectionDeal?.inspection_fee ?? listing.inspection_fee).toLocaleString()} — covers one scheduled physical inspection. Non-refundable, SouthSwift revenue.
                          </p>
                          <p style={s.legalP}>{INSPECTION_TERMS_DRAFT}</p>
                        </div>

                        <label style={s.legalCheck}>
                          <input required type="checkbox" checked={inspectionAgreed}
                            onChange={e => setInspectionAgreed(e.target.checked)}/>
                          <span>I have read and accept the inspection terms above.</span>
                        </label>

                         {inspectionDeal?.has_paid_inspection ? (
                           <>
                             <div style={{fontSize:12.5, color:'#166534', fontWeight:700, background:'#DCFCE7', borderRadius:8, padding:'10px 12px', marginTop:6}}>
                                Inspection fee confirmed. Continue your booking.
                             </div>
                             <div style={{display:'flex', gap:8, marginTop:14}}>
                               <button onClick={() => setStep('booking')} style={s.backBtn}>← Back</button>
                               <button onClick={handleContinueFromInspection} style={{...s.dealBtn, marginTop:0, flex:2}}>
                                 Continue to SwiftDoc →
                               </button>
                             </div>
                           </>
                         ) : skipConfirm ? (
                           <div style={{background:'#FEF3C7', border:'1px solid #F59E0B', borderRadius:10, padding:14, marginTop:10}}>
                             <p style={{fontSize:13, fontWeight:700, color:'#92400E', margin:'0 0 8px'}}>
                               ⚠️ Skip inspection? The ₦{Number(inspectionDeal?.inspection_fee ?? listing.inspection_fee).toLocaleString()} fee is non-refundable and you will be asked to pay rent directly without inspection.
                             </p>
                             <div style={{display:'flex', gap:8}}>
                               <button onClick={() => { setSkipConfirm(false); setSkipping(false); }} style={s.backBtn}>Cancel</button>
                               <button onClick={handleSkipInspection} disabled={skipping}
                                 style={{...s.dealBtn, marginTop:0, flex:2, background:'#B45309', opacity:skipping?0.5:1}}>
                                 {skipping ? 'Skipping…' : 'Confirm Skip'}
                               </button>
                             </div>
                           </div>
                          ) : inspTxn && inspTxn.status === 'pending_review' ? (
                           <>
                             <div style={{fontSize:12.5, color:'#92400E', fontWeight:700, background:'#FEF3C7', borderRadius:8, padding:'10px 12px', marginTop:6}}>
                                Proof received — awaiting admin confirmation. This page refreshes automatically; you can also check manually.
                             </div>
                             <div style={{display:'flex', gap:8, marginTop:14}}>
                               <button onClick={() => setStep('booking')} style={s.backBtn}>← Back</button>
                               <button onClick={handleCheckInspection} disabled={checkingInsp} style={{...s.dealBtn, marginTop:0, flex:2, opacity: checkingInsp?0.6:1, cursor: checkingInsp?'not-allowed':'pointer'}}>
                                 {checkingInsp ? 'Checking…' : 'Check Status'}
                               </button>
                             </div>
                           </>
                         ) : !inspAccount ? (
                           <>
                             <div style={{display:'flex', gap:8, marginTop:14}}>
                               <button onClick={() => setStep('booking')} style={s.backBtn}>← Back</button>
                               <button onClick={handlePayInspection} disabled={inspPaying}
                                 style={{...s.dealBtn, marginTop:0, flex:2, opacity:inspPaying?0.5:1}}>
                                 {inspPaying ? 'Starting…' : `Agree & Pay ₦${Number(inspectionDeal?.inspection_fee ?? listing.inspection_fee).toLocaleString()} →`}
                               </button>
                             </div>
                             <div style={{textAlign:'center', marginTop:8}}>
                               <button onClick={() => setSkipConfirm(true)} style={{background:'none', border:'none', color:G, cursor:'pointer', fontSize:12, textDecoration:'underline'}}>
                                 Skip inspection & pay rent directly
                               </button>
                             </div>
                           </>
                         ) : (
                          <>
                            <div style={{background:'#F0F9F0', borderRadius:10, padding:'14px 16px', border:'1px solid #BBF7D0', marginBottom:12}}>
                              <div style={{fontWeight:800, color:G, fontSize:13, marginBottom:4}}>Transfer to SouthSwift</div>
                              <div style={{fontSize:13}}><strong>{inspAccount.bank_name}</strong></div>
                              <div style={{fontSize:15, fontWeight:800, letterSpacing:1}}>{inspAccount.account_number}</div>
                              <div style={{fontSize:12, color:'#555'}}>{inspAccount.account_name}</div>
                              <div style={{fontSize:12, fontWeight:700, marginTop:6}}>Amount: ₦{Number(inspectionDeal?.inspection_fee ?? listing.inspection_fee).toLocaleString()}</div>
                            </div>
                            <label style={s.label}>Amount Sent (₦) *</label>
                            <input style={s.input} type="number" value={inspProof.amount_naira}
                              onChange={e => setInspProof(p => ({...p, amount_naira: e.target.value}))}
                              placeholder={String(inspectionDeal?.inspection_fee ?? listing.inspection_fee)}/>
                            <label style={s.label}>Bank You Transferred From *</label>
                            <select style={s.input} value={inspProof.payer_bank}
                              onChange={e => setInspProof(p => ({...p, payer_bank: e.target.value}))}>
                              <option value="">Select bank</option>
                              {inspBanks.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                            <label style={s.label}>Transfer Reference *</label>
                            <input style={s.input} value={inspProof.transfer_reference}
                              onChange={e => setInspProof(p => ({...p, transfer_reference: e.target.value}))}
                              placeholder="Bank transfer reference"/>
                            <label style={s.label}>Transfer Date *</label>
                            <input style={s.input} type="date" value={inspProof.transfer_date} max={todayLocalISO()}
                              onChange={e => setInspProof(p => ({...p, transfer_date: e.target.value}))}/>
                            <label style={s.label}>Receipt (screenshot/PDF) *</label>
                            <input type="file" accept="image/*,.pdf" style={{...s.input, padding:'6px'}}
                              onChange={e => setInspProof(p => ({...p, receipt: e.target.files?.[0] || null}))}/>
                            <div style={{display:'flex', gap:8, marginTop:14}}>
                              <button onClick={() => setStep('booking')} style={s.backBtn}>← Back</button>
                              <button onClick={handleSubmitInspectionProof} disabled={inspSubmitting}
                                style={{...s.dealBtn, marginTop:0, flex:2, opacity:inspSubmitting?0.5:1}}>
                                {inspSubmitting ? 'Submitting…' : 'Submit Proof'}
                              </button>
                            </div>
                          </>
                        )}
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
                            <strong>Lease:</strong> {form.lease_duration_months}-month tenancy starting {form.move_in_date || '—'}, at ₦{(rent * (Number(form.lease_duration_months)/12)).toLocaleString()}/{listing.rent_period==='monthly'?'month':'year'}.
                          </p>
                          <p style={s.legalP}>
                            <strong>Escrow:</strong> Your full payment is held by SouthSwift SwiftShield until you confirm move-in. Funds are only released to the landlord after you confirm satisfactory move-in within the agreed window.
                          </p>
                          <p style={s.legalP}>
                            <strong>Refund:</strong> If the landlord fails to deliver the property in the condition advertised, you can raise a dispute and request a refund within 14 days.
                          </p>
                          {/* <p style={s.legalP}>
                            <strong>Platform fee:</strong> 5% total (2.5% tenant + 2.5% landlord). Non-refundable once escrow is held.
                          </p> */}
                        </div>

                        <label style={s.legalCheck}>
                          <input required type="checkbox" checked={legalAgreed.terms}
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
                          <button onClick={() => setStep('swiftdoc')} disabled={dealing} style={s.backBtn}>← Back</button>
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
  mainImg:     { width:'100%', height:420, objectFit:'contain', display:'block' },
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
