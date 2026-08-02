import React, { useContext } from "react";
import "./ProductCard.css";
import { Link, useNavigate } from "react-router-dom";
import { assets } from "../../assets/assets";
import { StoreContext } from "../../context/StoreContext";
import { useAuth } from "../../context/AuthContext";

const ProductCard = ({ id, name, price, image, color, isNew }) => {
  const { cartItems, addToCart, removeFromCart, isWishlisted, toggleWishlist } = useContext(StoreContext);
  const { user } = useAuth();
  const navigate = useNavigate();
  const count = cartItems[id] || 0;
  const saved = isWishlisted(id);
  const save = async () => { if (!user) return navigate("/signin"); try { await toggleWishlist(id); } catch (error) { window.alert(error.message); } };

  return (
    <div className="product-card">
      <button className={`wishlist-heart ${saved ? "saved" : ""}`} onClick={save} aria-label={saved ? `Remove ${name} from wishlist` : `Add ${name} to wishlist`}>{saved ? "♥" : "♡"}</button>
      <Link to={`/product/${id}`} className="product-card-link">
        <div className="product-card-image">
          <img src={image} alt={name} />
          {isNew && <span className="new-badge">New</span>}
        </div>
      </Link>

      <div className="product-card-info">
        <Link to={`/product/${id}`}>
          <p className="product-name">{name}</p>
        </Link>
        {color && <p className="product-color">{color}</p>}
        <p className="product-price">₹{price.toLocaleString("en-IN")}</p>

        <div className="product-card-actions">
          {count === 0 ? (
            <button className="add-to-bag" onClick={() => addToCart(id)}>
              Add to bag
            </button>
          ) : (
            <div className="qty-control">
              <button onClick={() => removeFromCart(id)}>
                <img src={assets.remove_icon_red} alt="Remove" />
              </button>
              <span>{count}</span>
              <button onClick={() => addToCart(id)}>
                <img src={assets.add_icon_green} alt="Add" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductCard;
