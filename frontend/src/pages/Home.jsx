import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { getListings } from '../utils/api';
import ListingCard from '../components/ListingCard';
import { Search, Shield, Map, List } from 'lucide-react';

const G    = '#1B4332';
const GOLD = '#C8963C';

// Fix Leaflet marker icons broken by webpack
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Price pin icon
const makePriceIcon = (price, active) => new L.DivIcon({
  html: `<div style="background:${active ? GOLD : G};color:white;padding:4px 8px;border-radius:12px;font-size:11px;font-weight:800;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid white">₦${Math.round(price/1000)}k</div>`,
  className: '',
  iconAnchor: [20, 14],
});

// ── MAP VIEW ──────────────────────────────────────────────────────────────────
function ListingsMap({ listings }) {
  const navigate = useNavigate();
  const [active, setActive] = useState(null);

  // Default center = Lagos
  const center = [6.5244, 3.3792];
  const pinnable = listings.filter(l => l.latitude && l.longitude);

  if (pinnable.length === 0) return (
    <div style={mm.placeholder}>
      <Shield size={24} color="#CCC" />
      <span>No listings with map coordinates yet.</span>
    </div>
  );

  return (
    <MapContainer
      center={center}
      zoom={11}
      style={{ width: '100%', height: '60vh', borderRadius: 14 }}
      scrollWheelZoom={false}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {pinnable.map(l => (
        <Marker
          key={l.id}
          position={[parseFloat(l.latitude), parseFloat(l.longitude)]}
          icon={makePriceIcon(l.rent_price, active?.id === l.id)}
          eventHandlers={{ click: () => setActive(active?.id === l.id ? null : l) }}
        >
          {active?.id === l.id && (
            <Popup onClose={() => setActive(null)}>
              <div style={mm.infoWin} onClick={() => navigate(`/listings/${l.id}`)}>
                {l.images?.[0] && (
                  <img src={l.images[0]} alt="" style={mm.infoImg}
                    onError={e => { e.target.style.display = 'none'; }} />
                )}
                <div style={mm.infoPrice}>₦{Number(l.rent_price).toLocaleString()}</div>
                <div style={mm.infoTitle}>{l.title}</div>
                <div style={mm.infoSub}>{l.city} · {l.bedrooms} bed</div>
                <div style={mm.infoLink}>View listing →</div>
              </div>
            </Popup>
          )}
        </Marker>
      ))}
    </MapContainer>
  );
}

const mm = {
  placeholder: { height: '60vh', background: '#F3F4F6', borderRadius: 14,
                 display: 'flex', flexDirection: 'column', alignItems: 'center',
                 justifyContent: 'center', gap: 10, color: '#999', fontSize: 14 },
  infoWin:  { cursor: 'pointer', minWidth: 160 },
  infoImg:  { width: '100%', height: 90, objectFit: 'cover', borderRadius: 6, marginBottom: 8 },
  infoPrice:{ fontSize: 15, fontWeight: 800, color: G },
  infoTitle:{ fontSize: 12, fontWeight: 600, color: '#111', margin: '2px 0' },
  infoSub:  { fontSize: 11, color: '#888' },
  infoLink: { fontSize: 11, color: GOLD, fontWeight: 700, marginTop: 4 },
};

