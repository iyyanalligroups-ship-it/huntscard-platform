import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'huntsTAG_magic_poster_cart';

// A Magic Poster cart, client-side only (localStorage), same convention
// as api.js's own session storage -- nothing server-side needs to know
// about a cart until checkout actually starts (see routes/profile.js's
// /magic-poster/order). Item shape: { magicArtId, name, imageUrl,
// unitPrice, quantity }.
function loadCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const items = raw ? JSON.parse(raw) : [];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function saveCart(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Private browsing / storage disabled -- cart just won't persist
    // across a reload, not worth surfacing an error for.
  }
}

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [items, setItems] = useState(loadCart);

  useEffect(() => saveCart(items), [items]);

  const api = useMemo(
    () => ({
      items,
      addItem(piece, quantity = 1) {
        setItems((list) => {
          const existing = list.find((i) => i.magicArtId === piece._id);
          if (existing) {
            return list.map((i) =>
              i.magicArtId === piece._id ? { ...i, quantity: i.quantity + quantity } : i
            );
          }
          return [
            ...list,
            {
              magicArtId: piece._id,
              name: piece.name || '',
              imageUrl: piece.imageUrl,
              unitPrice: piece.chargeAmount,
              quantity,
            },
          ];
        });
      },
      updateQuantity(magicArtId, quantity) {
        setItems((list) =>
          quantity < 1
            ? list.filter((i) => i.magicArtId !== magicArtId)
            : list.map((i) => (i.magicArtId === magicArtId ? { ...i, quantity } : i))
        );
      },
      removeItem(magicArtId) {
        setItems((list) => list.filter((i) => i.magicArtId !== magicArtId));
      },
      clear() {
        setItems([]);
      },
      totalCount: items.reduce((sum, i) => sum + i.quantity, 0),
      totalAmount: items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
    }),
    [items]
  );

  return <CartContext.Provider value={api}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within <CartProvider>');
  return ctx;
}
