import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import {
  addProductVariant, adjustInventory, createProduct, deleteProductImage, deleteProductVariant,
  getAdminProducts, getCategories, removeProduct, reorderProductImages, setPrimaryProductImage,
  setProductActive, updateProduct, updateProductImage, uploadProductImage,
} from "../../services/api";
import "./AdminProducts.css";
import useConfirmAction from "../../hooks/useConfirmAction";

const newVariant = () => ({ clientId: crypto.randomUUID(), sku: "", variantName: "", color: "", lensColor: "", price: "", quantityAvailable: "0", lowStockThreshold: "5", files: [], imageDescription: "" });
/** Mirrors app.catalog.max-product-images. The server enforces it; this only avoids a doomed upload. */
const MAX_PRODUCT_IMAGES = 10;
const emptyProduct = () => ({ productName: "", productDescription: "", brand: "Shades World", basePrice: "", categoryIds: [], attributes: { frame_material: "", frame_shape: "", uv_protection: "UV400", polarization: "" } });
const storefrontCategoryNames = ["Men", "Women", "Unisex", "Accessory"];

export default function AdminProducts() {
  const { accessToken } = useAuth();
  const confirmAction = useConfirmAction();
  const [products, setProducts] = useState([]); const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true); const [query, setQuery] = useState(""); const [status, setStatus] = useState("all"); const [category, setCategory] = useState("all");
  const [formOpen, setFormOpen] = useState(false); const [editing, setEditing] = useState(null); const [form, setForm] = useState(emptyProduct()); const [draftVariants, setDraftVariants] = useState([newVariant()]);
  const [productFiles, setProductFiles] = useState([]); const [productImageDescription, setProductImageDescription] = useState("");
  const [selected, setSelected] = useState(null); const [variant, setVariant] = useState(newVariant()); const [upload, setUpload] = useState({ files: [], altText: "", variantId: "", isPrimary: false }); const [stockInputs, setStockInputs] = useState({});
  const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  // {done, total, name} while a batch is in flight. Null otherwise — an admin uploading eight
  // photos over a slow link otherwise gets a frozen dialog with no evidence anything is happening.
  const [uploadProgress, setUploadProgress] = useState(null);
  const [altDrafts, setAltDrafts] = useState({});

  const load = useCallback(async () => { setLoading(true); setError(""); try { const [page, list] = await Promise.all([getAdminProducts(accessToken), getCategories()]); setProducts(page.content || []); setCategories((list || []).filter((item) => storefrontCategoryNames.includes(item.categoryName))); } catch (e) { setError(e.message); } finally { setLoading(false); } }, [accessToken]);
  useEffect(() => { load(); }, [load]);
  const filtered = useMemo(() => products.filter((p) => { const term = query.trim().toLowerCase(); return (!term || p.productName?.toLowerCase().includes(term) || p.brand?.toLowerCase().includes(term) || p.variants?.some((v) => v.sku.toLowerCase().includes(term))) && (status === "all" || (status === "active" ? p.isActive : !p.isActive)) && (category === "all" || p.categories?.some((c) => String(c.categoryId) === category)); }), [products, query, status, category]);
  const totalStock = (p) => p.variants?.reduce((sum, v) => sum + Number(v.quantityAvailable || 0), 0) || 0;
  const lowStock = (p) => p.variants?.some((v) => v.isActive && v.quantityAvailable <= v.lowStockThreshold);
  const primaryImage = (p) => p.images?.find((i) => i.isPrimary) || p.images?.[0];
  const updateForm = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const updateAttribute = (field, value) => setForm((current) => ({ ...current, attributes: { ...current.attributes, [field]: value } }));
  const toggleCategory = (id) => setForm((current) => ({ ...current, categoryIds: [id] }));
  const updateDraft = (clientId, field, value) => setDraftVariants((current) => current.map((v) => v.clientId === clientId ? { ...v, [field]: value } : v));

  const openCreate = () => { setEditing(null); setForm(emptyProduct()); setDraftVariants([newVariant()]); setProductFiles([]); setProductImageDescription(""); setFormOpen(true); setSelected(null); setError(""); };
  const openEdit = (product) => { const first = product.variants?.[0]; setEditing(product); setForm({ productName: product.productName, productDescription: product.productDescription || "", brand: product.brand || "", basePrice: product.basePrice, categoryIds: product.categories?.map((c) => c.categoryId) || [], attributes: { ...emptyProduct().attributes, ...(product.attributes || {}) } }); setDraftVariants([first ? { clientId: String(first.variantId), variantId: first.variantId, sku: first.sku, variantName: first.variantName || "", color: first.attributes?.color || "", lensColor: first.attributes?.lens_color || "", price: first.price, quantityAvailable: first.quantityAvailable, lowStockThreshold: first.lowStockThreshold, files: [], imageDescription: "" } : newVariant()]); setProductFiles([]); setFormOpen(true); setSelected(null); };
  const variantPayload = (v) => ({ variantId: v.variantId, sku: v.sku.trim(), variantName: v.variantName || v.color || "Default", price: Number(v.price), quantityAvailable: Number(v.quantityAvailable), lowStockThreshold: Number(v.lowStockThreshold), attributes: { color: v.color, lens_color: v.lensColor } });
  /**
   * Uploads files one at a time, reporting progress and surviving a partial failure.
   *
   * Sequential rather than Promise.all on purpose: DISPLAY_ORDER is assigned per request, and
   * concurrent uploads land in a nondeterministic order, so a batch could come back shuffled. It
   * also keeps one oversized file from being reported alongside four unrelated successes.
   *
   * A failure part-way through does NOT roll back the files already stored — those are real images
   * the admin uploaded and would have to re-pick. The caller is told which file failed and how many
   * landed, and can retry just the remainder.
   */
  const uploadFiles = async (productId, files, altText, variantId, primary = false, startOrder = 0) => {
    const failures = [];
    for (let index = 0; index < files.length; index += 1) {
      setUploadProgress({ done: index, total: files.length, name: files[index].name });
      try {
        await uploadProductImage(accessToken, productId, files[index], { altText, variantId, displayOrder: startOrder + index, isPrimary: primary && index === 0 });
      } catch (e) {
        failures.push(`${files[index].name}: ${e.message}`);
      }
    }
    setUploadProgress(null);
    if (failures.length) {
      const error = new Error(`${failures.length} of ${files.length} photo(s) failed — ${failures.join("; ")}`);
      error.partial = failures.length < files.length;
      throw error;
    }
  };

  const saveProduct = async (event) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      if (form.categoryIds.length !== 1) throw new Error("Select one category: Men, Women, Unisex, or Accessory.");
      if (!draftVariants.length) throw new Error("Add at least one product variant.");
      const payload = { ...form, basePrice: Number(form.basePrice), attributes: Object.fromEntries(Object.entries(form.attributes).filter(([, value]) => value)), initialVariant: variantPayload(draftVariants[0]) };
      let saved = editing ? await updateProduct(accessToken, editing.productId, payload) : await createProduct(accessToken, payload);
      if (!editing) {
        const createdVariants = [saved.variants?.[0]];
        for (const draft of draftVariants.slice(1)) createdVariants.push(await addProductVariant(accessToken, saved.productId, variantPayload(draft)));
        await uploadFiles(saved.productId, productFiles, productImageDescription || `${saved.productName} product image`, null, true);
        for (let index = 0; index < draftVariants.length; index += 1) { const draft = draftVariants[index]; const created = createdVariants[index]; if (created && draft.files.length) await uploadFiles(saved.productId, draft.files, draft.imageDescription || `${saved.productName} ${draft.color || draft.variantName}`, created.variantId); }
      } else {
        if (productFiles.length) await uploadFiles(saved.productId, productFiles, productImageDescription || `${saved.productName} product image`, null, !saved.images?.some((i) => i.isPrimary));
        // Additional photos for an existing colourway. displayOrder continues from what that
        // variant already has, so a second upload appends rather than tying with the first —
        // the gallery orders on (DISPLAY_ORDER, IMAGE_ID) and a tie would be resolved by id alone.
        for (const draft of draftVariants) {
          if (!draft.variantId || !draft.files.length) continue;
          const existing = (saved.images || []).filter((image) => image.variantId === draft.variantId).length;
          await uploadFiles(saved.productId, draft.files, draft.imageDescription || `${saved.productName} ${draft.color || draft.variantName}`, draft.variantId, false, existing);
        }
      }
      await load(); setFormOpen(false); setEditing(null); setNotice(`${saved.productName} was ${editing ? "updated" : "created"}.`);
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  const toggleActive = (product) => { const active = !product.isActive; return confirmAction.ask({
    title: `${active ? "Activate" : "Deactivate"} this product?`,
    body: <p><strong>{product.productName}</strong> will {active ? "become visible in the storefront" : "be hidden from the storefront. Existing orders are unaffected"}.</p>,
    confirmLabel: active ? "Activate" : "Deactivate",
    busyLabel: "Saving…",
    run: async () => { const updated = await setProductActive(accessToken, product.productId, active); setProducts((current) => current.map((p) => p.productId === updated.productId ? updated : p)); },
  }); };
  const remove = (product) => confirmAction.ask({
    title: "Permanently remove this product?",
    body: <p><strong>{product.productName}</strong> will be removed permanently. This cannot be undone.</p>,
    confirmLabel: "Remove permanently",
    busyLabel: "Removing…",
    run: async () => { await removeProduct(accessToken, product.productId); setProducts((current) => current.filter((p) => p.productId !== product.productId)); },
  });
  const syncSelected = (updated) => { setSelected(updated); setProducts((current) => current.map((p) => p.productId === updated.productId ? updated : p)); };

  /**
   * Replaces the open product's image list from the server's answer, functionally.
   *
   * Deliberately not `syncSelected({ ...selected, images })`: `selected` there is the value captured
   * when the handler was created, so two image requests in flight at once made the second one write
   * back the first one's stale array. Concretely — caption an image while a "make primary" response
   * is still landing, and the previous primary reappeared in the list even though the database had
   * already moved on. The list then disagreed with the server until the dialog was reopened.
   */
  const applyImages = (productId, images) => {
    setSelected((current) => (current && current.productId === productId ? { ...current, images } : current));
    setProducts((current) => current.map((p) => (p.productId === productId ? { ...p, images } : p)));
  };
  const addVariant = async (event) => { event.preventDefault(); setSaving(true); try { const created = await addProductVariant(accessToken, selected.productId, variantPayload(variant)); if (variant.files.length) await uploadFiles(selected.productId, variant.files, variant.imageDescription || `${selected.productName} ${variant.color || variant.variantName}`, created.variantId); await load(); setSelected(null); setVariant(newVariant()); setNotice("Variant and photos added."); } catch (e) { setError(e.message); } finally { setSaving(false); } };
  const removeVariant = (item) => confirmAction.ask({
    title: "Delete this variant?",
    body: <p>Variant <strong>{item.sku}</strong> and its photos will be deleted from this product.</p>,
    confirmLabel: "Delete variant",
    busyLabel: "Deleting…",
    run: async () => { await deleteProductVariant(accessToken, selected.productId, item.variantId); syncSelected({ ...selected, variants: selected.variants.filter((v) => v.variantId !== item.variantId), images: selected.images.filter((i) => i.variantId !== item.variantId) }); },
  });
  const changeStock = async (item) => { const amount = Number(stockInputs[item.variantId] || 0); if (!amount) return; try { await adjustInventory(accessToken, item.variantId, String(amount), "ADJUSTMENT", "Admin product adjustment"); const variants = selected.variants.map((v) => v.variantId === item.variantId ? { ...v, quantityAvailable: v.quantityAvailable + amount } : v); syncSelected({ ...selected, variants }); setStockInputs((c) => ({ ...c, [item.variantId]: "" })); } catch (e) { setError(e.message); } };
  const addImages = async (event) => {
    event.preventDefault();
    // Duplicate-submit guard. The disabled button is not enough on its own: Enter in a text input
    // submits the form directly, and a double-tap can queue two submits before React re-renders —
    // which used to upload every file twice.
    if (saving) return;
    const room = MAX_PRODUCT_IMAGES - (selected.images?.length || 0);
    if (upload.files.length > room) {
      // Refused outright rather than truncated: silently dropping the last three of eight files is
      // indistinguishable from an upload that worked.
      setError(room <= 0
        ? `This product already has the maximum of ${MAX_PRODUCT_IMAGES} images. Remove one before adding another.`
        : `Only ${room} more image(s) can be added — you selected ${upload.files.length}. The limit is ${MAX_PRODUCT_IMAGES} per product.`);
      return;
    }
    setSaving(true); setError("");
    try {
      await uploadFiles(selected.productId, upload.files, upload.altText || `${selected.productName} image`, upload.variantId ? Number(upload.variantId) : null, upload.isPrimary);
      const page = await getAdminProducts(accessToken);
      setProducts(page.content || []);
      const fresh = (page.content || []).find((p) => p.productId === selected.productId);
      // The manage dialog stays open on the refreshed product rather than closing, so the admin can
      // see what landed, reorder it and pick a primary without reopening.
      if (fresh) setSelected(fresh);
      setUpload({ files: [], altText: "", variantId: "", isPrimary: false });
      setNotice("Photos uploaded.");
    } catch (e) {
      setError(e.message);
      // A partial failure still changed the product. Refresh so the dialog shows exactly what
      // stored, and the admin retries only the files that did not.
      if (e.partial) { const page = await getAdminProducts(accessToken); setProducts(page.content || []); const fresh = (page.content || []).find((p) => p.productId === selected.productId); if (fresh) setSelected(fresh); }
    } finally { setSaving(false); }
  };
  const removeImage = async (item) => { try { await deleteProductImage(accessToken, selected.productId, item.imageId); await load(); const fresh = (await getAdminProducts(accessToken)).content?.find((p) => p.productId === selected.productId); if (fresh) syncSelected(fresh); } catch (e) { setError(e.message); } };

  /**
   * Moves an image one place in the gallery.
   *
   * Buttons rather than drag-and-drop: dragging needs a pointer, so it is unusable on the tablet
   * the shop floor actually uses, and it is invisible to a keyboard. The whole resulting order is
   * sent — see reorderProductImages — so two admins reordering at once cannot interleave.
   */
  const moveImage = async (item, delta) => {
    const ordered = [...(selected.images || [])];
    const from = ordered.findIndex((image) => image.imageId === item.imageId);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ordered.length) return;
    [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
    const productId = selected.productId;
    // Optimistic, so the thumbnail moves under the admin's finger rather than after a round trip;
    // the server's answer replaces it, so a rejected reorder snaps back rather than lying.
    applyImages(productId, ordered);
    try {
      const saved = await reorderProductImages(accessToken, productId, ordered.map((image) => image.imageId));
      applyImages(productId, saved);
    } catch (e) { setError(e.message); await load(); }
  };

  const makePrimary = async (item) => {
    const productId = selected.productId;
    try {
      const saved = await setPrimaryProductImage(accessToken, productId, item.imageId);
      applyImages(productId, saved);
      setNotice("Primary image updated. Listing thumbnails now use it.");
    } catch (e) { setError(e.message); }
  };

  /**
   * Moves a photo onto a colourway, or back to being a general product shot.
   *
   * This is the real fix for "the Black glasses appear under Blue": that photo was uploaded as a
   * general product image, and a general image is shown for every colour by design. Rather than
   * hiding all general photos — which made five of six products display a single picture — an
   * admin files the photo against the colour it actually depicts, and it stops appearing elsewhere.
   *
   * variantId 0 is the API's "clear it" signal; omitting the field means "leave unchanged", so a
   * plain null could not express this.
   */
  const reassignImage = async (item, value) => {
    const productId = selected.productId;
    try {
      const saved = await updateProductImage(accessToken, productId, item.imageId, { variantId: value ? Number(value) : 0 });
      setSelected((current) => (current && current.productId === productId
        ? { ...current, images: current.images.map((image) => (image.imageId === saved.imageId ? saved : image)) }
        : current));
      setProducts((current) => current.map((p) => (p.productId === productId
        ? { ...p, images: (p.images || []).map((image) => (image.imageId === saved.imageId ? saved : image)) }
        : p)));
      setNotice(value ? "Photo is now shown only for that colour." : "Photo is now shown for every colour.");
    } catch (e) { setError(e.message); }
  };

  const saveAlt = async (item) => {
    const altText = altDrafts[item.imageId];
    if (altText === undefined || altText === (item.altText || "")) return;
    const productId = selected.productId;
    try {
      const saved = await updateProductImage(accessToken, productId, item.imageId, { altText });
      // Patches just this image into whatever the list currently is, rather than replacing the
      // whole array with the one this handler closed over.
      setSelected((current) => (current && current.productId === productId
        ? { ...current, images: current.images.map((image) => (image.imageId === saved.imageId ? saved : image)) }
        : current));
      setProducts((current) => current.map((p) => (p.productId === productId
        ? { ...p, images: (p.images || []).map((image) => (image.imageId === saved.imageId ? saved : image)) }
        : p)));
      setAltDrafts((current) => { const next = { ...current }; delete next[item.imageId]; return next; });
      setNotice("Alt text saved.");
    } catch (e) { setError(e.message); }
  };

  return <section className="products-admin">
    {confirmAction.dialog}
    {error && <div className="admin-alert error">{error}</div>}{notice && <div className="admin-alert success">{notice}</div>}
    <div className="products-toolbar"><p>Create products with colors, stock and locally stored photography.</p><button onClick={openCreate}>+ Add product</button></div>
    <div className="product-admin-stats"><article><span>Displayed products</span><strong>{filtered.length}</strong></article><article><span>Active</span><strong>{filtered.filter((p) => p.isActive).length}</strong></article><article><span>Low stock</span><strong>{filtered.filter(lowStock).length}</strong></article><article><span>Displayed units</span><strong>{filtered.reduce((sum, p) => sum + totalStock(p), 0)}</strong></article></div>
    <div className="product-filters"><input placeholder="Search product, brand or SKU" value={query} onChange={(e) => setQuery(e.target.value)} /><select value={category} onChange={(e) => setCategory(e.target.value)}><option value="all">All categories</option>{categories.map((c) => <option key={c.categoryId} value={c.categoryId}>{c.categoryName}</option>)}</select><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
    <div className="product-admin-list">{loading ? <div className="products-empty">Loading catalog…</div> : filtered.length === 0 ? <div className="products-empty"><strong>No products found</strong><span>Add a product or change the filters.</span></div> : filtered.map((product) => <article className="product-admin-row" key={product.productId}><div className="product-admin-thumb">{primaryImage(product) ? <img src={primaryImage(product).imageUrl} alt="" /> : "SW"}</div><div className="product-admin-name"><strong>{product.productName}</strong><small>{product.brand || "No brand"} · {product.categories?.map((c) => c.categoryName).join(", ") || "Uncategorised"}</small></div><div><small>Base price</small><strong>₹{Number(product.basePrice).toLocaleString("en-IN")}</strong></div><div><small>Variants</small><strong>{product.variants?.length || 0}</strong></div><div><small>Stock</small><strong className={lowStock(product) ? "stock-low" : ""}>{totalStock(product)}</strong></div><span className={`product-state ${product.isActive ? "active" : "inactive"}`}>{product.isActive ? "Active" : "Inactive"}</span><div className="product-row-actions"><button onClick={() => setSelected(product)}>Manage</button><button onClick={() => openEdit(product)}>Edit</button><button onClick={() => toggleActive(product)}>{product.isActive ? "Deactivate" : "Activate"}</button><button className="danger" onClick={() => remove(product)}>Remove</button></div></article>)}</div>

    {formOpen && <div className="admin-modal-backdrop" onMouseDown={() => setFormOpen(false)}><form className="admin-product-modal product-create-modal" onSubmit={saveProduct} onMouseDown={(e) => e.stopPropagation()}><div className="modal-heading"><div><span>{editing ? "Update catalog item" : "New catalog item"}</span><h2>{editing ? "Edit product" : "Create product"}</h2></div><button type="button" onClick={() => setFormOpen(false)}>×</button></div><div className="product-form-grid"><label>Product name *<input value={form.productName} onChange={(e) => updateForm("productName", e.target.value)} required /></label><label>Brand<input value={form.brand} onChange={(e) => updateForm("brand", e.target.value)} /></label><label>Base price (₹) *<input type="number" min="0" step=".01" value={form.basePrice} onChange={(e) => updateForm("basePrice", e.target.value)} required /></label><label>Frame material<input value={form.attributes.frame_material} onChange={(e) => updateAttribute("frame_material", e.target.value)} /></label><label>Frame shape<input value={form.attributes.frame_shape} onChange={(e) => updateAttribute("frame_shape", e.target.value)} /></label><label>UV protection<input value={form.attributes.uv_protection} onChange={(e) => updateAttribute("uv_protection", e.target.value)} /></label><label className="wide">Description<textarea rows="4" value={form.productDescription} onChange={(e) => updateForm("productDescription", e.target.value)} /></label><fieldset className="wide"><legend>Categories</legend><div className="category-checks">{categories.map((c) => <label key={c.categoryId}><input type="checkbox" checked={form.categoryIds.includes(c.categoryId)} onChange={() => toggleCategory(c.categoryId)} />{c.categoryName}</label>)}</div></fieldset><fieldset className="wide"><legend>Product photos</legend><div className="photo-inputs"><input type="file" accept="image/jpeg,image/png,image/gif" multiple onChange={(e) => setProductFiles([...e.target.files])} /><input placeholder="Image description / alt text" value={productImageDescription} onChange={(e) => setProductImageDescription(e.target.value)} /></div><small>{productFiles.length} file(s) selected. Maximum 5 MB each.</small></fieldset><fieldset className="wide"><legend>Color variants</legend><div className="draft-variants">{draftVariants.map((v, index) => <div className="draft-variant" key={v.clientId}><div className="draft-variant-head"><strong>Variant {index + 1}</strong>{!editing && draftVariants.length > 1 && <button type="button" onClick={() => setDraftVariants((current) => current.filter((item) => item.clientId !== v.clientId))}>Remove</button>}</div><div className="variant-fields"><label>Color *<input value={v.color} onChange={(e) => updateDraft(v.clientId, "color", e.target.value)} placeholder="Blue" required /></label><label>Lens color<input value={v.lensColor} onChange={(e) => updateDraft(v.clientId, "lensColor", e.target.value)} placeholder="Smoke blue" /></label><label>SKU *<input value={v.sku} onChange={(e) => updateDraft(v.clientId, "sku", e.target.value)} required /></label><label>Variant name<input value={v.variantName} onChange={(e) => updateDraft(v.clientId, "variantName", e.target.value)} placeholder="Ocean Blue" /></label><label>Price (₹) *<input type="number" min="0" step=".01" value={v.price} onChange={(e) => updateDraft(v.clientId, "price", e.target.value)} required /></label><label>Stock *<input type="number" min="0" value={v.quantityAvailable} onChange={(e) => updateDraft(v.clientId, "quantityAvailable", e.target.value)} required /></label><label>Low-stock alert<input type="number" min="0" value={v.lowStockThreshold} onChange={(e) => updateDraft(v.clientId, "lowStockThreshold", e.target.value)} required /></label>{/* Shown when creating, and now also when editing a variant that already exists.
    It used to be create-only, so the single way to add a photo to an existing colourway was
    the separate Manage dialog — and with general photos no longer padding out a variant's
    gallery, a colourway needs its own photography to have more than one picture at all.
    `multiple` throughout: these are the variant's ADDITIONAL photos, not one hero shot. */}
{(!editing || v.variantId) && <><label>{editing ? "Add more photos for this colour" : "Variant photos"}<input type="file" accept="image/jpeg,image/png,image/gif" multiple onChange={(e) => updateDraft(v.clientId, "files", [...e.target.files])} /></label><label className="wide">Photo description<input value={v.imageDescription} onChange={(e) => updateDraft(v.clientId, "imageDescription", e.target.value)} placeholder={`${form.productName || "Product"} ${v.color || "color"}`} /></label>{v.files.length > 0 && <small className="wide">{v.files.length} photo(s) will be added to {v.color || v.variantName || "this colour"}.</small>}</>}</div></div>)}</div>{!editing && <button className="add-variant-button" type="button" onClick={() => setDraftVariants((current) => [...current, newVariant()])}>+ Add another color</button>}</fieldset></div><div className="modal-actions"><button type="button" onClick={() => setFormOpen(false)}>Cancel</button><button disabled={saving}>{saving ? "Saving product and photos…" : editing ? "Save changes" : "Create product"}</button></div></form></div>}

    {selected && <div className="admin-modal-backdrop" onMouseDown={() => setSelected(null)}><div className="admin-product-modal manage-modal" onMouseDown={(e) => e.stopPropagation()}><div className="modal-heading"><div><span>Catalog management</span><h2>{selected.productName}</h2></div><button onClick={() => setSelected(null)}>×</button></div><div className="manage-columns"><section><h3>Variants & inventory</h3><div className="variant-list">{selected.variants?.map((v) => <div className="variant-item" key={v.variantId}><div><strong>{v.variantName || v.sku} {v.attributes?.color && `· ${v.attributes.color}`}</strong><small>{v.sku} · ₹{v.price} · {v.quantityAvailable} units</small></div><div className="stock-adjust"><input type="number" placeholder="± qty" value={stockInputs[v.variantId] || ""} onChange={(e) => setStockInputs((c) => ({ ...c, [v.variantId]: e.target.value }))} /><button onClick={() => changeStock(v)}>Adjust</button><button className="danger" onClick={() => removeVariant(v)}>Delete</button></div></div>)}</div><form className="mini-form" onSubmit={addVariant}><h4>Add color variant</h4><input placeholder="Color" value={variant.color} onChange={(e) => setVariant({ ...variant, color: e.target.value })} required /><input placeholder="Lens color" value={variant.lensColor} onChange={(e) => setVariant({ ...variant, lensColor: e.target.value })} /><input placeholder="SKU" value={variant.sku} onChange={(e) => setVariant({ ...variant, sku: e.target.value })} required /><input placeholder="Variant name" value={variant.variantName} onChange={(e) => setVariant({ ...variant, variantName: e.target.value })} /><input type="number" placeholder="Price" min="0" value={variant.price} onChange={(e) => setVariant({ ...variant, price: e.target.value })} required /><input type="number" placeholder="Opening stock" min="0" value={variant.quantityAvailable} onChange={(e) => setVariant({ ...variant, quantityAvailable: e.target.value })} required /><input type="file" accept="image/jpeg,image/png,image/gif" multiple onChange={(e) => setVariant({ ...variant, files: [...e.target.files] })} /><input placeholder="Photo description" value={variant.imageDescription} onChange={(e) => setVariant({ ...variant, imageDescription: e.target.value })} /><button disabled={saving}>Add variant</button></form></section><section><h3>Product & variant photos</h3><p className="image-count">{selected.images?.length || 0} of {MAX_PRODUCT_IMAGES} images · the first is the primary and is what listings show</p>
      <ol className="admin-image-editor">{selected.images?.map((image, index) => <li key={image.imageId} className={image.isPrimary ? "is-primary" : ""}>
        <img src={image.imageUrl} alt={image.altText || "Product"} loading="lazy" />
        <div className="admin-image-meta">
          <span className="admin-image-position">{index + 1}{image.isPrimary && <em>Primary</em>}</span>
          {/* Which colours this photo is shown for. A general photo appears in every colourway's
              gallery, which is right for a case or a lens detail and wrong for a shot of one
              specific pair — so this is editable in place rather than fixed at upload time. */}
          <select className="admin-image-scope" aria-label={`Shown for image ${index + 1}`}
            value={image.variantId ? String(image.variantId) : ""}
            onChange={(e) => reassignImage(image, e.target.value)}>
            <option value="">Shown for every colour</option>
            {selected.variants?.map((v) => <option key={v.variantId} value={v.variantId}>Only {v.attributes?.color || v.variantName || v.sku}</option>)}
          </select>
          {/* Alt text is edited in place and saved on blur: never lost by closing the dialog, and
              not a request per keystroke. */}
          <input aria-label={`Alt text for image ${index + 1}`} placeholder="Describe this photo"
            value={altDrafts[image.imageId] ?? image.altText ?? ""}
            onChange={(e) => setAltDrafts((current) => ({ ...current, [image.imageId]: e.target.value }))}
            onBlur={() => saveAlt(image)} />
          <div className="admin-image-actions">
            <button type="button" onClick={() => moveImage(image, -1)} disabled={index === 0} aria-label={`Move image ${index + 1} earlier`}>↑</button>
            <button type="button" onClick={() => moveImage(image, 1)} disabled={index === (selected.images.length - 1)} aria-label={`Move image ${index + 1} later`}>↓</button>
            <button type="button" onClick={() => makePrimary(image)} disabled={image.isPrimary}>{image.isPrimary ? "Primary" : "Make primary"}</button>
            <button type="button" className="danger" onClick={() => removeImage(image)} aria-label={`Remove image ${index + 1}`}>Remove</button>
          </div>
        </div>
      </li>)}</ol>
      {!selected.images?.length && <p className="products-empty">No photos yet. Upload one below — the first becomes the primary automatically.</p>}<form className="mini-form image-form" onSubmit={addImages}><h4>Upload photos</h4><input className="wide" type="file" accept="image/jpeg,image/png,image/gif" multiple onChange={(e) => setUpload({ ...upload, files: [...e.target.files] })} required /><input className="wide" placeholder="Image description / alt text" value={upload.altText} onChange={(e) => setUpload({ ...upload, altText: e.target.value })} required /><select value={upload.variantId} onChange={(e) => setUpload({ ...upload, variantId: e.target.value })}><option value="">General product photo</option>{selected.variants?.map((v) => <option key={v.variantId} value={v.variantId}>{v.attributes?.color || v.variantName || v.sku}</option>)}</select><label><input type="checkbox" checked={upload.isPrimary} onChange={(e) => setUpload({ ...upload, isPrimary: e.target.checked })} />Primary product image</label>
      {upload.files.length > 0 && <small>{upload.files.length} file(s) selected · JPEG, PNG or GIF · 5 MB each</small>}
      {uploadProgress && <p className="upload-progress" role="status">Uploading {uploadProgress.done + 1} of {uploadProgress.total} — {uploadProgress.name}</p>}
      <button disabled={saving || (selected.images?.length || 0) >= MAX_PRODUCT_IMAGES}>{saving ? "Uploading…" : "Upload photos"}</button></form></section></div></div></div>}
  </section>;
}
