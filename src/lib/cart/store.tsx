/**
 * The cart.
 *
 * What is stored, and what is deliberately not: the cart holds slugs and
 * quantities. It does NOT hold prices, line totals or a cart total. A cart
 * survives in a browser for weeks, and a price that survives with it is a
 * price that goes stale -- so every figure a customer sees is derived from
 * the catalogue that was just fetched, and the figure they are charged is
 * derived again, server-side, at checkout.
 *
 * That also means there is nothing worth tampering with in localStorage. The
 * worst an edited cart can do is ask to buy a different number of a cap that
 * exists, which the server prices and the database reserves or refuses.
 *
 * The reading and writing rules live in ./storage, so they can be tested as a
 * pure function against the corrupt input a real browser eventually supplies.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { MAX_QUANTITY_PER_LINE } from "@/lib/domain/validation";
import { readStoredCart, writeStoredCart } from "./storage";
import type { ProductSlug } from "@/lib/catalog/products";
import type { CartLine } from "@/lib/domain/types";

interface CartContextValue {
  readonly lines: readonly CartLine[];
  readonly count: number;
  /** False until the stored cart has been read, so SSR and hydration agree. */
  readonly ready: boolean;
  add: (slug: ProductSlug, quantity?: number) => void;
  setQuantity: (slug: ProductSlug, quantity: number) => void;
  remove: (slug: ProductSlug) => void;
  clear: () => void;
  quantityOf: (slug: ProductSlug) => number;
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  // Always starts empty so the server-rendered markup and the first client
  // render match; the stored cart is merged in immediately after mount.
  const [lines, setLines] = useState<readonly CartLine[]>([]);
  const [ready, setReady] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setLines(readStoredCart());
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) writeStoredCart(lines);
  }, [lines, ready]);

  const add = useCallback((slug: ProductSlug, quantity = 1) => {
    setLines((current) => {
      const existing = current.find((line) => line.slug === slug);
      if (!existing) {
        return [...current, { slug, quantity: Math.min(quantity, MAX_QUANTITY_PER_LINE) }];
      }
      return current.map((line) =>
        line.slug === slug
          ? { ...line, quantity: Math.min(line.quantity + quantity, MAX_QUANTITY_PER_LINE) }
          : line,
      );
    });
  }, []);

  const setQuantity = useCallback((slug: ProductSlug, quantity: number) => {
    // Setting a line to zero removes it, which is what the minus button at
    // quantity one should do.
    if (quantity <= 0) {
      setLines((current) => current.filter((line) => line.slug !== slug));
      return;
    }
    setLines((current) =>
      current.map((line) =>
        line.slug === slug
          ? { ...line, quantity: Math.min(quantity, MAX_QUANTITY_PER_LINE) }
          : line,
      ),
    );
  }, []);

  const remove = useCallback((slug: ProductSlug) => {
    setLines((current) => current.filter((line) => line.slug !== slug));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      count: lines.reduce((total, line) => total + line.quantity, 0),
      ready,
      add,
      setQuantity,
      remove,
      clear,
      quantityOf: (slug) => lines.find((line) => line.slug === slug)?.quantity ?? 0,
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
    }),
    [lines, ready, isOpen, add, setQuantity, remove, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside a CartProvider");
  return context;
}
