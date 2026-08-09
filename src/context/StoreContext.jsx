import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addCartItem, addWishlistItem, getCart, getStoreProducts, getWishlist, quoteCart, removeCartItem, removeWishlistItem, updateCartItem } from "../services/api";
import { useAuth } from "./AuthContext";
import { clearGuestCart, readGuestCart, writeGuestCart } from "../services/guestCart";

export const StoreContext = createContext(null);
const storefrontCategories = ["All", "Men", "Women", "Unisex", "Accessory"];

// One label for a variant everywhere in the app, so a tile, a listing card, a wishlist
// card and the button that commits the variant can never name a different colourway
// than the one being added.
export const variantLabel = (variant) => variant?.attributes?.color || variant?.variantName || variant?.sku || "";
// The one rule for the number a listing card quotes: the committed variant's own price, with the
// product-level minimum only as a fallback when no variant resolves. Discovery sorts through this
// too, because sorting on `price` while the card printed `defaultVariantPrice` produced a
// "Price: low to high" grid that was visibly not — any product whose cheapest colourway is out of
// stock quotes a higher number than the one it was ordered by.
export const listingPrice = (variantPrice, productPrice) => (
  variantPrice == null || !Number.isFinite(Number(variantPrice)) ? Number(productPrice) : Number(variantPrice)
);
// null means "unknown", which is never the same thing as zero or as unlimited.
const finiteOrNull = (value) => (value !== null && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null);

// ── Default variant selection ────────────────────────────────────────────────────────────────
// One rule, used by the listing card (through mapProduct) and by the product page, so the colour
// a card commits to and the colour the product page opens on can never disagree.
//
// "Purchasable" is the only thing that makes a variant eligible to be selected automatically:
// active, and with stock. Ordering is by variantId rather than by array position — the API's list
// order is now pinned by @OrderBy on the entity, but a selection rule that silently depends on
// arrival order is exactly the kind that works until a query changes underneath it.
export const purchasableVariants = (variants) => (variants || [])
  .filter((variant) => variant.isActive !== false && Number(variant.quantityAvailable) > 0)
  .sort((first, second) => Number(first.variantId) - Number(second.variantId));

/**
 * The variant a surface should open on.
 *
 * `requestedVariantId` is a deep link (?variant=). It wins only when it names a variant that is
 * genuinely purchasable; an unknown, inactive or out-of-stock request falls back to the first
 * eligible variant rather than honouring a link to something nobody can buy. Returns null when
 * nothing is purchasable, which is the sold-out state — deliberately not "variant zero", because
 * pretending some variant is available is the bug this rule exists to prevent.
 */
export const selectDefaultVariant = (variants, requestedVariantId) => {
  const eligible = purchasableVariants(variants);
  const requested = requestedVariantId == null || requestedVariantId === ""
    ? undefined
    : eligible.find((variant) => String(variant.variantId) === String(requestedVariantId));
  return requested || eligible[0] || null;
};

/**
 * The photos to show for a variant, best first. The one rule every photo surface uses — the
 * product gallery, the listing card, the variant tiles — so they cannot disagree about which
 * colourway a customer is looking at.
 *
 * Order:
 *   1. the variant's own photos, then the general product photos,
 *   2. general product photos alone, when the variant has none of its own,
 *   3. photos belonging to some OTHER PURCHASABLE variant,
 *   4. anything left.
 *
 * Step 1 briefly returned the variant's own photos and nothing else, to stop ODU's general shot —
 * which is a photograph of the sold-out Black pair — appearing among Blue's additional pictures.
 * That was the wrong cut. It hid every genuinely product-wide photo: measured across the live
 * catalogue, five of six products dropped from 2-3 stored photos to ONE visible, because each was
 * authored as "one photo per colourway plus one general".
 *
 * A general photo IS product-wide, and belongs in every colourway's gallery. ODU's problem is that
 * a colourway-specific photo was FILED as general — a data problem, not a rule problem. The fix for
 * it is the "Shown for" control in the admin image editor, which moves that photo onto Ocean Black
 * where it belongs; it then stops appearing under Blue, without hiding anything from anyone else.
 *
 * Step 3 is the fix for a reported bug and the reason this is not a one-liner. Every fallback used
 * to end at "the primary image, else the first image", none of which asks whether the variant that
 * owns that photo can actually be bought. A product whose only photography belonged to a sold-out
 * colourway therefore showed that colourway everywhere while quoting, labelling and selling a
 * different one: the page said "Add Orange to bag" beside two photographs of Blue, and the Shop
 * card did the same. Preferring a purchasable variant's photography means the customer sees
 * something they can buy.
 *
 * Step 4 still exists, and is reached only when NOTHING is purchasable. A fully sold-out product
 * has no in-stock colourway to borrow from, and showing its photographs is better than showing an
 * empty frame — it is not misleading there, because nothing on the page is for sale either.
 */