// ── HOME PAGE ─────────────────────────────────────────────────────────────────
export default function Home() {
  const [listings,    setListings]   = useState([]);
  const [pagination,  setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading,     setLoading]    = useState(true);
  const [viewMode,    setViewMode]   = useState('list'); // 'list' | 'map'
  const [filters,     setFilters]    = useState({
    city: '', state: '', min_price: '', max_price: '', bedrooms: '', swiftshield: '',
    near: '', radius_km: '5'
  });

  const states = ['Lagos','Abuja','Rivers','Oyo','Kwara','Osun','Ekiti','Enugu','Kano','Kaduna'];

  const fetchListings = (params = {}) => {
    setLoading(true);
    const active = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    // In map mode fetch more so pins are meaningful
    const limit = viewMode === 'map' ? 100 : 12;
    getListings({ ...active, limit, ...params })
      .then(r => {
        setListings(r.data.listings);
        setPagination(r.data.pagination);
      })
      .catch(() => setListings([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchListings({ page: 1 }); }, [filters, viewMode]);

  return (
    <div style={s.page}>
      {/* HERO */}
      <div style={s.hero}>
        <div style={s.heroInner}>
          <div style={s.heroTag}>
            <Shield size={14} color={GOLD} />
            <span>SwiftShield Escrow Protected</span>
          </div>
          <h1 style={s.heroTitle}>
            Find Your Next Home.<br />
            <span style={{ color: GOLD }}>Protected From Day One.</span>
          </h1>
          <p style={s.heroSub}>
            Verified agents · Escrow payments · Free legal counsel · Across Nigeria
          </p>

          {/* Search bar */}
          <div style={s.searchBar}>
            <Search size={18} color="#999" />
            <input
              placeholder="Search by city e.g. Lagos, Ibadan, Ilorin..."
              style={s.searchInput}
              value={filters.city}
              onChange={e => setFilters(f => ({ ...f, city: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && fetchListings()}
            />
            <button style={s.searchBtn} onClick={fetchListings}>Search</button>
          </div>

          {/* Stats */}
          <div style={s.heroStats}>
            {[['🛡️','SwiftShield','Escrow every deal'],
              ['📋','SwiftDoc','Legal docs auto-generated'],
              ['⚖️','SwiftCounsel','Free property lawyers'],
              ['🔗','SwiftConnect','Monitored agent chat']].map(([icon,name,desc])=>(
              <div key={name} style={s.statItem}>
                <span style={s.statIcon}>{icon}</span>
                <div>
                  <div style={s.statName}>{name}</div>
                  <div style={s.statDesc}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FILTER BAR */}
      <div style={s.filterBar}>
        <div style={s.filterInner}>
          <select style={s.select} value={filters.state}
            onChange={e => setFilters(f => ({ ...f, state: e.target.value }))}>
            <option value="">All States</option>
            {states.map(st => <option key={st} value={st}>{st}</option>)}
          </select>
          <select style={s.select} value={filters.bedrooms}
            onChange={e => setFilters(f => ({ ...f, bedrooms: e.target.value }))}>
            <option value="">Any Bedrooms</option>
            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}+ Beds</option>)}
          </select>
          <select style={s.select} value={filters.swiftshield}
            onChange={e => setFilters(f => ({ ...f, swiftshield: e.target.value }))}>
            <option value="">All Listings</option>
            <option value="true">SwiftShield Only</option>
          </select>
          <input style={s.priceInput} type="number" placeholder="Max Price (₦)"
            value={filters.max_price}
            onChange={e => setFilters(f => ({ ...f, max_price: e.target.value }))}/>
          <button style={s.filterBtn} onClick={() => fetchListings({ page: 1 })}>Apply</button>
          <button style={s.clearBtn} onClick={() => setFilters({ city:'',state:'',min_price:'',max_price:'',bedrooms:'',swiftshield:'',near:'',radius_km:'5' })}>Clear</button>

          {/* ── PROXIMITY FILTER ── */}
          <input
            style={{ ...s.priceInput, width: 200 }}
            placeholder="📍 Near landmark e.g. UNILORIN Gate"
            value={filters.near}
            onChange={e => setFilters(f => ({ ...f, near: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && fetchListings({ page: 1 })}
          />
          {filters.near && (
            <select style={s.select} value={filters.radius_km}
              onChange={e => setFilters(f => ({ ...f, radius_km: e.target.value }))}>
              <option value="1">Within 1km</option>
              <option value="2">Within 2km</option>
              <option value="5">Within 5km</option>
              <option value="10">Within 10km</option>
            </select>
          )}

          {/* ── VIEW TOGGLE ── */}
          <div style={s.viewToggle}>
            <button
              onClick={() => setViewMode('list')}
              style={{ ...s.toggleBtn, ...(viewMode === 'list' ? s.toggleActive : {}) }}
            >
              <List size={14}/> List
            </button>
            <button
              onClick={() => setViewMode('map')}
              style={{ ...s.toggleBtn, ...(viewMode === 'map' ? s.toggleActive : {}) }}
            >
              <Map size={14}/> Map
            </button>
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div style={s.container}>
        <div style={s.resultsHeader}>
          <h2 style={s.resultsTitle}>
            {loading ? 'Loading...' : `${pagination.total} Properties Available`}
          </h2>
        </div>

        {loading ? (
          <div style={s.loadingMsg}>🛡️ Finding protected properties...</div>
        ) : listings.length === 0 ? (
          <div style={s.empty}>
            <Shield size={48} color="#DDD"/>
            <p>No listings found. Try different filters.</p>
          </div>
        ) : viewMode === 'map' ? (
          /* ── MAP VIEW ── */
          <div>
            <ListingsMap listings={listings}/>
            <p style={{ fontSize: 12, color: '#999', textAlign: 'center', marginTop: 8 }}>
              Only listings with saved coordinates show as pins. Click a pin to preview.
            </p>
          </div>
        ) : (
          /* ── LIST VIEW ── */
          <>
            {filters.near && !loading && (
              <div style={{ background: '#F0F9F0', borderRadius: 10, padding: '10px 16px',
                            marginBottom: 16, fontSize: 13, color: G, border: '1px solid #BBF7D0' }}>
                📍 Showing listings within <strong>{filters.radius_km}km</strong> of{' '}
                <strong>"{filters.near}"</strong> — sorted by distance
              </div>
            )}
            <div style={s.grid}>
              {listings.map(l => (
                <ListingCard
                  key={l.id}
                  listing={l}
                  distanceKm={filters.near ? l.distance_km : undefined}
                />
              ))}
            </div>
            {pagination.pages > 1 && (
              <div style={s.pagination}>
                <button
                  disabled={pagination.page <= 1}
                  onClick={() => fetchListings({ page: pagination.page - 1 })}
                  style={{ ...s.pageBtn, opacity: pagination.page <= 1 ? 0.4 : 1 }}
                >
                  ← Previous
                </button>
                <span style={s.pageInfo}>
                  Page {pagination.page} of {pagination.pages} ({pagination.total} listings)
                </span>
                <button
                  disabled={pagination.page >= pagination.pages}
                  onClick={() => fetchListings({ page: pagination.page + 1 })}
                  style={{ ...s.pageBtn, opacity: pagination.page >= pagination.pages ? 0.4 : 1 }}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const s = {
  page:         { fontFamily: 'Arial,sans-serif' },
  hero:         { background: `linear-gradient(135deg, ${G} 0%, #0A1A0A 100%)`, padding: '60px 20px 50px', color: 'white' },
  heroInner:    { maxWidth: 860, margin: '0 auto' },
  heroTag:      { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(200,150,60,0.15)',
                  border: '1px solid rgba(200,150,60,0.4)', color: GOLD, fontSize: 12, fontWeight: 700,
                  padding: '5px 14px', borderRadius: 20, marginBottom: 18 },
  heroTitle:    { fontSize: 42, fontWeight: 900, margin: '0 0 14px', lineHeight: 1.2, fontFamily: 'Georgia,serif' },
  heroSub:      { fontSize: 16, color: 'rgba(255,255,255,0.7)', marginBottom: 30 },
  searchBar:    { display: 'flex', alignItems: 'center', background: 'white', borderRadius: 12,
                  padding: '8px 14px', gap: 10, maxWidth: 600, marginBottom: 36,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.2)' },
  searchInput:  { flex: 1, border: 'none', outline: 'none', fontSize: 14, color: '#333' },
  searchBtn:    { background: G, color: 'white', border: 'none', padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 },
  heroStats:    { display: 'flex', gap: 24, flexWrap: 'wrap' },
  statItem:     { display: 'flex', alignItems: 'center', gap: 10 },
  statIcon:     { fontSize: 22 },
  statName:     { fontSize: 13, fontWeight: 700, color: 'white' },
  statDesc:     { fontSize: 11, color: 'rgba(255,255,255,0.5)' },
  filterBar:    { background: 'white', borderBottom: '1px solid #E5E7EB', padding: '12px 20px', position: 'sticky', top: 64, zIndex: 90 },
  filterInner:  { maxWidth: 1200, margin: '0 auto', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  select:       { border: '1px solid #DDD', borderRadius: 8, padding: '7px 12px', fontSize: 13, outline: 'none', cursor: 'pointer', background: 'white' },
  priceInput:   { border: '1px solid #DDD', borderRadius: 8, padding: '7px 12px', fontSize: 13, outline: 'none', width: 140 },
  filterBtn:    { background: G, color: 'white', border: 'none', padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 },
  clearBtn:     { background: 'transparent', color: '#666', border: '1px solid #DDD', padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13 },
  viewToggle:   { display: 'flex', gap: 0, marginLeft: 'auto', borderRadius: 8, overflow: 'hidden', border: '1px solid #DDD' },
  toggleBtn:    { display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', border: 'none', background: 'white', cursor: 'pointer', fontSize: 13, color: '#555' },
  toggleActive: { background: G, color: 'white' },
  container:    { maxWidth: 1200, margin: '0 auto', padding: '28px 20px' },
  resultsHeader:{ marginBottom: 20 },
  resultsTitle: { fontSize: 18, fontWeight: 700, color: '#111', margin: 0 },
  grid:         { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 22 },
  loadingMsg:   { textAlign: 'center', padding: 60, fontSize: 16, color: G },
  empty:        { textAlign: 'center', padding: 60, color: '#999' },
  pagination:   { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 28 },
  pageBtn:      { padding: '8px 18px', borderRadius: 8, border: '1px solid #DDD', background: 'white', cursor: 'pointer', fontWeight: 700 },
  pageInfo:     { padding: '8px 14px', fontSize: 13, color: '#666' },
};
