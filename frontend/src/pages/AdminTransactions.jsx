import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { getTransactions, getTransaction, reviewTransaction } from '../utils/api';
import { CheckCircle, XCircle, Clock, FileText } from 'lucide-react';

const G = '#1B4332';
const GOLD = '#C8963C';

const STATUS_META = {
  pending_review: { label: 'Pending Review', color: '#92400E', bg: '#FEF3C7' },
  approved:       { label: 'Approved',       color: '#166534', bg: '#DCFCE7' },
  rejected:       { label: 'Rejected',       color: '#DC2626', bg: '#FEE2E2' },
  cancelled:      { label: 'Cancelled',      color: '#6B7280', bg: '#F3F4F6' },
};

const TYPE_META = {
  inspection: { label: 'Inspection', color: '#7C3AED', bg: '#EDE9FE' },
  rent:       { label: 'Rent',       color: '#0891B2', bg: '#ECFEFF' },
};

const ACTION_LABEL = {
  created:        'Proof submitted',
  approved:       'Approved',
  rejected:       'Rejected',
  receipt_sent:   'Receipt emailed',
  note:           'Note',
  cancelled:      'Cancelled',
};

export default function AdminTransactions() {
  const [filter, setFilter] = useState('pending_review');
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [note, setNote] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchList = () => {
    setLoading(true);
    getTransactions(filter || undefined)
      .then(r => setList(r.data))
      .catch(() => toast.error('Failed to load transactions.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchList(); /* eslint-disable-next-line */ }, [filter]);

  const openDetail = async (txn) => {
    setSelected(txn);
    setNote('');
    setDetail(null);
    setDetailLoading(true);
    try {
      const r = await getTransaction(txn.id);
      setDetail(r.data);
    } catch {
      toast.error('Failed to load transaction detail.');
      setDetail({ transaction: txn, audit: [] });
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => { setSelected(null); setDetail(null); };

  const handleReview = async (action, release_listing = false) => {
    if (!detail || reviewing) return;
    // Inspection rejections never release (backend ignores the flag) — force it
    // off so the toast can't promise a release that won't happen.
    const isInspection = (detail.transaction.payment_type || 'rent') === 'inspection';
    if (isInspection) release_listing = false;
    setReviewing(true);
    toast.loading(action === 'approve' ? 'Processing approval…' : 'Processing rejection…');
    try {
      await reviewTransaction(detail.transaction.id, { action, note, release_listing });
      toast.dismiss();
      toast.success(
        action === 'approve'
          ? (isInspection ? 'Inspection approved — unit held 24h.' : 'Approved — escrow secured. 🛡️')
          : release_listing ? 'Rejected — listing released.'
          : (isInspection ? 'Inspection proof rejected.' : 'Rejected — reservation kept.'));
      closeDetail();
      fetchList();
    } catch (e) {
      toast.dismiss();
      toast.error(e.response?.data?.error || 'Failed to review transaction.');
    } finally {
      setReviewing(false);
    }
  };

  const tabs = [
    { key: 'pending_review', label: 'Pending' },
    { key: '', label: 'All' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
  ];

  const formatDateTime = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-NG', {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  };

  return (
    <div style={{ fontFamily: 'Arial,sans-serif', minHeight: '80vh', background: '#F8FAF8', padding: '28px 20px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111', margin: '0 0 4px' }}>Transfer Reviews</h1>
        <p style={{ color: '#888', fontSize: 13, margin: '0 0 20px' }}>
          Manual bank transfers awaiting confirmation. Approve to secure escrow and email a receipt.
        </p>

        <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setFilter(t.key)}
              style={{ background: filter === t.key ? G : 'white', color: filter === t.key ? 'white' : '#666',
                border: `1px solid ${filter === t.key ? G : '#DDD'}`, padding: '8px 18px',
                borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: G }}>Loading…</div>
        ) : list.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#888' }}>No transactions found.</div>
        ) : (
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
             {list.map(t => {
               const meta = STATUS_META[t.status] || STATUS_META.pending_review;
               const expectedAmt = t.payment_type === 'inspection'
                 ? Number(t.inspection_fee || 0)
                 : Number(t.total_paid || 0);
               return (
                 <div key={t.id} onClick={() => openDetail(t)}
                   style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px',
                     borderBottom: '1px solid #F3F4F6', cursor: 'pointer' }}>
                   <div style={{ flex: 1 }}>
                     <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                       <div style={{ fontWeight: 700, fontSize: 14, color: '#111' }}>{t.reference}</div>
                       <span style={{ background: TYPE_META[t.payment_type]?.bg || TYPE_META.rent.bg,
                         color: TYPE_META[t.payment_type]?.color || TYPE_META.rent.color,
                         padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 800 }}>
                         {TYPE_META[t.payment_type]?.label || t.payment_type || 'Rent'}
                       </span>
                     </div>
                     <div style={{ fontSize: 12, color: '#888' }}>
                       {t.listing_title} · {t.city ? t.city + ', ' + t.state : ''} · {t.tenant_name}
                     </div>
                   </div>
                   <div style={{ textAlign: 'right' }}>
                     <div style={{ fontWeight: 700, fontSize: 13, color: '#111' }}>
                       ₦{Number(t.amount_naira || 0).toLocaleString()}
                     </div>
                     <div style={{ fontSize: 11, color: '#999' }}>
                       of ₦{expectedAmt.toLocaleString()} · {formatDateTime(t.created_at)}
                     </div>
                   </div>
                   <span style={{ background: meta.bg, color: meta.color, padding: '4px 10px',
                     borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                     {meta.label}
                   </span>
                 </div>
               );
             })}
          </div>
        )}
      </div>

      {selected && (
        <div onClick={closeDetail}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 500 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'white', borderRadius: 14, maxWidth: 560, width: '100%',
              maxHeight: '90vh', overflowY: 'auto', padding: 24 }}>
            {detailLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: G }}>Loading transaction…</div>
            ) : detail ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 800, color: '#111', margin: 0 }}>{detail.transaction.reference}</h2>
                  <button onClick={closeDetail} style={{ background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>×</button>
                </div>

                <div style={{ fontSize: 13, color: '#555', lineHeight: 1.8, marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <b>Listing:</b> {detail.transaction.listing_title}
                    <span style={{ background: TYPE_META[detail.transaction.payment_type]?.bg || TYPE_META.rent.bg,
                      color: TYPE_META[detail.transaction.payment_type]?.color || TYPE_META.rent.color,
                      padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 800 }}>
                      {TYPE_META[detail.transaction.payment_type]?.label || detail.transaction.payment_type || 'Rent'}
                    </span>
                  </div>
                  <div><b>Tenant:</b> {detail.transaction.tenant_name} ({detail.transaction.tenant_email})</div>
                  <div><b>Deal ID:</b> {detail.transaction.deal_id} · <b>Deal status:</b> {detail.transaction.deal_status}</div>
                  <div><b>Payment type:</b> {detail.transaction.payment_type === 'inspection' ? 'Inspection fee (₦' + Number(detail.transaction.inspection_fee || 0).toLocaleString() + ')' : 'Rent (₦' + Number(detail.transaction.total_paid || 0).toLocaleString() + ')'}</div>
                  <div><b>Amount sent:</b> ₦{Number(detail.transaction.amount_naira || 0).toLocaleString()} <span style={{ color:'#999' }}>(expected ₦{(detail.transaction.payment_type === 'inspection' ? Number(detail.transaction.inspection_fee || 0) : Number(detail.transaction.total_paid || 0)).toLocaleString()})</span></div>
                  {detail.transaction.payer_bank && <div><b>From bank:</b> {detail.transaction.payer_bank}</div>}
                  {detail.transaction.transfer_reference && <div><b>Transfer ref:</b> {detail.transaction.transfer_reference}</div>}
                  <div><b>Submitted:</b> {formatDateTime(detail.transaction.created_at)}</div>
                  {detail.transaction.transfer_date && <div><b>Transfer date:</b> {new Date(detail.transaction.transfer_date).toLocaleString('en-NG')}</div>}
                  {detail.transaction.payment_mode && <div><b>Mode:</b> {detail.transaction.payment_mode}</div>}
                  {detail.transaction.receipt_url && (
                    <div style={{ marginTop: 6 }}>
                      <a href={detail.transaction.receipt_url} target="_blank" rel="noreferrer"
                        style={{ color: G, fontWeight: 700, textDecoration: 'none' }}>📎 View uploaded receipt</a>
                    </div>
                  )}
                </div>

                <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: 12, marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#444', marginBottom: 8 }}>Audit trail</div>
                  {detail.audit.length === 0 && <div style={{ fontSize: 12, color: '#999' }}>No audit entries.</div>}
                  {detail.audit.map(a => (
                    <div key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: '#555', padding: '3px 0' }}>
                      {a.action === 'approved' ? <CheckCircle size={13} color="#22C55E" />
                        : a.action === 'rejected' ? <XCircle size={13} color="#DC2626" />
                        : a.action === 'receipt_sent' ? <FileText size={13} color={GOLD} />
                        : <Clock size={13} color="#999" />}
                      <span style={{ fontWeight: 700 }}>{ACTION_LABEL[a.action] || a.action}</span>
                      <span style={{ color: '#888' }}>— {a.actor_name || (a.actor_id ? a.actor_id.slice(0,8) : 'system')}</span>
                      {a.note && <span style={{ color: '#999' }}>“{a.note}”</span>}
                      <span style={{ marginLeft: 'auto', color: '#AAA' }}>{new Date(a.created_at).toLocaleString('en-NG')}</span>
                    </div>
                  ))}
                </div>

                {detail.transaction.status === 'pending_review' && (
                  <>
                    {(detail.transaction.payment_type || 'rent') === 'inspection' && (
                      <div style={{ fontSize: 12, color: '#6D28D9', background: '#EDE9FE', borderRadius: 8, padding: '10px 12px', marginBottom: 12, lineHeight: 1.6 }}>
                        Approving confirms the ₦{Number(detail.transaction.inspection_fee || 0).toLocaleString()} fee (non-refundable, SouthSwift revenue) and holds the unit for this tenant's booking — the hold auto-expires 24h after inspection if rent isn't secured. It does not touch rent escrow.
                      </div>
                    )}
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#444', marginBottom: 5 }}>
                      Review note (optional)
                    </label>
                    <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note for the audit log…"
                      style={{ width: '100%', border: '1px solid #DDD', borderRadius: 8, padding: 10, fontSize: 13,
                        height: 64, boxSizing: 'border-box', resize: 'vertical', marginBottom: 12 }} />
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => handleReview('approve')} disabled={reviewing}
                        style={{ flex: 1, background: G, color: 'white', border: 'none', padding: 12,
                          borderRadius: 10, cursor: reviewing ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14, opacity: reviewing ? 0.6 : 1 }}>
                        {reviewing ? 'Processing…' : (detail.transaction.payment_type || 'rent') === 'inspection'
                          ? '✅ Approve Inspection & Hold Unit'
                          : '✅ Approve & Secure Escrow'}
                      </button>
                    </div>
                    {(detail.transaction.payment_type || 'rent') === 'inspection' ? (
                      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                        <button onClick={() => handleReview('reject', false)} disabled={reviewing}
                          style={{ flex: 1, background: 'white', color: '#DC2626', border: reviewing ? '1px solid #E5A0A0' : '1px solid #DC2626', padding: 12,
                            borderRadius: 10, cursor: reviewing ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13, opacity: reviewing ? 0.6 : 1 }}>
                          ↩ Reject Proof
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                        <button onClick={() => handleReview('reject', false)} disabled={reviewing}
                          style={{ flex: 1, background: 'white', color: '#DC2626', border: reviewing ? '1px solid #E5A0A0' : '1px solid #DC2626', padding: 12,
                            borderRadius: 10, cursor: reviewing ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13, opacity: reviewing ? 0.6 : 1 }}>
                          ↩ Reject Proof (Keep Held)
                        </button>
                        <button onClick={() => handleReview('reject', true)} disabled={reviewing}
                          style={{ flex: 1, background: '#DC2626', color: 'white', border: 'none', padding: 12,
                            borderRadius: 10, cursor: reviewing ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13, opacity: reviewing ? 0.6 : 1 }}>
                          ❌ Reject & Release Unit
                        </button>
                      </div>
                    )}
                  </>
                )}
                {detail.transaction.status !== 'pending_review' && (
                  <div style={{ fontSize: 13, color: '#888', textAlign: 'center', padding: '10px 0' }}>
                    This transaction has already been {detail.transaction.status}.
                  </div>
                )}
              </>
            ) : <div style={{ textAlign: 'center', padding: 40, color: G }}>Loading…</div>}
          </div>
        </div>
      )}
    </div>
  );
}
