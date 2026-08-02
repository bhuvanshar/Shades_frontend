import React from "react";
import "./CollectionShowcase.css";

const CollectionShowcase = ({ setCategory }) => {
  return (
    <section className="collections" id="collections">
      <div className="container">
        <h2 className="collections-heading">Collections</h2>
        <div className="collections-grid">
          <div
            className="collection-card"
            onClick={() => setCategory("Polarized")}
          >
            <div className="collection-card-bg" style={{ background: "#2c2c2c" }} />
            <div className="collection-card-content">
              <span className="collection-eyebrow">Explore</span>
              <h3>Polarized</h3>
              <p>Maximum clarity. Reduced glare. Pure vision.</p>
              <span className="collection-link">Shop polarized →</span>
            </div>
          </div>

          <div
            className="collection-card"
            onClick={() => setCategory("Blue Light")}
          >
            <div className="collection-card-bg" style={{ background: "var(--bg-sand)" }} />
            <div className="collection-card-content dark-text">
              <span className="collection-eyebrow">Explore</span>
              <h3>Blue light</h3>
              <p>Protect your eyes during long screen sessions.</p>
              <span className="collection-link">Shop blue light →</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CollectionShowcase;
