import React, { useContext, useState } from "react";
import "./Navbar.css";
import { assets } from "../../assets/assets";
import { Link } from "react-router-dom";
import { StoreContext } from "../../context/StoreContext";
import { useAuth } from "../../context/AuthContext";
import BrandWordmark from "../BrandWordmark/BrandWordmark";

const Navbar = () => {
  const [menu, setMenu] = useState("home");
  const [mobileOpen, setMobileOpen] = useState(false);
  const { getCartCount } = useContext(StoreContext);
  const { user, isAdmin, signOut } = useAuth();

  const cartCount = getCartCount();

  const closeMenu = () => setMobileOpen(false);

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <button
          className="hamburger"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Menu"
        >
          <span className={mobileOpen ? "open" : ""} />
          <span className={mobileOpen ? "open" : ""} />
          <span className={mobileOpen ? "open" : ""} />
        </button>

        <Link to="/" className="logo-link" onClick={closeMenu}>
          <BrandWordmark compact />
        </Link>

        <ul className={`navbar-menu ${mobileOpen ? "open" : ""}`}>
          <li>
            <Link
              to="/"
              onClick={() => { setMenu("home"); closeMenu(); }}
              className={menu === "home" ? "active" : ""}
            >
              Home
            </Link>
          </li>
          <li>
            <Link
              to="/#shop"
              onClick={() => { setMenu("shop"); closeMenu(); }}
              className={menu === "shop" ? "active" : ""}
            >
              Shop
            </Link>
          </li>
          <li>
            <Link
              to="/#collections"
              onClick={() => { setMenu("collections"); closeMenu(); }}
              className={menu === "collections" ? "active" : ""}
            >
              Collections
            </Link>
          </li>
          <li>
            <Link
              to="/#footer"
              onClick={() => { setMenu("contact"); closeMenu(); }}
              className={menu === "contact" ? "active" : ""}
            >
              Contact
            </Link>
          </li>
          {user && !isAdmin && <li><Link to="/my-orders" onClick={() => { setMenu("orders"); closeMenu(); }} className={menu === "orders" ? "active" : ""}>My Orders</Link></li>}
        </ul>

        {mobileOpen && (
          <div className="mobile-overlay" onClick={closeMenu} />
        )}

        <div className="navbar-right">
          <img
            src={assets.search_icon}
            alt="Search"
            className="nav-icon"
          />
          <div className="cart-icon-wrapper">
            <Link to="/cart">
              <img
                src={assets.basket_icon}
                alt="Cart"
                className="nav-icon"
              />
            </Link>
            {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
          </div>
          {user ? (
            <div className="nav-user">
              {isAdmin && <Link to="/admin" className="nav-admin-link">Admin</Link>}
              <span>Hi, {user.name?.split(" ")[0]}</span>
              <button className="nav-account" onClick={signOut}>Sign out</button>
            </div>
          ) : <Link className="nav-account" to="/signin">Sign in</Link>}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
