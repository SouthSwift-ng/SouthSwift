import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useState, useEffect, createContext, useContext } from 'react';
import { getMe } from './utils/api';

import Home          from './pages/Home';
import LandingPage   from './pages/LandingPage';
import Login         from './pages/Login';
import Register      from './pages/Register';
import Dashboard     from './pages/Dashboard';
import ListingDetail from './pages/ListingDetail';
import CreateListing from './pages/CreateListing';
import DealDetail    from './pages/DealDetail';
import AdminPanel    from './pages/AdminPanel';
import AgentProfile  from './pages/AgentProfile';
import Navbar        from './components/Navbar';
import { PrivacyPolicy, TermsOfService, EscrowPolicy } from './pages/LegalPages';

// ── AUTH CONTEXT ──────────────────────────────────────────────────────────────
export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const ProtectedRoute = ({ children, roles }) => {
  const { user, loading } = useAuth();
  if (loading) return <div style={styles.loading}>🛡️ Loading SouthSwift...</div>;
  if (!user)   return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
};

export default function App() {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('ss_token');
    if (token) {
      getMe().then(r => { setUser(r.data); setLoading(false); })
              .catch(()  => { localStorage.clear(); setLoading(false); });
    } else {
      setLoading(false);
    }
  }, []);

  const login  = (userData, token) => {
    localStorage.setItem('ss_token', token);
    localStorage.setItem('ss_user',  JSON.stringify(userData));
    setUser(userData);
  };
  const logout = () => {
    localStorage.clear();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      <BrowserRouter>
        <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
        <Navbar />
        <div style={styles.main}>
          <Routes>
            <Route path="/"            element={<LandingPage />} />
            <Route path="/listings"    element={<Home />} />
            <Route path="/login"       element={<Login />} />
            <Route path="/register"    element={<Register />} />
            <Route path="/listings/:id" element={<ListingDetail />} />
            <Route path="/agents/:id"  element={<AgentProfile />} />
            <Route path="/privacy-policy"   element={<PrivacyPolicy />} />
            <Route path="/terms-of-service"  element={<TermsOfService />} />
            <Route path="/escrow-policy"     element={<EscrowPolicy />} />

            <Route path="/dashboard" element={
              <ProtectedRoute><Dashboard /></ProtectedRoute>
            } />
            <Route path="/create-listing" element={
              <ProtectedRoute roles={['agent','admin']}><CreateListing /></ProtectedRoute>
            } />
            <Route path="/deals/:id" element={
              <ProtectedRoute><DealDetail /></ProtectedRoute>
            } />
            <Route path="/admin" element={
              <ProtectedRoute roles={['admin']}><AdminPanel /></ProtectedRoute>
            } />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}

const styles = {
  main:    { minHeight: '100vh', background: '#F8FAF8', paddingTop: 64 },
  loading: { display:'flex', alignItems:'center', justifyContent:'center',
             height:'100vh', fontSize:18, color:'#1B4332', fontFamily:'Arial' },
};