export const galleryFor = (product, variant) => {
  const images = product?.images || [];
  if (!images.length) return [];
  const sameVariant = (image, candidate) => candidate != null
    && image.variantId != null
    && String(image.variantId) === String(candidate);

  const own = variant ? images.filter((image) => sameVariant(image, variant.variantId)) : [];
  const general = images.filter((image) => image.variantId == null);
  if (own.length) return [...own, ...general];
  if (general.length) return general;

  // Borrowed photography. Ordered by the shared variant order so the choice is deterministic
  // rather than "whichever image row came back first".
  const buyable = purchasableVariants(product?.variants)
    .filter((candidate) => String(candidate.variantId) !== String(variant?.variantId));
  const borrowed = buyable.flatMap((candidate) => images.filter((image) => sameVariant(image, candidate.variantId)));
  if (borrowed.length) return borrowed;

  return images;
};

/** The single photo that best represents a variant. Same rule as the gallery, first frame only. */
export const imageForVariant = (product, variant) => galleryFor(product, variant)[0];

/**
 * True when the photo shown for `variant` is not actually a photo of it — either a general product
 * shot or another colourway's. Surfaces use this to say so rather than letting the customer assume
 * the picture is the thing they are buying.
 */
export const isBorrowedImage = (product, variant, image) => Boolean(image)
  && image.variantId != null
  && String(image.variantId) !== String(variant?.variantId);

/**
 * The storefront address of a product. Every link to a product page must be built with this and
 * nothing else — a second way to construct the URL is how one surface ends up still emitting
 * /product/22 after the rest moved to slugs.
 *
 * Accepts anything carrying a slug: a mapped product, a wishlist item, a cart line's product. The
 * numeric fallback exists only for a payload that predates the slug field; it still resolves,
 * because /product/:slug detects a numeric segment and redirects to the canonical URL.
 */
export const productPath = (product) => {
  const slug = product?.slug;
  return `/product/${slug || product?.productId || product?._id}`;
};

// Exported so any surface rendering a product card — the discovery grid, Best Sellers — derives
// its price, default variant, stock and New badge from the same mapping. A second mapper is how
// two cards for the same product end up disagreeing.
export const mapProduct = (product) => {
  // Sorted here too, so the variant tiles, the colour filter and the selection rule all iterate
  // the same order regardless of what the API hands back.
  const variants = (product.variants || []).filter((variant) => variant.isActive)
    .sort((first, second) => Number(first.variantId) - Number(second.variantId));
  // Falls back to variants[0] only for DISPLAY: a fully sold-out product still needs a colour and
  // a price on its card. `available` below is what gates the buy button.
  const firstVariant = selectDefaultVariant(variants) || variants[0];
  const prices = variants.map((variant) => Number(variant.price)).filter(Number.isFinite);
  const lowestPrice = prices.length ? Math.min(...prices) : Number(product.basePrice);
  // The card's photo is chosen for the variant the card actually sells, through the shared rule.
  // It used to be "isPrimary, else the first non-variant image, else images[0]", which ignored
  // whether that photo's colourway was purchasable — so a card reading "Orange / Add Orange to bag"
  // could carry a photograph of a sold-out Blue.
  const primaryImage = galleryFor(product, firstVariant)[0];
  const defaultVariantImage = firstVariant
    && product.images?.find((image) => String(image.variantId) === String(firstVariant.variantId));
  const defaultVariantPrice = finiteOrNull(firstVariant?.price);
  return {
    _id: String(product.productId),
    productId: product.productId,
    slug: product.slug,
    name: product.productName,
    brand: product.brand,
    description: product.productDescription || "",
    // price stays the lowest ACTIVE variant price because the price *filter* asks a product-level
    // question — "does this product have anything in my range" — which the card's "Other colours
    // from ₹x" note explains on screen. Sorting is not that question and no longer uses this:
    // see listingPrice. It may belong to an out-of-stock variant, so it is not what any add
    // button commits either: the card must quote defaultVariantPrice instead.
    price: lowestPrice,
    image: primaryImage?.imageUrl || "",
    imageAlt: primaryImage?.altText || product.productName,
    images: product.images || [],
    color: variantLabel(firstVariant),
    category: product.categories?.[0]?.categoryName || "Uncategorised",
    categories: product.categories || [],
    variants,
    defaultVariantId: firstVariant?.variantId,
    defaultVariantPrice,
    defaultVariantImage: defaultVariantImage?.imageUrl || "",
    defaultVariantStock: finiteOrNull(firstVariant?.quantityAvailable),
    priceFrom: defaultVariantPrice !== null && lowestPrice < defaultVariantPrice ? lowestPrice : null,
    available: variants.some((variant) => Number(variant.quantityAvailable) > 0),
    attributes: product.attributes || {},
    // Taken from the API, never recomputed. This used to be
    //   Date.now() - new Date(product.createdAt) < 30 * 86400000
    // which measured from the row's creation rather than its publication, hard-coded the window,
    // and ran against the customer's own system clock after parsing a zone-less server timestamp
    // as browser-local time. The rule now lives in NewProductPolicy on the server — see
    // app.catalog.new-product-days — so every surface renders the same badge.
    isNew: product.isNew === true,
    publishedAt: product.publishedAt || null,
  };
};

