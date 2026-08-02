import React, { useContext } from "react";
import "./ProductGrid.css";
import { StoreContext } from "../../context/StoreContext";
import ProductCard from "../ProductCard/ProductCard";

const ProductGrid = ({ category }) => {
  const { product_list, productsLoading, productsError } = useContext(StoreContext);

  const filtered =
    category === "All"
      ? product_list
      : product_list.filter((item) => item.categories.some((entry) => entry.categoryName === category));

  return (
    <section className="product-grid">
      <div className="container">
        <div className="product-grid-list">
          {!productsLoading && !productsError && filtered.map((item) => (
            <ProductCard
              key={item._id}
              id={item._id}
              name={item.name}
              price={item.price}
              image={item.image}
              color={item.color}
              isNew={item.isNew}
            />
          ))}
        </div>

        {productsLoading && <p className="no-products">Loading the collection…</p>}
        {productsError && <p className="no-products">The collection could not be loaded. Please try again shortly.</p>}

        {!productsLoading && !productsError && filtered.length === 0 && (
          <p className="no-products">
            No products found in this category.
          </p>
        )}
      </div>
    </section>
  );
};

export default ProductGrid;
