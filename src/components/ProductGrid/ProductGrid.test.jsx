import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ProductGrid from "./ProductGrid";
import { StoreContext } from "../../context/StoreContext";

jest.mock("../../context/AuthContext", () => ({ useAuth: () => ({ user: null }) }));

const products = [
  { _id: "1", productId: 1, name: "Barcelona Ocean", brand: "Sol", description: "Light frame", price: 1200,
    image: "/ocean.jpg", color: "Blue", isNew: true, available: true, defaultVariantId: 11,
    categories: [{ categoryName: "Unisex" }], variants: [{ variantId: 11, variantName: "Ocean", sku: "BAR-BLU", attributes: { color: "Blue" } }] },
  { _id: "2", productId: 2, name: "Madrid Rose", brand: "Luna", description: "Rose frame", price: 1800,
    image: "/rose.jpg", color: "Rose", isNew: false, available: false, defaultVariantId: 22,
    categories: [{ categoryName: "Women" }], variants: [{ variantId: 22, variantName: "Rose", sku: "MAD-ROS", attributes: { color: "Rose" } }] },
];
const store = { product_list: products, productsLoading: false, productsError: "", cartItems: {},
  addToCart: jest.fn(), removeFromCart: jest.fn(), isWishlisted: () => false, toggleWishlist: jest.fn() };
const view = (url = "/") => render(<MemoryRouter initialEntries={[url]}><StoreContext.Provider value={store}><ProductGrid category="All" /></StoreContext.Provider></MemoryRouter>);

test("matches every normalized search term across product and variant fields", () => {
  view("/?q=blue%20barcelona");
  expect(screen.getByText("Barcelona Ocean")).toBeInTheDocument();
  expect(screen.queryByText("Madrid Rose")).not.toBeInTheDocument();
  expect(screen.getByText("1 style")).toBeInTheDocument();
});

test("prevents adding a fully out-of-stock catalogue item", () => {
  view();
  expect(screen.getByRole("button", { name: /Madrid Rose is out of stock/i })).toBeDisabled();
});

test("explains an inverted price range instead of silently returning nothing", () => {
  view("/?minPrice=2000&maxPrice=1000");
  expect(screen.getByRole("alert")).toHaveTextContent("Minimum price cannot exceed maximum price");
  expect(screen.getByText("Correct the price range to continue.")).toBeInTheDocument();
});

test("the listing card names the colourway its button will add", () => {
  view();
  expect(screen.getByRole("button", { name: "Add Barcelona Ocean in Blue to bag" })).toBeInTheDocument();
});
