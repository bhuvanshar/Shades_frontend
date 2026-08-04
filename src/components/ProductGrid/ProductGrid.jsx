import React, { useContext, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import "./ProductGrid.css";
import { StoreContext } from "../../context/StoreContext";
import ProductCard from "../ProductCard/ProductCard";

const text = (value) => String(value || "").trim().toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const SORTS = new Set(["featured", "newest", "price-low", "price-high", "name"]);

const ProductGrid = ({ category }) => {
  const { product_list, productsLoading, productsError } = useContext(StoreContext);
  const [params, setParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const query = params.get("q") || "";
  const brand = params.get("brand") || "All";
  const color = params.get("color") || "All";
  const availability = params.get("availability") === "in-stock" ? "in-stock" : "all";
  const requestedSort = params.get("sort") || "featured";
  const sort = SORTS.has(requestedSort) ? requestedSort : "featured";
  const minPrice = params.get("minPrice") || "";
  const maxPrice = params.get("maxPrice") || "";

  const setFilter = (name, value, defaultValue = "") => {
    const next = new URLSearchParams(params);
    if (!value || value === defaultValue) next.delete(name);
    else next.set(name, value);
    setParams(next, { replace: true });
  };
  const reset = () => setParams(new URLSearchParams(), { replace: true });

  const brands = useMemo(
    () => ["All", ...new Set(product_list.map((item) => item.brand).filter(Boolean))].sort(),
    [product_list]
  );
  const colors = useMemo(
    () => ["All", ...new Set(product_list.flatMap((item) => item.variants || []).map((variant) => variant.attributes?.color || variant.variantName).filter(Boolean))].sort(),
    [product_list]
  );
  const filtered = useMemo(() => {
    const terms = text(query).split(/\s+/).filter(Boolean);
    const parsedLow = minPrice === "" ? null : Number(minPrice);
    const parsedHigh = maxPrice === "" ? null : Number(maxPrice);
    const low = Number.isFinite(parsedLow) && parsedLow >= 0 ? parsedLow : null;
    const high = Number.isFinite(parsedHigh) && parsedHigh >= 0 ? parsedHigh : null;
    if (low !== null && high !== null && low > high) return [];
    return product_list.filter((item) => {
      const searchable = [item.name, item.brand, item.description, ...item.categories.map((entry) => entry.categoryName), ...item.variants.flatMap((variant) => [variant.variantName, variant.sku, ...Object.values(variant.attributes || {})])].map(text).join(" ");
      const productColors = item.variants.map((variant) => text(variant.attributes?.color || variant.variantName));
      return (category === "All" || item.categories.some((entry) => entry.categoryName === category))
        && (terms.length === 0 || terms.every((term) => searchable.includes(term))) && (brand === "All" || item.brand === brand)
        && (color === "All" || productColors.includes(text(color)))
        && (availability !== "in-stock" || item.available)
        && (low === null || item.price >= low) && (high === null || item.price <= high);
    }).sort((a, b) => {
      if (sort === "price-low") return a.price - b.price;
      if (sort === "price-high") return b.price - a.price;
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "newest") return Number(b.isNew) - Number(a.isNew) || Number(b.productId) - Number(a.productId);
      return Number(b.available) - Number(a.available) || Number(b.productId) - Number(a.productId);
    });
  }, [availability, brand, category, color, maxPrice, minPrice, product_list, query, sort]);
  const invalidPriceRange = minPrice !== "" && maxPrice !== "" && Number(minPrice) > Number(maxPrice);
  const activeFilters = [query, brand !== "All", color !== "All", availability !== "all", minPrice, maxPrice, category !== "All"].filter(Boolean).length;

  return (
    <section className="product-grid">
      <div className="container">
        <div className="discovery-bar">
          <div><span>Product discovery</span><strong aria-live="polite">{productsLoading ? "Loading…" : `${filtered.length} style${filtered.length === 1 ? "" : "s"}`}</strong></div>
          <label className="discovery-search"><span aria-hidden="true">⌕</span><input aria-label="Search products" value={query} onChange={(event) => setFilter("q", event.target.value)} placeholder="Search frames, brands, colors or SKU" /></label>
          <button type="button" className="filter-toggle" aria-expanded={filtersOpen} aria-controls="product-filters" onClick={() => setFiltersOpen((value) => !value)}>Filters{activeFilters ? ` (${activeFilters})` : ""}</button>
          <select aria-label="Sort products" value={sort} onChange={(event) => setFilter("sort", event.target.value, "featured")}><option value="featured">Featured</option><option value="newest">Newest</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="name">Name A–Z</option></select>
        </div>
        <div className={`discovery-layout ${filtersOpen ? "filters-open" : ""}`}>
          <aside id="product-filters" className="discovery-filters">
            <header><strong>Refine collection</strong>{activeFilters > 0 && <button type="button" onClick={reset}>Clear all</button>}</header>
            <label>Brand<select value={brand} onChange={(event) => setFilter("brand", event.target.value, "All")}>{brands.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label>Color<select value={color} onChange={(event) => setFilter("color", event.target.value, "All")}>{colors.map((value) => <option key={value}>{value}</option>)}</select></label>
            <fieldset><legend>Price range</legend><div><label>Minimum<input type="number" min="0" value={minPrice} onChange={(event) => setFilter("minPrice", event.target.value)} placeholder="₹ 0" /></label><label>Maximum<input type="number" min="0" value={maxPrice} onChange={(event) => setFilter("maxPrice", event.target.value)} placeholder="Any" /></label></div></fieldset>
            <label className="stock-filter"><input type="checkbox" checked={availability === "in-stock"} onChange={(event) => setFilter("availability", event.target.checked ? "in-stock" : "", "all")} /> In-stock styles only</label>
            {invalidPriceRange && <p className="filter-error" role="alert">Minimum price cannot exceed maximum price.</p>}
          </aside>
          <div className="discovery-results">
            <div className="product-grid-list">{!productsLoading && !productsError && filtered.map((item) => <ProductCard key={item._id} id={item._id} name={item.name} price={item.price} image={item.image} color={item.color} isNew={item.isNew} variantId={item.defaultVariantId} available={item.available} />)}</div>
            {productsLoading && <p className="no-products">Loading the collection…</p>}
            {productsError && <p className="no-products" role="alert">The collection could not be loaded. Please try again shortly.</p>}
            {!productsLoading && !productsError && filtered.length === 0 && <div className="discovery-empty"><span>SW</span><h3>No matching styles</h3><p>{invalidPriceRange ? "Correct the price range to continue." : "Try removing a filter or searching with broader terms."}</p><button type="button" onClick={reset}>Reset discovery</button></div>}
          </div>
        </div>
      </div>
    </section>
  );
};
export default ProductGrid;
