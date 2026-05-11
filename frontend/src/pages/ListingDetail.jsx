import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { getListing, initiateDeal, getRoomShareStatus } from '../utils/api';
import { useAuth } from '../App';
import { Shield, MapPin, Bed, Bath, CheckCircle, Home, Star } from 'lucide-react';

const G    = '#1B4332';
const GOLD = '#C8963C';

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
    const query = encodeURIComponent(`${address}, ${city}, ${state}, Nigeria`);
    fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`, {
      headers: { 'Accept-Language': 'en' }
    })
      .then(r => r.json())
      .then(data => {
        if (data && data.length > 0) {
          setCoords([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
        } else { setMapError(true); }
      })
      .catch(() => setMapError(true));
  }, []);

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
  const [form, setForm]       = useState({ lease_duration_months: 12, move_in_date: '' });
  const [dealing, setDealing] = useState(false);
  const [roomShare, setRoomShare] = useState(null);

  useEffect(() => {
    getListing(id)
      .then(r => {
        setL(r.data);
        if (r.data.is_room_share) {
          getRoomShareStatus(id).then(rs => setRoomShare(rs.data)).catch(() => {});
        }
      })
      .catch(() => toast.error('Listing not found.'))
      .finally(() => setLoad(false));
  }, [id]);

  const handleDeal = async () => {
    if (!user) { navigate('/login'); return; }
    if (!form.move_in_date) { toast.error('Please select a move-in date.'); return; }
    setDealing(true);
    try {
      const res = await initiateDeal({
        listing_id:            id,
        lease_duration_months: form.lease_duration_months,
        move_in_date:          form.move_in_date,
        is_room_share:         listing.is_room_share,
      });
      toast.success('Deal initiated! Redirecting to payment...');
      window.location.href = res.data.payment_url;
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to initiate deal.');
    }
    setDealing(false);
  };

  if (loading) return <div style={s.loading}>Loading listing...</div>;
  if (!listing) return <div style={s.loading}>Listing not found.</div>;

  const images    = listing.images?.length ? listing.images : ['https://via.placeholder.com/800x480?text=SouthSwift'];
  const amenities = Array.isArray(listing.amenities) ? listing.amenities : [];
  const slotsFull = listing.is_room_share && roomShare &&
    parseInt(roomShare.room_share_slots_filled) >= parseInt(roomShare.room_share_slots);

  return (
    <div style={s.page}>
      <div style={s.container}>
        {/* GALLERY */}
        <div style={s.gallery}>
          <img src={images[imgIdx]} alt={listing.title} style={s.mainImg}
            onError={e => { e.target.src='https://via.placeholder.com/800x480?text=SouthSwift'; }}/>
          {listing.is_swiftshield && (
            <div style={s.shieldBadge}><Shield size={13} color="white" strokeWidth={3}/> SwiftShield Protected</div>
          )}
          {images.length > 1 && (
            <div style={s.thumbRow}>
              {images.map((img, i) => (
                <img key={i} src={img} alt="" onClick={() => setImgIdx(i)}
                  style={{...s.thumb, border: i===imgIdx ? `3px solid ${G}` : '3px solid transparent'}}
                  onError={e => { e.target.src='https://via.placeholder.com/100x70'; }}/>
              ))}
            </div>
          )}
        </div>

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
                <div style={s.amenGrid}>{amenities.map((a,i) => <span key={i} style={s.amenTag}>&#10003; {a}</span>)}</div>
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
                <span style={s.bookTitle}>{listing.is_room_share ? 'Join Room Share Deal' : 'Start SwiftShield Deal'}</span>
              </div>
              <p style={s.bookDesc}>Your payment is held in escrow and only released when you confirm move-in. 100% protected.</p>

              {listing.is_room_share && roomShare && (
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

              <div style={s.feeBreakdown}>
                {listing.is_room_share ? (
                  <>
                    <div style={s.feeRow}><span>Per Person</span><span style={{fontWeight:600}}>&#8358;{Number(listing.room_share_price_per_person).toLocaleString()}</span></div>
                    <div style={s.feeRow}><span style={{color:GOLD}}>SwiftShield Fee (2%)</span><span style={{color:GOLD,fontWeight:600}}>&#8358;{Math.round(listing.room_share_price_per_person*0.02).toLocaleString()}</span></div>
                    <div style={{...s.feeRow,borderTop:'1px solid #E5E7EB',paddingTop:8,marginTop:4}}><span style={{fontWeight:800}}>Your Total</span><span style={{fontWeight:800,color:G}}>&#8358;{Math.round(listing.room_share_price_per_person*1.02).toLocaleString()}</span></div>
                  </>
                ) : (
                  <>
                    <div style={s.feeRow}><span>Rent</span><span style={{fontWeight:600}}>&#8358;{Number(listing.rent_price).toLocaleString()}</span></div>
                    <div style={s.feeRow}><span style={{color:GOLD}}>SwiftShield Fee (2%)</span><span style={{color:GOLD,fontWeight:600}}>&#8358;{Math.round(listing.rent_price*0.02).toLocaleString()}</span></div>
                    <div style={{...s.feeRow,borderTop:'1px solid #E5E7EB',paddingTop:8,marginTop:4}}><span style={{fontWeight:800}}>Total</span><span style={{fontWeight:800,color:G}}>&#8358;{Math.round(listing.rent_price*1.02).toLocaleString()}</span></div>
                  </>
                )}
              </div>

              <label style={s.label}>Move-in Date</label>
              <input type="date" style={s.input} value={form.move_in_date}
                min={new Date().toISOString().split('T')[0]}
                onChange={e => setForm(f=>({...f,move_in_date:e.target.value}))}/>
              <label style={s.label}>Lease Duration</label>
              <select style={s.input} value={form.lease_duration_months}
                onChange={e => setForm(f=>({...f,lease_duration_months:Number(e.target.value)}))}>
                {[6,12,18,24].map(m=><option key={m} value={m}>{m} months</option>)}
              </select>
              <button onClick={handleDeal} disabled={dealing||slotsFull}
                style={{...s.dealBtn,opacity:(dealing||slotsFull)?0.5:1}}>
                {slotsFull ? 'All Slots Filled' : dealing ? 'Initiating...' :
                  listing.is_room_share
                    ? `Claim Your Slot - N${Math.round(Number(listing.room_share_price_per_person)*1.02).toLocaleString()}`
                    : 'Initiate SwiftShield Deal'}
              </button>
              <div style={s.trustRow}>
                {['Escrow Protected','Legal Doc Included','Verified Agent'].map(t=>(
                  <span key={t} style={s.trustTag}>v {t}</span>
                ))}
              </div>
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
};
