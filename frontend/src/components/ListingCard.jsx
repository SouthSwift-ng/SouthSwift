import { Link } from 'react-router-dom';
import { Shield, MapPin, Bed, Bath, CheckCircle } from 'lucide-react';

const G    = '#1B4332';
const GOLD = '#C8963C';

const fmt = (n) => { const num = Number(n); return isNaN(num) ? '0' : num.toLocaleString(); };

export default function ListingCard({ listing, distanceKm }) {
  const {
    id, title, city, state, rent_price, rent_period,
    bedrooms, bathrooms, property_type, images,
    is_swiftshield, is_room_share, room_share_slots, room_share_slots_filled,
    agent_name, verification_status
  } = listing;

  const img = images?.[0] || 'https://via.placeholder.com/400x220?text=SouthSwift+Property';

  return (
    <Link to={`/listings/${id}`} style={s.card}>
      {/* Image */}
      <div style={s.imgWrap}>
        <img src={img} alt={title} style={s.img} onError={e => { e.target.src='https://via.placeholder.com/400x220?text=SouthSwift'; }} />
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
