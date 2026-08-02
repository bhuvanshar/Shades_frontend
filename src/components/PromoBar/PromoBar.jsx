import React, { useState } from "react";
import "./PromoBar.css";

const PromoBar = () => {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div className="promo-bar">
      <p>
        Free shipping on orders over ₹1500 &nbsp;·&nbsp; 30-day easy returns
      </p>
      <button className="promo-close" onClick={() => setVisible(false)} aria-label="Close">
        ✕
      </button>
    </div>
  );
};

export default PromoBar;