// Every cart surface — the bag, the checkout review, the badge and the subtotal — derives
// from this one resolver. GET /api/cart returns lines for products the storefront listing
// no longer contains (it never reconciles deactivations), so a line is never filtered out
// here: it is returned with resolved:false and rendered as a removable degraded row.
// Filtering was the defect, because no UI can remove a row it never draws.
export const resolveCartLines = (cartItems, product_list) => Object.entries(cartItems || {}).map(([key, quantity]) => {
  const [id, variantId] = key.split(":");
  const product = (product_list || []).find((item) => item._id === id) || null;
  const variant = variantId ? product?.variants?.find((item) => String(item.variantId) === variantId) || null : null;
  const variantImage = variantId && product?.images?.find((image) => String(image.variantId) === variantId);
  const resolved = Boolean(product) && (!variantId || Boolean(variant));
  return {
    key, quantity, product, variant, resolved,
    productId: id,
    variantId: variantId ? Number(variantId) : null,
    title: product?.name || "Unavailable item",
    unavailableReason: resolved ? "" : product ? "This colour is no longer sold." : "This item is no longer sold.",
    price: resolved ? Number(variant?.price ?? product.price) : null,
    image: variantImage?.imageUrl || product?.image || "",
    color: resolved ? variantLabel(variant) || product.color : "",
    quantityAvailable: variant ? finiteOrNull(variant.quantityAvailable) : null,
  };
});

