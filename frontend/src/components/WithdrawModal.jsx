import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  getReferralBanks,
  resolveReferralAccount,
  requestWithdrawalOtp,
  confirmWithdrawal,
} from '../utils/api';
import { formatNaira } from '../utils/format';
import BankSearchSelect from './BankSearchSelect';
import { X, Shield, CheckCircle } from 'lucide-react';

const G = '#1B4332';
const GOLD = '#C8963C';

export default function WithdrawModal({ open, onClose, summary, onSuccess }) {
  const [step, setStep] = useState('form');
  const [banks, setBanks] = useState([]);
  const [form, setForm] = useState({ bank_code: '', bank_name: '', account_number: '', account_name: '' });
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState('');
  const [loading, setLoading] = useState(false);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [maskedEmail, setMaskedEmail] = useState('');
  const [amount, setAmount] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const accountInputRef = useRef(null);

  // Reset every time the modal opens.
  useEffect(() => {
    if (!open) return;
    setStep('form');
    setForm({ bank_code: '', bank_name: '', account_number: '', account_name: '' });
    setOtp(['', '', '', '', '', '']);
    setResolveError('');
    setMaskedEmail('');
    setAmount(0);
    setCooldown(0);
    getReferralBanks().then(r => setBanks(r.data)).catch(() => toast.error('Could not load banks.'));
  }, [open]);

  useEffect(() => {
    if (!cooldown) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Resolve the account name once bank + 10-digit number are available.
  useEffect(() => {
    if (!open || step !== 'form') return;
    if (!/^\d{10}$/.test(form.account_number) || !form.bank_code) {
      setResolving(false);
      setResolveError('');
      return;
    }
    let cancelled = false;
    setResolving(true);
    setResolveError('');
    const t = setTimeout(async () => {
      try {
        const r = await resolveReferralAccount(form.account_number, form.bank_code);
        if (cancelled) return;
        setForm(f => ({ ...f, account_name: r.data.account_name }));
      } catch (err) {
        if (cancelled) return;
        setResolveError(err.response?.data?.error || 'Could not resolve account.');
        setForm(f => ({ ...f, account_name: '' }));
      } finally {
        if (!cancelled) setResolving(false);
      }
    }, 600);
    return () => { cancelled = true; clearTimeout(t); };
  }, [form.account_number, form.bank_code, open, step]);

  if (!open) return null;

  const balance = summary?.balance || 0;
  const minWithdrawal = summary?.min_withdrawal || 1000;
  const pending = summary?.pending_withdrawal;

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    if (!form.bank_code || !/^\d{10}$/.test(form.account_number) || !form.account_name) {
      toast.error('Select your bank and enter a valid 10-digit account number.');
      return;
    }
    setLoading(true);
    try {
      const bank = banks.find(b => b.code === form.bank_code);
      const r = await requestWithdrawalOtp({
        account_number: form.account_number,
        bank_code: form.bank_code,
        bank_name: bank?.name || '',
      });
      setAmount(r.data.amount);
      setMaskedEmail(r.data.masked_email || '');
      setCooldown(r.data.resend_after || 300);
      setStep('otp');
      toast.success('Verification code sent to your email.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not send verification code.');
    }
    setLoading(false);
  };

  const handleOtpChange = (index, value) => {
    if (!/^\d?$/.test(value)) return;
    const next = [...otp];
    next[index] = value;
    setOtp(next);
    if (value && index < 5) document.getElementById(`wd-otp-${index + 1}`)?.focus();
    if (next.every(d => d)) handleConfirm(next.join(''));
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      document.getElementById(`wd-otp-${index - 1}`)?.focus();
    }
  };

  const handleConfirm = async (code = otp.join('')) => {
    if (code.length !== 6) { toast.error('Enter all 6 digits.'); return; }
    setLoading(true);
    try {
      const r = await confirmWithdrawal(code);
      setAmount(r.data.withdrawal?.amount || amount);
      setStep('success');
      toast.success('Withdrawal request sent to admin.');
      onSuccess?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Verification failed.');
      setOtp(['', '', '', '', '', '']);
      document.getElementById('wd-otp-0')?.focus();
    }
    setLoading(false);
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setLoading(true);
    try {
      const bank = banks.find(b => b.code === form.bank_code);
      const r = await requestWithdrawalOtp({
        account_number: form.account_number,
        bank_code: form.bank_code,
        bank_name: bank?.name || '',
      });
      setCooldown(r.data.resend_after || 300);
      setOtp(['', '', '', '', '', '']);
      toast.success('New verification code sent.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not resend code.');
    }
    setLoading(false);
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.card} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Withdraw referral balance">
        <button onClick={onClose} aria-label="Close" style={s.close}><X size={16} /></button>

        <div style={s.header}>
          <div style={s.iconWrap}><Shield size={24} color={GOLD} /></div>
          <h3 style={s.title}>
            {step === 'success' ? 'Request sent' : 'Withdraw referral balance'}
          </h3>
          {step === 'form' && (
            <p style={s.sub}>
              Available balance: <strong style={{ color: G }}>₦{formatNaira(balance)}</strong>
            </p>
          )}
          {step === 'otp' && (
            <p style={s.sub}>
              Enter the 6-digit code sent to <strong>{maskedEmail || 'your email'}</strong>
            </p>
          )}
        </div>

        {step === 'form' && (
          <form onSubmit={handleRequestOtp} style={s.body}>
            {pending && (
              <div style={s.notice}>
                You already have a {pending.status} withdrawal of ₦{formatNaira(pending.amount)}.
                Please wait for it to be processed.
              </div>
            )}
            <div style={s.amountBox}>
              <span style={s.amountLabel}>You will withdraw</span>
              <span style={s.amountValue}>₦{formatNaira(balance)}</span>
              <span style={s.amountHint}>The full available balance is withdrawn.</span>
            </div>

            <label style={s.label}>Bank</label>
            <BankSearchSelect
              banks={banks}
              value={form.bank_code}
              loading={!banks.length}
              inputStyle={s.input}
              onChange={bank => {
                setForm(f => ({
                  ...f,
                  bank_code: bank?.code || '',
                  bank_name: bank?.name || '',
                  account_name: '',
                }));
                if (bank) setTimeout(() => accountInputRef.current?.focus(), 0);
              }}
            />

            <label style={s.label}>Account number</label>
            <input
              ref={accountInputRef}
              style={s.input}
              inputMode="numeric"
              maxLength={10}
              placeholder="10-digit account number"
              value={form.account_number}
              onChange={e => setForm(f => ({ ...f, account_number: e.target.value.replace(/\D/g, ''), account_name: '' }))}
            />

            <label style={s.label}>Account name</label>
            <input
              style={{ ...s.input, background: '#F8FAF8', color: form.account_name ? G : '#888' }}
              value={resolving ? 'Looking up account…' : form.account_name}
              readOnly
              placeholder="Auto-filled from your bank"
            />
            {resolveError && <p style={s.error}>{resolveError}</p>}

            <button
              type="submit"
              style={{ ...s.primary, opacity: (loading || balance < minWithdrawal || pending) ? 0.6 : 1 }}
              disabled={loading || balance < minWithdrawal || !!pending}
            >
              {loading ? 'Sending code…' : 'Send verification code'}
            </button>
            <p style={s.hint}>Minimum withdrawal is ₦{formatNaira(minWithdrawal)}.</p>
          </form>
        )}

        {step === 'otp' && (
          <div style={s.body}>
            <div style={s.amountBox}>
              <span style={s.amountLabel}>Withdrawal amount</span>
              <span style={s.amountValue}>₦{formatNaira(amount)}</span>
            </div>
            <div style={s.otpRow}>
              {otp.map((digit, i) => (
                <input
                  key={i}
                  id={`wd-otp-${i}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => handleOtpChange(i, e.target.value)}
                  onKeyDown={e => handleKeyDown(i, e)}
                  style={{ ...s.otpInput, borderColor: digit ? G : '#DDD' }}
                  disabled={loading}
                  autoFocus={i === 0}
                />
              ))}
            </div>
            <button
              style={{ ...s.primary, opacity: (loading || otp.some(d => !d)) ? 0.6 : 1 }}
              disabled={loading || otp.some(d => !d)}
              onClick={() => handleConfirm()}
            >
              {loading ? 'Confirming…' : 'Confirm withdrawal'}
            </button>
            <div style={s.resendRow}>
              {cooldown > 0
                ? <span style={s.hint}>Resend code in 0{Math.floor(cooldown / 60)}:{(cooldown % 60).toString().padStart(2, '0')}</span>
                : <button type="button" onClick={handleResend} style={s.linkBtn} disabled={loading}>Resend code</button>}
              <button type="button" onClick={() => setStep('form')} style={s.linkBtn}>Change account</button>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div style={{ ...s.body, textAlign: 'center' }}>
            <CheckCircle size={52} color="#22C55E" style={{ margin: '0 auto 12px' }} />
            <p style={s.successText}>
              Your request for <strong>₦{formatNaira(amount)}</strong> has been sent to the SouthSwift team.
            </p>
            <p style={s.hint}>You will receive an email once it is approved and paid.</p>
            <button style={s.primary} onClick={onClose}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1100,
             display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card:    { background: 'white', borderRadius: 16, width: '100%', maxWidth: 440, position: 'relative',
             boxShadow: '0 20px 60px rgba(0,0,0,0.25)', maxHeight: '92vh', overflowY: 'auto' },
  close:   { position: 'absolute', top: 12, right: 12, width: 30, height: 30, borderRadius: '50%',
             border: 'none', background: '#F3F4F6', color: '#6B7280', cursor: 'pointer',
             display: 'flex', alignItems: 'center', justifyContent: 'center' },
  header:  { padding: '28px 28px 0', textAlign: 'center' },
  iconWrap:{ width: 52, height: 52, borderRadius: '50%', background: '#F0F9F0', border: '1px solid #BBF7D0',
             display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' },
  title:   { fontSize: 20, fontWeight: 800, color: '#111', margin: '0 0 6px' },
  sub:     { fontSize: 13, color: '#666', margin: 0, lineHeight: 1.5 },
  body:    { padding: '22px 28px 28px' },
  label:   { display: 'block', fontSize: 12, fontWeight: 700, color: '#444', margin: '14px 0 5px' },
  input:   { width: '100%', border: '1px solid #DDD', borderRadius: 8, padding: '10px 12px',
             fontSize: 14, boxSizing: 'border-box', outline: 'none', fontFamily: 'Arial' },
  amountBox:{ background: '#F8FAF8', border: '1px solid #E5E7EB', borderRadius: 10, padding: '14px 16px',
              display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 4 },
  amountLabel:{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 },
  amountValue:{ fontSize: 26, fontWeight: 900, color: G },
  amountHint:{ fontSize: 11, color: '#888' },
  notice:  { background: '#FEF3C7', border: '1px solid #FDE68A', color: '#92400E', fontSize: 12,
             lineHeight: 1.6, borderRadius: 8, padding: '10px 12px', marginBottom: 14 },
  primary: { width: '100%', background: G, color: 'white', border: 'none', padding: '13px',
             borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14, marginTop: 18 },
  hint:    { fontSize: 11, color: '#888', textAlign: 'center', margin: '10px 0 0' },
  error:   { fontSize: 11, color: '#DC2626', margin: '6px 0 0' },
  otpRow:  { display: 'flex', gap: 8, justifyContent: 'center', margin: '20px 0 6px' },
  otpInput:{ width: 46, height: 54, border: '2px solid #DDD', borderRadius: 10, textAlign: 'center',
             fontSize: 20, fontWeight: 800, outline: 'none', fontFamily: 'Courier New,monospace' },
  resendRow:{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  linkBtn: { background: 'none', border: 'none', color: G, fontWeight: 700, fontSize: 12, cursor: 'pointer', padding: 0 },
  successText:{ fontSize: 14, color: '#333', lineHeight: 1.7, margin: '0 0 4px' },
};
