import React from "react";
import "./Hero.css";
import { assets } from "../../assets/assets";

const Hero = () => {
  return (
    <section className="hero">
      <div className="hero-image">
        <img src={assets.hero_img} alt="Shades World sunglasses overlooking Barcelona" />
      </div>
      <div className="hero-overlay">
        <span className="hero-tag">Barcelona collection 2026</span>
        <h1>See the world<br />your way</h1>
        <p>Premium eyewear crafted for the bold and the curious</p>
        <a href="#shop" className="hero-cta">
          Shop now
        </a>
      </div>
    </section>
  );
};

export default Hero;
