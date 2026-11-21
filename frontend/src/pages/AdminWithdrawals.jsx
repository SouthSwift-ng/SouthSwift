import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { getWithdrawalRequests, reviewWithdrawal } from '../utils/api';
import { formatNaira } from '../utils/format';
import { Wallet, RefreshCw } from 'lucide-react';

const G = '#1B4332';
const GOLD = '#C8963C';
const FILTERS = ['pending', 'approved', 'paid', 'rejected', 'all'];

const badge = {
  pending:  { background: '#FEF3C7', color: '#92400E' },
  approved: { background: '#DBEAFE', color: '#1E40AF' },
  paid:     { background: '#DCFCE7', color: '#166534' },
  rejected: { background: '#FEE2E2', color: '#DC2626' },
};

export default function AdminWithdrawals() {
  const [filter, setFilter] = useState('pending');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState({});
  const [busyId, setBusyId] = useState(null);

  const load = (status = filter) => {
    setLoading(true);
    getWithdrawalRequests(status === 'all' ? undefined : status)
      .then(r => setRows(r.data))
      .catch(() => toast.error('Could not load withdrawals.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(filter); }, [filter]);

  const act = async (row, action) => {
    if (action === 'reject' && !(notes[row.id] || '').trim()) {
      toast.error('Add a short reason before rejecting.');
      return;
    }
    setBusyId(row.id);
    try {
      await reviewWithdrawal(row.id, { action, note: (notes[row.id] || '').trim() || undefined });
      toast.success(
        action === 'approve' ? 'Withdrawal approved.'
          : action === 'mark_paid' ? 'Marked as paid.'
          : 'Withdrawal rejected.'
      );
      setNotes(n => ({ ...n, [row.id]: '' }));
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Action failed.');
    }
    setBusyId(null);
  };

  return (
    <div>
      <div style={s.head}>
        <div>
          <h3 style={s.title}>Referral Withdrawals</h3>
          <p style={s.sub}>
            Approve requests after verifying the account, then mark them paid once the transfer is sent.
          </p>
        </div>
        <button onClick={() => load()} style={s.refresh} title="Refresh">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div style={s.filters}>
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{ ...s.filter, ...(filter === f ? s.filterActive : {}) }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={s.muted}>Loading withdrawals…</p>
      ) : rows.length === 0 ? (
        <div style={s.empty}>
          <Wallet size={40} color="#DDD" />
          <p>No {filter === 'all' ? '' : filter} withdrawal requests.</p>
        </div>
      ) : (
        <div style={s.list}>
          {rows.map(w => (
            <div key={w.id} style={s.row}>
              <div style={s.rowMain}>
                <div style={s.rowTop}>
                  <div>
                    <div style={s.name}>{w.full_name}</div>
                    <div style={s.detail}>{w.email}{w.phone ? ` · ${w.phone}` : ''}</div>
                  </div>
                  <div style={{ ...s.badge, ...(badge[w.status] || {}) }}>{w.status}</div>
                </div>

                <div style={s.accountBox}>
                  <div style={s.amount}>₦{formatNaira(w.amount)}</div>
                  <div style={s.detail}>
                    {w.account_name} · {w.bank_name || 'Bank'} · {w.account_number}
                  </div>
                  <div style={s.meta}>
                    Requested {new Date(w.requested_at).toLocaleString('en-NG')}
                    {w.paid_at ? ` · Paid ${new Date(w.paid_at).toLocaleString('en-NG')}` : ''}
                  </div>
                </div>

                {w.admin_note && <div style={s.note}>Admin note: {w.admin_note}</div>}

                {['pending', 'approved'].includes(w.status) && (
                  <div style={s.actions}>
                    <input
                      style={s.noteInput}
                      placeholder={w.status === 'approved' ? 'Payment reference / optional note' : 'Note (required to reject)'}
                      value={notes[w.id] || ''}
                      onChange={e => setNotes(n => ({ ...n, [w.id]: e.target.value }))}
                    />
                    {w.status === 'pending' && (
                      <button
                        style={{ ...s.approve, opacity: busyId === w.id ? 0.6 : 1 }}
                        disabled={busyId === w.id}
                        onClick={() => act(w, 'approve')}
                      >
                        Approve
                      </button>
                    )}
                    {w.status === 'approved' && (
                      <button
                        style={{ ...s.paid, opacity: busyId === w.id ? 0.6 : 1 }}
                        disabled={busyId === w.id}
                        onClick={() => act(w, 'mark_paid')}
                      >
                        Mark paid
                      </button>
                    )}
                    <button
                      style={{ ...s.reject, opacity: busyId === w.id ? 0.6 : 1 }}
                      disabled={busyId === w.id}
                      onClick={() => act(w, 'reject')}
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const s = {
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 },
  title: { margin: 0, color: G, fontSize: 18 },
  sub: { margin: '4px 0 0', color: '#888', fontSize: 12.5, lineHeight: 1.6, maxWidth: 560 },
  refresh: { display: 'flex', alignItems: 'center', gap: 6, background: 'white', border: '1px solid #E5E7EB',
             color: G, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12 },
  filters: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 },
  filter: { background: 'white', border: '1px solid #E5E7EB', color: '#666', padding: '7px 14px',
            borderRadius: 20, cursor: 'pointer', fontWeight: 700, fontSize: 12 },
  filterActive: { background: G, borderColor: G, color: 'white' },
  muted: { color: '#888', fontSize: 13 },
  empty: { textAlign: 'center', padding: '40px 20px', color: '#888', display: 'flex',
           flexDirection: 'column', alignItems: 'center', gap: 8, fontSize: 13 },
  list: { display: 'flex', flexDirection: 'column', gap: 12 },
  row: { background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: '16px 18px' },
  rowMain: { display: 'flex', flexDirection: 'column', gap: 10 },
  rowTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  name: { fontSize: 14, fontWeight: 800, color: '#111' },
  detail: { fontSize: 12, color: '#666', marginTop: 2 },
  meta: { fontSize: 11, color: '#9CA3AF', marginTop: 4 },
  badge: { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.6,
           padding: '4px 9px', borderRadius: 20 },
  accountBox: { background: '#F9FAFB', border: '1px solid #F3F4F6', borderRadius: 8, padding: '10px 12px' },
  amount: { fontSize: 20, fontWeight: 900, color: G },
  note: { fontSize: 12, color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A',
          borderRadius: 8, padding: '8px 10px' },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  noteInput: { flex: '1 1 220px', border: '1px solid #DDD', borderRadius: 8, padding: '8px 10px',
               fontSize: 12.5, outline: 'none', fontFamily: 'Arial' },
  approve: { background: '#DBEAFE', color: '#1E40AF', border: '1px solid #BFDBFE', padding: '8px 14px',
             borderRadius: 8, cursor: 'pointer', fontWeight: 800, fontSize: 12 },
  paid: { background: '#DCFCE7', color: '#166534', border: '1px solid #BBF7D0', padding: '8px 14px',
          borderRadius: 8, cursor: 'pointer', fontWeight: 800, fontSize: 12 },
  reject: { background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA', padding: '8px 14px',
            borderRadius: 8, cursor: 'pointer', fontWeight: 800, fontSize: 12 },
};
