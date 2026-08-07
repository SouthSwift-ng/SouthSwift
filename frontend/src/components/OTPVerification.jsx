import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { verifyOTP, resendOTP } from '../utils/api';
import { Shield, Mail, Timer } from 'lucide-react';

const G = '#1B4332'; 
const GOLD = '#C8963C';

export default function OTPVerification({ email, onVerified, onBack }) {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300); // 300 seconds = 5 minutes cooldown

  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [timeLeft]);

  const handleOtpChange = (index, value) => {
    if (value.length > 1) return; // Only single digits
    
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      const nextInput = document.getElementById(`otp-${index + 1}`);
      if (nextInput) nextInput.focus();
    }

    // Auto-submit when all fields are filled
    if (newOtp.every(digit => digit !== '') && newOtp.join('').length === 6) {
      handleVerify(newOtp.join(''));
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      const prevInput = document.getElementById(`otp-${index - 1}`);
      if (prevInput) prevInput.focus();
    }
  };

  const handleVerify = async (otpCode = otp.join('')) => {
    if (otpCode.length !== 6) {
      toast.error('Please enter all 6 digits');
      return;
    }

    setLoading(true);
    try {
      const res = await verifyOTP({ email, otp_code: otpCode });
      toast.success('Email verified! Welcome to SouthSwift! ');
      onVerified(res.data.user, res.data.token);
    } catch (err) {
      if (err.response?.data?.error?.includes('expired')) {
        toast.error('Code expired. Please request a new one.');
      } else if (err.response?.data?.error?.includes('Invalid')) {
        toast.error('Invalid code. Please try again.');
        // Clear the OTP inputs
        setOtp(['', '', '', '', '', '']);
        document.getElementById('otp-0')?.focus();
      } else {
        toast.error(err.response?.data?.error || 'Verification failed');
      }
    }
    setLoading(false);
  };

  const handleResend = async () => {
    if (timeLeft > 0) return;
    
    setResendLoading(true);
    try {
      await resendOTP({ email });
      toast.success('New verification code sent!');
      setTimeLeft(300); // Reset to 5 minutes cooldown
      setOtp(['', '', '', '', '', '']); // Clear current OTP
      document.getElementById('otp-0')?.focus();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to resend code');
    }
    setResendLoading(false);
  };

  return (
    <div style={s.container}>
      <div style={s.card}>
        <div style={s.header}>
          <div style={s.logo}>
            <Shield size={28} color={GOLD} />
            <span style={s.logoText}>South<span style={{color:GOLD}}>Swift</span></span>
          </div>
          <div style={s.iconContainer}>
            <Mail size={48} color={G} />
          </div>
          <h2 style={s.title}>Verify your email</h2>
          <p style={s.subtitle}>
            We sent a 6-digit code to <strong>{email}</strong>
          </p>
        </div>

        <div style={s.content}>
          <div style={s.otpContainer}>
            {otp.map((digit, index) => (
              <input
                key={index}
                id={`otp-${index}`}
                type="text"
                inputMode="numeric"
                pattern="[0-9]"
                maxLength="1"
                value={digit}
                onChange={(e) => handleOtpChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                style={{
                  ...s.otpInput,
                  borderColor: digit ? G : '#DDD',
                  backgroundColor: digit ? '#F8FAF8' : 'white'
                }}
                disabled={loading}
                autoFocus={index === 0}
              />
            ))}
          </div>

          <div style={s.actions}>
            <button 
              onClick={() => handleVerify()}
              disabled={loading || otp.some(digit => !digit)}
              style={{
                ...s.verifyBtn,
                opacity: (loading || otp.some(digit => !digit)) ? 0.5 : 1
              }}
            >
              {loading ? 'Verifying...' : 'Verify Email'}
            </button>

            <div style={s.resendSection}>
              <p style={s.resendText}>Didn't receive the code?</p>
              {timeLeft > 0 ? (
                <div style={s.cooldown}>
                  <span>Resend in 0{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</span>
                </div>
              ) : (
                <button
                  onClick={handleResend}
                  disabled={resendLoading}
                  style={s.resendBtn}
                >
                  {resendLoading ? 'Sending...' : 'Resend Code'}
                </button>
              )}
            </div>

            <button onClick={onBack} style={s.backBtn}>
              ← Back to Registration
            </button>
          </div>
        </div>

     
      </div>
    </div>
  );
}

const s = {
  container: {
    minHeight: '90vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    background: '#F8FAF8'
  },
  card: {
    background: 'white',
    borderRadius: 16,
    padding: 0,
    width: '100%',
    maxWidth: 480,
    boxShadow: '0 4px 30px rgba(0,0,0,0.1)',
    border: '1px solid #F0F0F0',
    overflow: 'hidden'
  },
  header: {
    padding: '40px 36px 20px',
    textAlign: 'center',
    background: 'linear-gradient(135deg, #F8FAF8 0%, #E8F5E8 100%)',
    borderBottom: '1px solid #E5E7EB'
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 20
  },
  logoText: {
    fontSize: 20,
    fontWeight: 900,
    color: G,
    fontFamily: 'Georgia,serif'
  },
  iconContainer: {
    marginBottom: 16
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: G,
    margin: '0 0 8px',
    fontFamily: 'Georgia,serif'
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    margin: 0,
    lineHeight: 1.5
  },
  content: {
    padding: '30px 36px'
  },
  otpContainer: {
    display: 'flex',
    gap: 12,
    justifyContent: 'center',
    marginBottom: 30
  },
  otpInput: {
    width: 50,
    height: 56,
    border: '2px solid #DDD',
    borderRadius: 12,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 700,
    outline: 'none',
    transition: 'all 0.2s ease',
    fontFamily: 'Courier New, monospace'
  },
  actions: {
    textAlign: 'center'
  },
  verifyBtn: {
    width: '100%',
    background: G,
    color: 'white',
    border: 'none',
    padding: '14px',
    borderRadius: 10,
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 15,
    marginBottom: 20,
    transition: 'opacity 0.2s ease'
  },
  resendSection: {
    marginBottom: 20
  },
  resendText: {
    fontSize: 13,
    color: '#666',
    margin: '0 0 8px'
  },
  cooldown: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    fontSize: 13,
    color: '#666'
  },
  resendBtn: {
    background: 'none',
    border: 'none',
    color: G,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 14,
    textDecoration: 'underline'
  },
  backBtn: {
    background: 'none',
    border: '1px solid #DDD',
    color: '#666',
    padding: '10px 20px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500
  },
  footer: {
    padding: '0 36px 30px',
    textAlign: 'center'
  },
  securityNote: {
    background: '#EFF6FF',
    border: '1px solid #DBEAFE',
    borderRadius: 8,
    padding: 12,
    fontSize: 12,
    color: '#1E40AF',
    lineHeight: 1.4
  }
};