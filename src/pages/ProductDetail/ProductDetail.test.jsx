import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ProductDetail from "./ProductDetail";
import { StoreContext } from "../../context/StoreContext";

jest.mock("../../context/AuthContext", () => ({ useAuth: () => ({ user:null }) }));
jest.mock("../../components/ProductReviews/ProductReviews", () => () => null);

const product = { _id:"14", productId:14, name:"Rayban", brand:"Shades World", description:"Frame", price:1999,
  image:"/main.jpg", imageAlt:"Rayban", images:[{ imageId:1, imageUrl:"/main.jpg", isPrimary:true },
    { imageId:2, imageUrl:"/blue.jpg", variantId:13 }, { imageId:3, imageUrl:"/pink.jpg", variantId:14 }],
  categories:[{ categoryName:"Unisex" }], category:"Unisex", attributes:{}, isNew:false, defaultVariantId:13,
  variants:[{ variantId:13, variantName:"Blue", sku:"BLUE", price:1999, quantityAvailable:3, lowStockThreshold:1, attributes:{ color:"Blue" } },
    { variantId:14, variantName:"Pink", sku:"PINK", price:2099, quantityAvailable:4, lowStockThreshold:1, attributes:{ color:"Pink" } }] };
// The route the bug was reported on: a single variant, so "the variant next to the
// primary tile" and "the default variant" are the same line.
const singleVariant = { ...product, _id:"19", productId:19, name:"women", price:123, image:"/w-main.jpg",
  images:[{ imageId:16, imageUrl:"/w-main.jpg", isPrimary:true }, { imageId:17, imageUrl:"/w-ggg.jpg", variantId:21 }],
  defaultVariantId:21, color:"GGG",
  variants:[{ variantId:21, variantName:"423tr", sku:"24234234", price:123, quantityAvailable:1, lowStockThreshold:1, attributes:{ color:"GGG" } }] };

const buildStore = (cartItems, list = [product]) => ({ product_list:list, productsLoading:false, cartItems,
  addToCart:jest.fn(), removeFromCart:jest.fn(), isWishlisted:()=>false, toggleWishlist:jest.fn() });
const renderDetail = (store, id = "14") => render(<MemoryRouter initialEntries={[`/product/${id}`]}><StoreContext.Provider value={store}>
  <Routes><Route path="/product/:id" element={<ProductDetail />} /></Routes></StoreContext.Provider></MemoryRouter>);
const photoToggle = () => screen.getByRole("button", { name:/primary photo/i });

test("variants keep independent cart state", () => {
  renderDetail(buildStore({ "14:13":1 }));
  expect(screen.getByText("View bag →")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name:"Rayban Pink Pink" }));
  expect(screen.getByRole("button", { name:"Add Pink to bag" })).toBeInTheDocument();
  expect(screen.getByText("₹2,099")).toBeInTheDocument();
});

test("primary photo view only swaps the image and keeps adding the selected color", () => {
  const store = buildStore({});
  const { container } = renderDetail(store);
  fireEvent.click(screen.getByRole("button", { name:"Rayban Pink Pink" }));
  fireEvent.click(photoToggle());
  // Viewing the primary photo must not hand the purchase back to the default variant.
  expect(container.querySelector(".pd-main-image img")).toHaveAttribute("src", "/main.jpg");
  expect(screen.getByText("₹2,099")).toBeInTheDocument();
  expect(screen.getByText("4 in stock · SKU PINK")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name:"Add Pink to bag" }));
  expect(store.addToCart).toHaveBeenCalledWith("14", 14);
});

test("the bag indicator names the color that was actually added", () => {
  renderDetail(buildStore({ "14:14":2 }));
  expect(screen.getByRole("button", { name:"Rayban Pink Pink 2 in bag" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name:"Add Blue to bag" })).toBeInTheDocument();
});

test("the photo control sits outside the color row and is inert-proof while the primary photo is up", () => {
  const { container } = renderDetail(buildStore({}, [singleVariant]), "19");
  // Exactly one tile in the purchase row, and it is the colour — never the photo view.
  const tiles = [...container.querySelectorAll(".pd-variant-options button")];
  expect(tiles).toHaveLength(1);
  expect(tiles[0]).toHaveTextContent("GGG");
  expect(tiles[0].className).toBe("active");
  expect(container.querySelector(".pd-variant-options .pd-photo-toggle")).toBeNull();
  // On load the primary photo is already showing, so the control must say so and not
  // offer a click that changes nothing.
  expect(photoToggle()).toBeDisabled();
  expect(photoToggle()).toHaveTextContent(/showing the primary photo/i);
});

test("single-variant route adds its only variant and attributes the bag state to it", () => {
  const store = buildStore({}, [singleVariant]);
  renderDetail(store, "19");
  fireEvent.click(screen.getByRole("button", { name:"Add GGG to bag" }));
  expect(store.addToCart).toHaveBeenCalledWith("19", 21);
  expect(store.addToCart).toHaveBeenCalledTimes(1);
});

test("a color still in the bag stays selectable after it sells out, so the line can be removed", () => {
  const soldOut = { ...product, variants:[product.variants[0],
    { ...product.variants[1], quantityAvailable:0 }] };
  const store = buildStore({ "14:14":1 }, [soldOut]);
  renderDetail(store);
  const pinkTile = screen.getByRole("button", { name:/Rayban Pink Pink Out of stock 1 in bag/ });
  expect(pinkTile).not.toBeDisabled();
  fireEvent.click(pinkTile);
  fireEvent.click(screen.getByRole("button", { name:"Remove one Pink from bag" }));
  expect(store.removeFromCart).toHaveBeenCalledWith("14", 14);
});

test("the add button falls back to the variant's own SKU rather than another variant's color", () => {
  // No attributes.color and no variantName: the old fallback reached product.color,
  // which is resolved from a different variant.
  const unnamed = { ...product, color:"Blue",
    variants:[{ ...product.variants[0], attributes:{}, variantName:null }, product.variants[1]] };
  renderDetail(buildStore({}, [unnamed]));
  expect(screen.getByRole("button", { name:"Add BLUE to bag" })).toBeInTheDocument();
});

test("two variants sharing a color are disambiguated by SKU", () => {
  const twins = { ...product, variants:[product.variants[0],
    { ...product.variants[1], attributes:{ color:"Blue" }, sku:"BLUE-2" }] };
  renderDetail(buildStore({}, [twins]));
  expect(screen.getByRole("button", { name:"Add Blue (BLUE) to bag" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name:"Rayban Blue Blue BLUE-2" }));
  expect(screen.getByRole("button", { name:"Add Blue (BLUE-2) to bag" })).toBeInTheDocument();
});
