import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { Shield, Home, LogOut, LayoutDashboard, PlusCircle, Settings, Menu, X } from 'lucide-react';

const G    = '#1B4332';
const GOLD = '#C8963C';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate         = useNavigate();
  const [open, setOpen]  = useState(false);

  const handleLogout = () => { logout(); navigate('/'); setOpen(false); };
  const close        = () => setOpen(false);

  return (
    <>
      <nav style={s.nav}>
        {/* Brand */}
        <Link to="/" style={s.brand} onClick={close}>
          <Shield size={22} color={GOLD} strokeWidth={2.5} />
          <span style={s.brandText}>South<span style={{ color: GOLD }}>Swift</span></span>
        </Link>

        {/* Desktop links */}
        <div style={s.desktopLinks} className="ss-desktop">
          <Link to="/listings" style={s.link}><Home size={15} /> Listings</Link>
          {user ? (
            <>
              <Link to="/dashboard"    style={s.link}><LayoutDashboard size={15} /> Dashboard</Link>
              {['agent','admin'].includes(user.role) && (
                <Link to="/create-listing" style={{ ...s.link, ...s.btnGold }}>
                  <PlusCircle size={15} /> Add Listing
                </Link>
              )}
              {user.role === 'admin' && (
                <Link to="/admin" style={s.link}><Settings size={15} /> Admin</Link>
              )}
              <div style={s.userBadge}>
                <span style={s.roleTag}>{user.role}</span>
                <span style={s.userName}>{user.full_name?.split(' ')[0]}</span>
              </div>
              <button onClick={handleLogout} style={s.logoutBtn}>
                <LogOut size={14} /> Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login"    style={s.link}>Login</Link>
              <Link to="/register" style={s.btnGreen}>Get Started</Link>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button style={s.hamburger} className="ss-hamburger" onClick={() => setOpen(o => !o)} aria-label="Menu">
          {open ? <X size={24} color="white" /> : <Menu size={24} color="white" />}
        </button>
      </nav>

      {/* Mobile drawer */}
      {open && (
        <div style={s.drawer}>
          <Link to="/listings"  style={s.drawerLink} onClick={close}><Home size={16} /> Listings</Link>
          {user ? (
            <>
              <Link to="/dashboard" style={s.drawerLink} onClick={close}>
                <LayoutDashboard size={16} /> Dashboard
              </Link>
              {['agent','admin'].includes(user.role) && (
                <Link to="/create-listing" style={{ ...s.drawerLink, color: GOLD }} onClick={close}>
                  <PlusCircle size={16} /> Add Listing
                </Link>
              )}
              {user.role === 'admin' && (
                <Link to="/admin" style={s.drawerLink} onClick={close}>
                  <Settings size={16} /> Admin
                </Link>
              )}
              <div style={s.drawerUser}>
                <span style={s.roleTag}>{user.role}</span>
                <span style={{ color: 'white', fontSize: 13 }}>{user.full_name}</span>
              </div>
              <button onClick={handleLogout} style={s.drawerLogout}>
                <LogOut size={14} /> Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login"    style={s.drawerLink}   onClick={close}>Login</Link>
              <Link to="/register" style={s.drawerBtnGreen} onClick={close}>Get Started →</Link>
            </>
          )}
        </div>
      )}
    </>
  );
}

const s = {
  nav:         { position:'fixed', top:0, left:0, right:0, zIndex:100, background:G,
                 height:64, display:'flex', alignItems:'center',
                 justifyContent:'space-between', padding:'0 20px',
                 boxShadow:'0 2px 12px rgba(0,0,0,0.2)' },
  brand:       { display:'flex', alignItems:'center', gap:8, textDecoration:'none', flexShrink:0 },
  brandText:   { fontSize:20, fontWeight:900, color:'white', fontFamily:'Georgia,serif' },
  desktopLinks:{ display:'flex', alignItems:'center', gap:16,
                 '@media(max-width:768px)': { display:'none' } },
  link:        { display:'flex', alignItems:'center', gap:4, color:'#A8D5B5',
                 textDecoration:'none', fontSize:13, fontWeight:600 },
  btnGold:     { background:GOLD, color:'white', padding:'6px 14px',
                 borderRadius:20, fontSize:13, textDecoration:'none' },
  btnGreen:    { background:'white', color:G, padding:'7px 18px', borderRadius:20,
                 fontSize:13, fontWeight:700, textDecoration:'none' },
  userBadge:   { display:'flex', alignItems:'center', gap:6 },
  roleTag:     { background:'rgba(200,150,60,0.2)', color:GOLD, fontSize:10,
                 fontWeight:700, padding:'2px 8px', borderRadius:10,
                 textTransform:'uppercase', letterSpacing:1 },
  userName:    { color:'white', fontSize:13, fontWeight:600 },
  logoutBtn:   { display:'flex', alignItems:'center', gap:4, background:'transparent',
                 border:'1px solid rgba(255,255,255,0.2)', color:'#A8D5B5',
                 padding:'5px 12px', borderRadius:8, cursor:'pointer', fontSize:12 },
  hamburger:   { background:'transparent', border:'none', cursor:'pointer', padding:4,
                 display:'none',
                 // shown via inline style below since we can't use @media in inline JS
               },

  // Mobile drawer
  drawer:      { position:'fixed', top:64, left:0, right:0, bottom:0, zIndex:99,
                 background:G, padding:'20px 24px', display:'flex',
                 flexDirection:'column', gap:4, overflowY:'auto' },
  drawerLink:  { display:'flex', alignItems:'center', gap:10, color:'#A8D5B5',
                 textDecoration:'none', fontSize:16, fontWeight:600,
                 padding:'14px 0', borderBottom:'1px solid rgba(255,255,255,0.08)' },
  drawerUser:  { display:'flex', alignItems:'center', gap:10, padding:'14px 0',
                 borderBottom:'1px solid rgba(255,255,255,0.08)' },
  drawerLogout:{ display:'flex', alignItems:'center', gap:8, background:'rgba(255,255,255,0.08)',
                 border:'none', color:'#A8D5B5', padding:'12px 16px',
                 borderRadius:10, cursor:'pointer', fontSize:15, marginTop:8 },
  drawerBtnGreen:{ background:'white', color:G, padding:'14px 20px', borderRadius:12,
                   fontSize:16, fontWeight:700, textDecoration:'none',
                   textAlign:'center', marginTop:12 },
};
