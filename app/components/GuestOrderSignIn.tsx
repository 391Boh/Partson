'use client';

import { LogIn, Percent } from 'lucide-react';
import { FIRST_ORDER_DISCOUNT_PERCENT } from 'app/lib/first-order-discount';
import styles from './OrderGuest.module.css';

export default function GuestOrderSignIn({ showDiscount = false }: { showDiscount?: boolean }) {
  const openSignIn = () => {
    window.dispatchEvent(new CustomEvent('openAuthModal', { detail: { initialMode: 'login' } }));
  };

  return (
    <div className={`${styles.signIn} ${showDiscount ? styles.signInOffer : styles.signInCompact}`}>
      {showDiscount && <span className={styles.offerIcon} aria-hidden="true"><Percent size={18} /></span>}
      <div className={styles.signInCopy}>
        <p className={styles.signInTitle}>
          {showDiscount ? `−${FIRST_ORDER_DISCOUNT_PERCENT}% на перше замовлення` : 'Вже маєте акаунт?'}
        </p>
        {showDiscount && <p className={styles.signInDescription}>Знижка після входу в акаунт</p>}
      </div>
      <button type="button" onClick={openSignIn} className={styles.signInButton} aria-haspopup="dialog">
        <LogIn size={16} aria-hidden="true" />
        Увійти
      </button>
    </div>
  );
}
