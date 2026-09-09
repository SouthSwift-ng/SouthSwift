import { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Share2, Copy, Check, MessageCircle, Send, Facebook, Twitter, MoreHorizontal } from 'lucide-react';
import { buildShareLinks, copyListingLink, canNativeShare, nativeShareListing } from '../utils/share';

const G = '#1B4332';

export default function ShareListing({ listing, variant = 'button', label = 'Share' }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open ]);

  if (!listing?.id) return null;
  const links = buildShareLinks(listing);

  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };

  const doCopy = async (e) => {
    stop(e);
    try {
      await copyListingLink(listing);
      setCopied(true);
      toast.success('Listing link copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy link.');
    }
  };

  const doNative = async (e) => {
    stop(e);
    try {
      await nativeShareListing(listing);
      setOpen(false);
    } catch {
      // User dismissed the native sheet — not an error.
      if (typeof navigator.share === 'function') setOpen(false);
    }
  };

  const openIntent = (e, href) => {
    stop(e);
    window.open(href, '_blank', 'noopener,noreferrer,width=600,height=540');
    setOpen(false);
  };

  const items = [
    { key: 'copy', label: copied ? 'Copied!' : 'Copy link', icon: copied ? <Check size={15} /> : <Copy size={15} />, onClick: doCopy },
    { key: 'wa', label: 'WhatsApp', icon: <MessageCircle size={15} />, onClick: (e) => openIntent(e, links.whatsapp) },
    { key: 'x', label: 'X (Twitter)', icon: <Twitter size={15} />, onClick: (e) => openIntent(e, links.x) },
    { key: 'fb', label: 'Facebook', icon: <Facebook size={15} />, onClick: (e) => openIntent(e, links.facebook) },
    { key: 'tg', label: 'Telegram', icon: <Send size={15} />, onClick: (e) => openIntent(e, links.telegram) },
  ];
  if (canNativeShare()) {
    items.push({ key: 'more', label: 'More…', icon: <MoreHorizontal size={15} />, onClick: doNative });
  }

  const isIcon = variant === 'icon';

  return (
    <span ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }} onClick={stop}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Share ${listing.title || 'listing'}`}
        title="Share this listing"
        onClick={(e) => { stop(e); setOpen(o => !o); }}
        style={isIcon ? s.iconBtn : s.btn}
      >
        <Share2 size={isIcon ? 15 : 14} />
        {!isIcon && <span>{label}</span>}
      </button>

      {open && (
        <span role="menu" style={{ ...s.menu, ...(isIcon ? s.menuRight : {}) }}>
          {items.map(it => (
            <button key={it.key} type="button" role="menuitem" onClick={it.onClick} style={s.item}>
              <span style={s.itemIcon}>{it.icon}</span>
              <span>{it.label}</span>
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

const s = {
  btn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: 'white', color: G, border: `1px solid ${G}`,
    padding: '7px 12px', borderRadius: 8, cursor: 'pointer',
    fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap',
  },
  iconBtn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 30, height: 30, borderRadius: '50%', cursor: 'pointer',
    background: 'rgba(255,255,255,0.95)', color: G, border: '1px solid #E5E7EB',
    boxShadow: '0 1px 6px rgba(0,0,0,0.15)',
  },
  menu: {
    position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 200,
    background: 'white', border: '1px solid #E5E7EB', borderRadius: 10,
    boxShadow: '0 8px 28px rgba(0,0,0,0.14)', minWidth: 168, padding: 6,
    display: 'flex', flexDirection: 'column',
  },
  menuRight: { left: 'auto', right: 0 },
  item: {
    display: 'flex', alignItems: 'center', gap: 9, width: '100%',
    background: 'transparent', border: 'none', cursor: 'pointer',
    padding: '8px 10px', borderRadius: 7, fontSize: 13, color: '#222', textAlign: 'left',
  },
  itemIcon: { color: G, display: 'inline-flex' },
};
