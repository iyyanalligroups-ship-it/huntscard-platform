import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { loadJsonFile, saveJsonFile } from '../lib/files.js';

// Magic Poster cart -- same shape and behaviour as client-app/src/cart.jsx,
// persisted to a small JSON file instead of localStorage.
const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    loadJsonFile().then((saved) => { if (Array.isArray(saved)) setItems(saved); }).finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (hydrated) saveJsonFile(items);
  }, [items, hydrated]);

  const addItem = useCallback((piece, quantity = 1) => {
    setItems((list) => {
      const existing = list.find((item) => item.magicArtId === piece._id);
      if (existing) return list.map((item) => (item.magicArtId === piece._id ? { ...item, quantity: item.quantity + quantity } : item));
      return [...list, { magicArtId: piece._id, name: piece.name || '', imageUrl: piece.imageUrl, unitPrice: piece.chargeAmount, quantity }];
    });
  }, []);

  const updateQuantity = useCallback((magicArtId, quantity) => {
    setItems((list) => (quantity < 1 ? list.filter((item) => item.magicArtId !== magicArtId) : list.map((item) => (item.magicArtId === magicArtId ? { ...item, quantity } : item))));
  }, []);

  const removeItem = useCallback((magicArtId) => setItems((list) => list.filter((item) => item.magicArtId !== magicArtId)), []);
  const clear = useCallback(() => setItems([]), []);

  const value = useMemo(() => ({
    items,
    addItem,
    updateQuantity,
    removeItem,
    clear,
    totalCount: items.reduce((sum, item) => sum + item.quantity, 0),
    totalAmount: items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
  }), [items, addItem, updateQuantity, removeItem, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  return useContext(CartContext);
}
