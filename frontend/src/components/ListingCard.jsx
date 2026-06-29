import { Link } from 'react-router-dom';
import { Shield, MapPin, Bed, Bath, CheckCircle } from 'lucide-react';

const G    = '#1B4332';
const GOLD = '#C8963C';

const fmt = (n) => { const num = Number(n); return isNaN(num) ? '0' : num.toLocaleString(); };

// Inline SVG fallback — never depends on a 3rd-party host. via.placeholder.com used to
// fill this slot but went offline; broken images inside <Link> let iOS render the alt
// text in default-link colour, which is what produced the purple title overlay.
const PLACEHOLDER = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 220'%3E%3Crect width='400' height='220' fill='%231B4332'/%3E%3Cpath d='M200 80 L240 110 L240 150 L160 150 L160 110 Z' fill='%23C8963C' opacity='0.6'/%3E%3Ctext x='200' y='185' font-family='Arial' font-size='14' font-weight='700' fill='white' text-anchor='middle' opacity='0.7'%3ESouthSwift%3C/text%3E%3C/svg%3E";

export default function ListingCard({ listing, distanceKm }) {
  const {
    id, title, city, state, rent_price, rent_period,
    bedrooms, bathrooms, property_type, images,
    is_swiftshield, is_room_share, room_share_slots, room_share_slots_filled,
    agent_name, verification_status
  } = listing;

  const img = images?.[0] || PLACEHOLDER;

  return (
    <Link to={`/listings/${id}`} style={s.card}>
      {/* Image — alt is informational (listing title) for screen readers. The
          earlier alt="" was a workaround for iOS Safari painting alt text in
          link-coloured pixels when the URL failed; the proper fix is the SVG
          placeholder itself + immediately swapping the src on error so no
          broken-image state ever paints. */}
      <div style={s.imgWrap}>
        <img src={img} alt={title || 'Property listing'} style={s.img}
          onError={e => { if (e.target.src !== PLACEHOLDER) e.target.src = PLACEHOLDER; }} />
        {is_swiftshield && (
          <div style={s.shield}>
            <Shield size={12} color="white" strokeWidth={3} />
            <span>SwiftShield</span>
          </div>
        )}
        <div style={s.type}>{property_type}</div>
        {is_room_share && (
          <div style={s.roomShareBadge}>
            👥 Room Share · {room_share_slots_filled || 0}/{room_share_slots} slots
          </div>
        )}
      </div>

      {/* Body */}
      <div style={s.body}>
        <div style={s.price}>
          ₦{fmt(rent_price)}
          <span style={s.period}>/{rent_period === 'monthly' ? 'mo' : 'yr'}</span>
        </div>
        <div style={s.title}>{title}</div>
        <div style={s.location}>
          <MapPin size={12} color={GOLD} />
          {city}, {state}
        </div>
        {distanceKm != null && (
          <div style={s.distanceBadge}>📍 {distanceKm}km away</div>
        )}
        <div style={s.specs}>
          <span><Bed size={12} /> {bedrooms} bed</span>
          <span><Bath size={12} /> {bathrooms} bath</span>
        </div>
        <div style={s.agent}>
          {verification_status === 'verified'
            ? <CheckCircle size={12} color="#22C55E" />
            : <div style={s.dot} />}
          <span>{agent_name}</span>
          {verification_status === 'verified' && <span style={s.verTag}>Verified</span>}
        </div>
      </div>
    </Link>
  );
}

const s = {
  card:     { display:'block', background:'white', borderRadius:14, overflow:'hidden',
              boxShadow:'0 2px 12px rgba(0,0,0,0.07)', textDecoration:'none',
              border:'1px solid #E5E7EB', transition:'transform 0.15s',
              cursor:'pointer' },
  imgWrap:  { position:'relative', height:180, overflow:'hidden' },
  img:      { width:'100%', height:'100%', objectFit:'cover' },
  shield:   { position:'absolute', top:10, left:10, background:G,
              color:'white', fontSize:10, fontWeight:700, padding:'4px 8px',
              borderRadius:20, display:'flex', alignItems:'center', gap:4 },
  type:     { position:'absolute', top:10, right:10, background:'rgba(0,0,0,0.5)',
              color:'white', fontSize:10, padding:'3px 8px', borderRadius:10 },
  roomShareBadge: { position:'absolute', bottom:10, left:10, background:GOLD, color:'white',
                    fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:10 },
  distanceBadge: { fontSize:11, color:G, fontWeight:700, marginTop:2, marginBottom:4 },
  body:     { padding:'14px 16px' },
  price:    { fontSize:20, fontWeight:800, color:G, marginBottom:2 },
  period:   { fontSize:12, fontWeight:400, color:'#888' },
  title:    { fontSize:13, fontWeight:600, color:'#111', marginBottom:6,
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  location: { display:'flex', alignItems:'center', gap:4, fontSize:12,
              color:'#666', marginBottom:8 },
  specs:    { display:'flex', gap:14, fontSize:12, color:'#555', marginBottom:10 },
  agent:    { display:'flex', alignItems:'center', gap:5, fontSize:11, color:'#666' },
  dot:      { width:8, height:8, borderRadius:'50%', background:'#DDD' },
  verTag:   { background:'#DCFCE7', color:'#166534', fontSize:9, fontWeight:700,
              padding:'1px 6px', borderRadius:8 },
};
