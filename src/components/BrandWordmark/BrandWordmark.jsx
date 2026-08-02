import "./BrandWordmark.css";

const BrandWordmark = ({ light = false, compact = false }) => (
  <span className={`brand-wordmark${light ? " light" : ""}${compact ? " compact" : ""}`} aria-label="Shades World Barcelona">
    <span>Shades World</span>
    <small>Barcelona</small>
  </span>
);

export default BrandWordmark;
