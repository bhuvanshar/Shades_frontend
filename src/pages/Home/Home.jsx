import React, { useState } from "react";
import "./Home.css";
import Hero from "../../components/Hero/Hero";
import CategoryFilter from "../../components/CategoryFilter/CategoryFilter";
import ProductGrid from "../../components/ProductGrid/ProductGrid";
import CollectionShowcase from "../../components/CollectionShowcase/CollectionShowcase";
import TrustStrip from "../../components/TrustStrip/TrustStrip";

const Home = () => {
  const [category, setCategory] = useState("All");

  return (
    <div className="home">
      <Hero />
      <CategoryFilter category={category} setCategory={setCategory} />
      <ProductGrid category={category} />
      <CollectionShowcase setCategory={setCategory} />
      <TrustStrip />
    </div>
  );
};

export default Home;
