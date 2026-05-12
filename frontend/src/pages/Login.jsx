// ── LOGIN ─────────────────────────────────────────────────────────────────────
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { loginUser, registerUser } from '../utils/api';
import { useAuth } from '../App';
import { Shield } from 'lucide-react';

const G = '#1B4332'; const GOLD = '#C8963C';

export function Login() {
  const [form, setForm]       = useState({ email:'', password:'' });
  const [loading, setLoading] = useState(false);
  const { login }             = useAuth();
  const navigate              = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await loginUser(form);
      login(res.data.user, res.data.token);
      toast.success(`Welcome back, ${res.data.user.full_name.split(' ')[0]}! 🛡️`);
      navigate(res.data.user.role === 'admin' ? '/admin' : '/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed.');
    }
    setLoading(false);
  };

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <div style={s.logo}><Shield size={28} color={GOLD} /><span style={s.logoText}>South<span style={{color:GOLD}}>Swift</span></span></div>
        <h2 style={s.title}>Welcome back</h2>
        <p style={s.sub}>Sign in to your SouthSwift account</p>
        <form onSubmit={submit}>
          <label style={s.label}>Email</label>
          <input style={s.input} type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} required placeholder="you@email.com" />
          <label style={s.label}>Password</label>
          <input style={s.input} type="password" value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} required placeholder="••••••••" />
          <button style={{...s.btn, opacity:loading?0.7:1}} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <p style={s.switch}>Don't have an account? <Link to="/register" style={s.linkA}>Register free</Link></p>
      </div>
    </div>
  );
}

// ── REGISTER ─────────────────────────────────────────────────────────────────
export function Register() {
  const [searchParams]        = useSearchParams();
  const prefilledRole         = searchParams.get('role') || 'tenant';
  const [form, setForm]       = useState({ full_name:'', email:'', phone:'', password:'', role: ['tenant','agent','landlord'].includes(prefilledRole) ? prefilledRole : 'tenant', state:'', city:'' });
  const [loading, setLoading] = useState(false);
  const { login }             = useAuth();
  const navigate              = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await registerUser(form);
      login(res.data.user, res.data.token);
      toast.success('Account created! Welcome to SouthSwift 🛡️');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Registration failed.');
    }
    setLoading(false);
  };

  return (
    <div style={s.wrap}>
      <div style={{...s.card, maxWidth:480}}>
        <div style={s.logo}><Shield size={28} color={GOLD} /><span style={s.logoText}>South<span style={{color:GOLD}}>Swift</span></span></div>
        <h2 style={s.title}>Create your account</h2>
        <p style={s.sub}>Join Nigeria's verified property platform</p>
        <form onSubmit={submit}>
          {[['Full Name','text','full_name','John Doe'],['Email','email','email','you@email.com'],
            ['Phone Number','tel','phone','+234 800 000 0000']].map(([lbl,type,key,ph])=>(
            <div key={key}>
              <label style={s.label}>{lbl}</label>
              <input style={s.input} type={type} value={form[key]} placeholder={ph} required
                onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} />
            </div>
          ))}
          <label style={s.label}>I am a</label>
          <select style={s.input} value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))}>
            <option value="tenant">Tenant — Looking for a property</option>
            <option value="agent">Agent — I list properties</option>
            <option value="landlord">Landlord — I own properties</option>
          </select>
          <label style={s.label}>State</label>
          <select style={s.input} value={form.state} onChange={e=>setForm(f=>({...f,state:e.target.value}))}>
            <option value="">Select State</option>
            {['Lagos','Abuja','Rivers','Oyo','Kwara','Osun','Ekiti','Enugu','Kano','Kaduna','Ogun','Delta'].map(st=>(
              <option key={st} value={st}>{st}</option>
            ))}
          </select>
          <label style={s.label}>Password</label>
          <input style={s.input} type="password" value={form.password} placeholder="Min 8 characters" required
            onChange={e=>setForm(f=>({...f,password:e.target.value}))} />
          <button style={{...s.btn, opacity:loading?0.7:1}} disabled={loading}>
            {loading ? 'Creating Account...' : 'Create Account — Free'}
          </button>
        </form>
        <p style={s.switch}>Already have an account? <Link to="/login" style={s.linkA}>Sign in</Link></p>
      </div>
    </div>
  );
}

const s = {
  wrap:     { minHeight:'90vh', display:'flex', alignItems:'center', justifyContent:'center', padding:20 },
  card:     { background:'white', borderRadius:16, padding:'40px 36px', width:'100%',
              maxWidth:420, boxShadow:'0 4px 30px rgba(0,0,0,0.1)', border:'1px solid #F0F0F0' },
  logo:     { display:'flex', alignItems:'center', gap:8, marginBottom:20 },
  logoText: { fontSize:20, fontWeight:900, color:G, fontFamily:'Georgia,serif' },
  title:    { fontSize:24, fontWeight:700, color:'#111', margin:'0 0 6px' },
  sub:      { fontSize:13, color:'#777', margin:'0 0 24px' },
  label:    { display:'block', fontSize:12, fontWeight:700, color:'#444', marginBottom:5, marginTop:14 },
  input:    { width:'100%', border:'1px solid #DDD', borderRadius:8, padding:'10px 12px',
              fontSize:14, outline:'none', boxSizing:'border-box', fontFamily:'Arial' },
  btn:      { width:'100%', background:G, color:'white', border:'none', padding:'12px',
              borderRadius:10, cursor:'pointer', fontWeight:700, fontSize:15, marginTop:20 },
  switch:   { textAlign:'center', marginTop:18, fontSize:13, color:'#666' },
  linkA:    { color:G, fontWeight:700 },
};

export default Login;
