import React from "react";
import "./Footer.css";
import { assets } from "../../assets/assets";
import BrandWordmark from "../BrandWordmark/BrandWordmark";

const Footer = () => {
  return (
    <footer className="footer" id="footer">
      <div className="footer-inner">
        <div className="footer-col footer-brand">
          <BrandWordmark light />
          <p className="footer-tagline">
            Premium eyewear designed in India for the bold and the curious.
          </p>
          <div className="footer-social">
            <a href="#" aria-label="Facebook">
              <img src={assets.facebook_icon} alt="" />
            </a>
            <a href="#" aria-label="Twitter">
              <img src={assets.twitter_icon} alt="" />
            </a>
            <a href="#" aria-label="LinkedIn">
              <img src={assets.linkedin_icon} alt="" />
            </a>
          </div>
        </div>

        <div className="footer-col">
          <h4>Shop</h4>
          <ul>
            <li><a href="#shop">Sunglasses</a></li>
            <li><a href="#shop">Blue Light</a></li>
            <li><a href="#shop">Polarized</a></li>
            <li><a href="#shop">New Arrivals</a></li>
          </ul>
        </div>

        <div className="footer-col">
          <h4>Help</h4>
          <ul>
            <li><a href="#">Shipping &amp; Returns</a></li>
            <li><a href="#">FAQ</a></li>
            <li><a href="#">Size Guide</a></li>
            <li><a href="#">Contact Us</a></li>
          </ul>
        </div>

        <div className="footer-col">
          <h4>Newsletter</h4>
          <p className="newsletter-desc">
            Get 10% off your first order and stay updated on new drops.
          </p>
          <div className="newsletter-input">
            <input type="email" placeholder="Your email" />
            <button>Subscribe</button>
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <p>&copy; 2026 Shades World Barcelona. All rights reserved.</p>
      </div>
    </footer>
  );
};

export default Footer;
