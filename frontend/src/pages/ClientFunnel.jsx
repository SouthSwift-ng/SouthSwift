import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { submitClientFunnel } from '../utils/api';

const STEPS = [
  { key: 'intent', title: 'Your goal', subtitle: 'Tell us what you need' },
  { key: 'profile', title: 'Your details', subtitle: 'So we can follow up properly' },
  { key: 'preferences', title: 'What matters', subtitle: 'The experience you want' },
];

const NEED_OPTIONS = [
  'verified-agents',
  'escrow-protection',
  'legal-docs',
  'fast-move-in',
  'property-inspection',
];

const initialState = {
  fullName: '',
  email: '',
  phone: '',
  role: 'tenant',
  city: '',
  state: '',
  propertyType: 'rent',
  budget: '',
  moveInTiming: 'within-30-days',
  needs: [],
  notes: '',
};

export default function ClientFunnel() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initialState);
  const [loading, setLoading] = useState(false);

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const toggleNeed = (value) => {
    setForm((prev) => ({
      ...prev,
      needs: prev.needs.includes(value) ? prev.needs.filter((item) => item !== value) : [...prev.needs, value],
    }));
  };

  const next = () => setStep((prev) => Math.min(prev + 1, STEPS.length - 1));
  const back = () => setStep((prev) => Math.max(prev - 1, 0));

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await submitClientFunnel(form);
      toast.success('Your onboarding request is ready.');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Your request could not be saved.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.badge}>SouthSwift Client Journey</div>
          <h1 style={styles.title}>Start your secure renting or selling experience</h1>
          <p style={styles.subtitle}>A guided onboarding flow with a clear next step for every lead.</p>
        </div>

        <div style={styles.progressRow}>
          {STEPS.map((item, index) => (
            <div key={item.key} style={{ ...styles.progressStep, ...(index === step ? styles.progressStepActive : {}) }}>
              <div style={styles.progressNumber}>{index + 1}</div>
              <div>
                <div style={styles.progressTitle}>{item.title}</div>
                <div style={styles.progressSubtitle}>{item.subtitle}</div>
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={submit} style={styles.form}>
          {step === 0 && (
            <div style={styles.grid}>
              <label style={styles.field}>
                <span style={styles.label}>I am a</span>
                <select value={form.role} onChange={(e) => update('role', e.target.value)} style={styles.input}>
                  <option value="tenant">Tenant</option>
                  <option value="agent">Agent</option>
                  <option value="landlord">Landlord</option>
                </select>
              </label>
              <label style={styles.field}>
                <span style={styles.label}>Goal</span>
                <select value={form.propertyType} onChange={(e) => update('propertyType', e.target.value)} style={styles.input}>
                  <option value="rent">Rent a property</option>
                  <option value="buy">Buy a property</option>
                </select>
              </label>
              <label style={styles.field}>
                <span style={styles.label}>Budget</span>
                <input value={form.budget} onChange={(e) => update('budget', e.target.value)} style={styles.input} placeholder="e.g. 1500000" />
              </label>
              <label style={styles.field}>
                <span style={styles.label}>Move-in timing</span>
                <select value={form.moveInTiming} onChange={(e) => update('moveInTiming', e.target.value)} style={styles.input}>
                  <option value="within-30-days">Within 30 days</option>
                  <option value="within-90-days">Within 90 days</option>
                  <option value="next-quarter">Next quarter</option>
                </select>
              </label>
            </div>
          )}

          {step === 1 && (
            <div style={styles.grid}>
              <label style={styles.field}>
                <span style={styles.label}>Full name</span>
                <input value={form.fullName} onChange={(e) => update('fullName', e.target.value)} style={styles.input} placeholder="Ada Okafor" required />
              </label>
              <label style={styles.field}>
                <span style={styles.label}>Email</span>
                <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} style={styles.input} placeholder="ada@example.com" required />
              </label>
              <label style={styles.field}>
                <span style={styles.label}>Phone</span>
                <input value={form.phone} onChange={(e) => update('phone', e.target.value)} style={styles.input} placeholder="+2348000000000" required />
              </label>
              <label style={styles.field}>
                <span style={styles.label}>City</span>
                <input value={form.city} onChange={(e) => update('city', e.target.value)} style={styles.input} placeholder="Lagos" required />
              </label>
              <label style={styles.field}>
                <span style={styles.label}>State</span>
                <input value={form.state} onChange={(e) => update('state', e.target.value)} style={styles.input} placeholder="Lagos State" />
              </label>
            </div>
          )}

          {step === 2 && (
            <div>
              <div style={styles.needGrid}>
                {NEED_OPTIONS.map((need) => (
                  <button
                    key={need}
                    type="button"
                    onClick={() => toggleNeed(need)}
                    style={{ ...styles.needChip, ...(form.needs.includes(need) ? styles.needChipActive : {}) }}
                  >
                    {need.replace(/-/g, ' ')}
                  </button>
                ))}
              </div>
              <label style={styles.field}>
                <span style={styles.label}>Anything else we should know?</span>
                <textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} style={styles.textarea} rows={5} placeholder="Preferred areas, move-in date, or questions" />
              </label>
            </div>
          )}

          <div style={styles.actions}>
            <button type="button" onClick={back} style={styles.secondaryBtn} disabled={step === 0}>Back</button>
            {step < STEPS.length - 1 ? (
              <button type="button" onClick={next} style={styles.primaryBtn}>Continue</button>
            ) : (
              <button type="submit" style={styles.primaryBtn} disabled={loading}>{loading ? 'Submitting...' : 'Finish onboarding'}</button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: 'linear-gradient(135deg, #f5f6f2 0%, #eef6ef 100%)', padding: '48px 20px' },
  card: { maxWidth: 980, margin: '0 auto', background: 'white', borderRadius: 24, padding: 32, boxShadow: '0 20px 55px rgba(0,0,0,0.08)' },
  header: { marginBottom: 24 },
  badge: { display: 'inline-block', background: '#eaf6ea', color: '#1b4332', padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' },
  title: { fontSize: 32, fontWeight: 900, color: '#111', margin: '10px 0 8px' },
  subtitle: { color: '#666', fontSize: 15, margin: 0 },
  progressRow: { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: 24 },
  progressStep: { display: 'flex', gap: 10, alignItems: 'center', border: '1px solid #e6e8e2', borderRadius: 14, padding: 12 },
  progressStepActive: { borderColor: '#1b4332', background: '#f4fbf5' },
  progressNumber: { width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1b4332', color: 'white', fontWeight: 700 },
  progressTitle: { fontWeight: 700, color: '#111' },
  progressSubtitle: { fontSize: 12, color: '#666' },
  form: { display: 'flex', flexDirection: 'column', gap: 20 },
  grid: { display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' },
  field: { display: 'flex', flexDirection: 'column', gap: 8 },
  label: { fontSize: 13, fontWeight: 700, color: '#333' },
  input: { border: '1px solid #dfe3de', borderRadius: 10, padding: '12px 14px', fontSize: 14 },
  textarea: { border: '1px solid #dfe3de', borderRadius: 10, padding: '12px 14px', fontSize: 14, resize: 'vertical' },
  needGrid: { display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  needChip: { border: '1px solid #dfe3de', background: '#fff', padding: '10px 14px', borderRadius: 999, cursor: 'pointer', textTransform: 'capitalize' },
  needChipActive: { background: '#1b4332', color: 'white', borderColor: '#1b4332' },
  actions: { display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 8 },
  primaryBtn: { background: '#c8963c', color: 'white', border: 'none', borderRadius: 10, padding: '12px 18px', fontWeight: 700, cursor: 'pointer' },
  secondaryBtn: { background: '#f3f5f2', color: '#222', border: 'none', borderRadius: 10, padding: '12px 18px', fontWeight: 700, cursor: 'pointer' },
};