const StoreContextProvider = ({ children }) => {
  const { accessToken, user, isAdmin } = useAuth();
  const customerId = accessToken && user && !isAdmin ? user.userId : null;
  const [product_list, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState("");
  // Seeded synchronously from storage rather than in an effect: the sign-in merge captures
  // `localSnapshot = {...cartItemsRef.current}` on its first run, and an effect-based seed would
  // land after that snapshot, silently dropping the restored guest bag.
  const [cartItems, setCartItems] = useState(readGuestCart);
  const [appliedOffer, setAppliedOffer] = useState(null);
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [wishlistItems, setWishlistItems] = useState([]);
  const [wishlistLoading, setWishlistLoading] = useState(false);
  const [cartError, setCartError] = useState("");
  const [cartOperations, setCartOperations] = useState(0);
  const previousCustomerRef = useRef(null);
  const cartItemsRef = useRef(cartItems);
  // Mirrors customerId for the synchronous writer below. It is assigned before any cart clear
  // so a sign-out clears the guest key instead of writing the ex-customer's bag into it.
  const customerIdRef = useRef(null);
  const productListRef = useRef([]);
  const cartMutationQueueRef = useRef(Promise.resolve());
  const cartMutationSeqRef = useRef(0);

  // The single writer for cart state, so persistence hooks in here once rather than at each of
  // the six mutation paths. Only the signed-out bag is stored: an authenticated bag is already
  // in the database, and mirroring it would leak one account's items into the next session.
  const replaceCartItems = useCallback((next) => {
    cartItemsRef.current = typeof next === "function" ? next(cartItemsRef.current) : next;
    setCartItems(cartItemsRef.current);
    if (customerIdRef.current === null) writeGuestCart(cartItemsRef.current);
  }, []);

  const refreshProducts = useCallback(() => {
    setProductsLoading(true);
    setProductsError("");
    getStoreProducts()
      .then((page) => { productListRef.current = (page.content || []).map(mapProduct); setProducts(productListRef.current); })
      .catch((error) => setProductsError(error.message))
      .finally(() => setProductsLoading(false));
  }, []);

  useEffect(() => {
    refreshProducts();
    window.addEventListener("shades:products-changed", refreshProducts);
    return () => window.removeEventListener("shades:products-changed", refreshProducts);
  }, [refreshProducts]);

  useEffect(() => {
    if (!customerId) { setWishlistItems([]); return; }
    let active = true; setWishlistLoading(true);
    getWishlist(accessToken).then((wishlist) => { if (active) setWishlistItems(wishlist.items || []); })
      .catch(() => { if (active) setWishlistItems([]); })
      .finally(() => { if (active) setWishlistLoading(false); });
    return () => { active = false; };
  }, [accessToken, customerId]);

  useEffect(() => {
    const currentCustomer = customerId == null ? null : String(customerId);
    // Assigned before the clears below so replaceCartItems knows which bag it is writing.
    customerIdRef.current = currentCustomer;
    if (!currentCustomer) {
      if (previousCustomerRef.current) { replaceCartItems({}); setAppliedOffer(null); }
      previousCustomerRef.current = null;
      return;
    }
    if (previousCustomerRef.current && previousCustomerRef.current !== currentCustomer) {
      replaceCartItems({}); setAppliedOffer(null);
    }
    previousCustomerRef.current = currentCustomer;
  }, [customerId, replaceCartItems]);

  const cartStateFromResponse = (cart) => Object.fromEntries((cart?.items || []).map((line) => [`${line.productId}:${line.variantId}`, line.quantity]));
  // A server snapshot is authoritative for every synced line, but lines held without a variantId
  // never reached the server, so they must survive the replacement instead of silently vanishing.
  const applyCartState = (next) => replaceCartItems((previous) => ({
    ...Object.fromEntries(Object.entries(previous).filter(([key]) => !key.includes(":"))), ...next,
  }));
  // Every cart read and write shares one chain so overlapping clicks cannot interleave server-side.
  // `isLatest` marks the newest queued call, and only that call may own client state: an earlier
  // response describes a cart that the calls queued behind it have already moved past.
  const queueCartCall = (operation) => {
    const seq = (cartMutationSeqRef.current += 1);
    const settled = cartMutationQueueRef.current.then(operation).then(
      (cart) => ({ cart, isLatest: seq === cartMutationSeqRef.current }),
      (error) => ({ error, isLatest: seq === cartMutationSeqRef.current }));
    cartMutationQueueRef.current = settled;
    return settled;
  };
  const withCartBusy = (run) => { setCartOperations((count) => count + 1); return run().finally(() => setCartOperations((count) => Math.max(0, count - 1))); };

  useEffect(() => {
    if (!customerId) return;
    let active = true;
    const localSnapshot = { ...cartItemsRef.current };
    const lineOf = (key) => {
      const [id, variantId] = key.split(":");
      const product = productListRef.current.find((item) => item._id === id);
      return { product, variant: product?.variants.find((item) => String(item.variantId) === variantId) };
    };
    // Products may not have loaded yet, and mapProduct drops deactivated variants: an unknown
    // stock means "do not clamp" and leaves the backend's own 400 as the authority. finiteOrNull
    // keeps a literal null stock out of the zero case, where Number() would have coerced it.
    const stockOf = (key) => { const stock = finiteOrNull(lineOf(key).variant?.quantityAvailable); return stock === null ? Infinity : stock; };
    const labelOf = (key) => lineOf(key).product?.name || "An item in your bag";
    const synchronize = async () => {
      const opened = await queueCartCall(() => getCart(accessToken));
      if (!active) return;
      if (opened.error) { setCartError(opened.error.message); return; }
      const remote = cartStateFromResponse(opened.cart);
      const projected = { ...remote }; const pending = []; const notes = [];
      for (const [key, quantity] of Object.entries(localSnapshot)) {
        const variantId = Number(key.split(":")[1]);
        if (!variantId) continue;
        const target = Math.min(quantity, stockOf(key));
        if (target < quantity) notes.push(target > 0 ? `Only ${target} left of ${labelOf(key)}.` : `${labelOf(key)} is out of stock.`);
        // POST increments, so send the shortfall against the snapshot rather than the whole local
        // quantity, and never reduce what the account already holds.
        if (target > (remote[key] || 0)) { projected[key] = target; pending.push([key, variantId, target - (remote[key] || 0)]); }
      }
      if (opened.isLatest) applyCartState(projected);
      let rejected = false;
      for (const [key, variantId, delta] of pending) {
        const merged = await queueCartCall(() => addCartItem(accessToken, variantId, delta));
        if (!active) return;
        if (merged.error) { rejected = true; notes.push(`${labelOf(key)}: ${merged.error.message}`); }
        else { rejected = false; if (merged.isLatest) applyCartState(cartStateFromResponse(merged.cart)); }
      }
      // The projection above optimistically included every line it was about to add, so a merge
      // that ends on a rejection needs one read to drop the lines the server refused.
      if (rejected) {
        const fresh = await queueCartCall(() => getCart(accessToken));
        if (!active) return;
        if (!fresh.error && fresh.isLatest) applyCartState(cartStateFromResponse(fresh.cart));
      }
      // The bag now belongs to the account, so drop the guest copy — otherwise every
      // authenticated reload would merge it again and resurrect deleted lines. Deliberately not
      // in the `opened.error` return above: if the merge never ran, the guest bag is still the
      // only copy and must survive.
      clearGuestCart();
      if (active) setCartError(notes.join(" "));
    };
    withCartBusy(synchronize).catch((error) => { if (active) setCartError(error.message); });
    return () => { active = false; };
    // Authentication changes trigger synchronization; cart changes must not refetch recursively.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, customerId, replaceCartItems]);

  const categories = useMemo(() => storefrontCategories, []);
  const enqueueCartMutation = (operation) => withCartBusy(() => queueCartCall(operation).then((settled) => {
    if (!settled.error) { if (settled.isLatest) applyCartState(cartStateFromResponse(settled.cart)); return settled.cart; }
    setCartError(settled.error.message);
    // Re-reading is only safe from the newest call; an earlier one would overwrite state with a
    // snapshot the mutations queued behind it have already superseded.
    if (!settled.isLatest) return undefined;
    return queueCartCall(() => getCart(accessToken)).then((fresh) => {
      if (!fresh.error && fresh.isLatest) applyCartState(cartStateFromResponse(fresh.cart));
      return undefined;
    });
  }));
  const cartKey = (itemId, variantId) => variantId ? `${itemId}:${variantId}` : String(itemId);
  // Stock known to the loaded catalogue. Unknown means "do not clamp" — the same rule the
  // sign-in merge uses — so a not-yet-loaded catalogue never silently blocks a legitimate add.
  const knownStockFor = (itemId, variantId) => {
    if (!variantId) return null;
    const product = productListRef.current.find((item) => item._id === String(itemId));
    return finiteOrNull(product?.variants?.find((item) => String(item.variantId) === String(variantId))?.quantityAvailable);
  };
  const addToCart = (itemId, variantId) => {
    setAppliedOffer(null); setCartError("");
    const key = cartKey(itemId, variantId);
    const cap = knownStockFor(itemId, variantId);
    // The disabled Add button cannot hold this line on its own: a burst of clicks all fire
    // before React re-renders, so the ceiling is enforced here where it is authoritative.
    if (cap !== null && (cartItemsRef.current[key] || 0) >= cap) {
      setCartError(cap === 0 ? "That colour is out of stock." : `Only ${cap} of that colour ${cap === 1 ? "is" : "are"} available.`);
      return;
    }
    replaceCartItems((previous) => ({ ...previous, [key]: (previous[key] || 0) + 1 }));
    if (accessToken && variantId) enqueueCartMutation(() => addCartItem(accessToken, variantId, 1));
  };
  const removeFromCart = (itemId, variantId) => {
    setAppliedOffer(null); setCartError("");
    const key = cartKey(itemId, variantId); const nextQuantity = Math.max(0, (cartItemsRef.current[key] || 0) - 1);
    replaceCartItems((previous) => { if (nextQuantity <= 0) { const updated = { ...previous }; delete updated[key]; return updated; } return { ...previous, [key]: nextQuantity }; });
    if (accessToken && variantId) {
      enqueueCartMutation(() => nextQuantity <= 0 ? removeCartItem(accessToken, variantId) : updateCartItem(accessToken, variantId, nextQuantity));
    }
  };
  const removeLineFromCart = (itemId, variantId) => {
    setAppliedOffer(null); setCartError("");
    const key = cartKey(itemId, variantId);
    replaceCartItems((previous) => { const updated = { ...previous }; delete updated[key]; return updated; });
    if (accessToken && variantId) enqueueCartMutation(() => removeCartItem(accessToken, variantId));
  };
  // The badge counts every line the bag renders, unavailable ones included, because such a
  // line is genuinely in the server cart and is what stops checkout; hiding it would hide
  // the blocker. Both totals walk the same resolver as the bag and the review, so the three
  // surfaces cannot diverge — only the money differs, and only where a price is unknowable.
  const getCartCount = () => resolveCartLines(cartItems, product_list).reduce((sum, line) => sum + line.quantity, 0);
  const getTotalCartAmount = () => resolveCartLines(cartItems, product_list).reduce((total, line) => total + (line.resolved ? line.price * line.quantity : 0), 0);
  const isWishlisted = (productId) => wishlistItems.some((item) => String(item.productId) === String(productId));

  /**
   * The server's priced view of the current bag.
   *
   * The bag and checkout still compute a client-side subtotal for immediate feedback while this is
   * in flight, but every discount and the final total come from here. The browser sends variant ids
   * and quantities; it never sends, and is never trusted for, an amount.
   *
   * Re-quoted whenever the bag changes and whenever the coupon field changes, which is what makes
   * the discount disappear the moment a change makes the cart ineligible instead of at checkout.
   */
  const quoteSignature = JSON.stringify(
    Object.entries(cartItems).filter(([, quantity]) => quantity > 0).sort());
  const couponCode = appliedOffer?.couponCode || "";
  const refreshQuote = useCallback(() => {
    // Built from the same resolver the bag renders, so a line the catalogue cannot resolve is
    // absent from the quote exactly as it is absent from the client-side subtotal — and the server
    // excludes anything unpurchasable again on its own side.
    const lines = resolveCartLines(cartItemsRef.current, productListRef.current)
      .filter((line) => line.resolved && line.variantId && line.quantity > 0)
      .map((line) => ({ variantId: line.variantId, quantity: line.quantity }));
    if (lines.length === 0) { setQuote(null); setQuoteError(""); setQuoteLoading(false); return () => {}; }
    let active = true;
    setQuoteLoading(true);
    quoteCart(lines, { couponCode: couponCode || undefined })
      .then((priced) => { if (active) { setQuote(priced); setQuoteError(""); } })
      .catch((error) => { if (active) { setQuote(null); setQuoteError(error.message); } })
      .finally(() => { if (active) setQuoteLoading(false); });
    return () => { active = false; };
  }, [couponCode]);

  useEffect(() => {
    // quoteSignature rather than cartItems: the object identity changes on every render path that
    // touches the bag, and re-quoting on identity alone loops.
    const cancel = refreshQuote();
    const refresh = () => refreshQuote();
    // An administrator activating or editing an offer changes the answer without the bag changing.
    window.addEventListener("shades:offer-changed", refresh);
    window.addEventListener("shades:products-changed", refresh);
    return () => {
      cancel();
      window.removeEventListener("shades:offer-changed", refresh);
      window.removeEventListener("shades:products-changed", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteSignature, refreshQuote, product_list.length]);
  const toggleWishlist = async (productId) => {
    if (!accessToken) throw new Error("Please sign in to save products.");
    const wishlist = isWishlisted(productId)
      ? await removeWishlistItem(accessToken, productId)
      : await addWishlistItem(accessToken, productId);
    setWishlistItems(wishlist.items || []);
    return wishlist;
  };

  const clearCartState = () => { replaceCartItems({}); setAppliedOffer(null); setCartError(""); setQuote(null); };

  return <StoreContext.Provider value={{ product_list, productsLoading, productsError, refreshProducts, categories, cartItems, setCartItems:replaceCartItems, addToCart, removeFromCart, removeLineFromCart, getCartCount, getTotalCartAmount, appliedOffer, setAppliedOffer, cartError, cartSyncing: cartOperations > 0, clearCartState, wishlistItems, wishlistLoading, isWishlisted, toggleWishlist, quote, quoteLoading, quoteError, refreshQuote }}>{children}</StoreContext.Provider>;
};

export default StoreContextProvider;
