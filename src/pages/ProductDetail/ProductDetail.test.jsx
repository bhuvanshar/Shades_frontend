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
  // On load the page now shows the SELECTED VARIANT's photo, not the product's primary one — the
  // hero has to depict the colourway being quoted and sold, which is the whole point of the
  // default-variant rule. So the control is live and offers the primary product shot...
  expect(photoToggle()).toBeEnabled();
  expect(photoToggle()).toHaveTextContent(/view the primary photo/i);
  // ...and only once that shot is up does it go inert, because then it changes nothing.
  fireEvent.click(photoToggle());
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

test("a color still in the bag stays selectable after it sells out, and routes to where it can be removed", () => {
  const soldOut = { ...product, variants:[product.variants[0],
    { ...product.variants[1], quantityAvailable:0 }] };
  const { container } = renderDetail(buildStore({ "14:14":1 }, [soldOut]));
  const pinkTile = screen.getByRole("button", { name:/Rayban Pink Pink Out of stock 1 in bag/ });
  expect(pinkTile).not.toBeDisabled();
  fireEvent.click(pinkTile);
  // The quantity stepper is gone from this page, so the sold-out line is removed in the bag.
  // What this page must still do is show the state honestly and offer a way through.
  const addButton = container.querySelector(".pd-add-btn");
  expect(addButton).toBeDisabled();
  expect(addButton).toHaveTextContent("Out of stock");
  expect(screen.getByText("View bag →")).toBeInTheDocument();
});

test("no quantity stepper is rendered on the product page once an item is in the bag", () => {
  const { container } = renderDetail(buildStore({ "14:13":1 }));
  expect(container.querySelector(".pd-qty-row")).toBeNull();
  expect(container.querySelector(".pd-qty-control")).toBeNull();
  expect(screen.getByText("View bag →")).toBeInTheDocument();
});

test("the add button carries the stock ceiling now that the stepper is gone", () => {
  // Blue has quantityAvailable 3; with 3 already in the bag the only add affordance must lock,
  // otherwise repeated clicks push past stock until the API rejects them.
  renderDetail(buildStore({ "14:13":3 }));
  const addButton = screen.getByRole("button", { name:/All 3 in your bag/i });
  expect(addButton).toBeDisabled();
});

const openTab = (name) => fireEvent.click(screen.getByRole("button", { name }));

test("Description shows the selected variant's own copy and switches with the variant", () => {
  const withCopy = { ...product, description:"Shared product copy",
    variants:[{ ...product.variants[0], variantDescription:"Ocean blue, mirrored." },
      { ...product.variants[1], variantDescription:"Rose gold, gradient." }] };
  renderDetail(buildStore({}, [withCopy]));
  expect(screen.getByText("Ocean blue, mirrored.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name:"Rayban Pink Pink" }));
  expect(screen.getByText("Rose gold, gradient.")).toBeInTheDocument();
  expect(screen.queryByText("Ocean blue, mirrored.")).not.toBeInTheDocument();
});

test("a variant with no copy of its own inherits the product description and says so", () => {
  renderDetail(buildStore({}, [{ ...product, description:"Shared product copy" }]));
  expect(screen.getByText("Shared product copy")).toBeInTheDocument();
  expect(screen.getByText("This description covers every colourway.")).toBeInTheDocument();
});

test("Details renders the selected variant's attributes and changes with the variant", () => {
  const withAttributes = { ...product, attributes:{ frame_material:"Steel" },
    variants:[{ ...product.variants[0], attributes:{ color:"Blue", lens_color:"Smoke Blue" } },
      { ...product.variants[1], attributes:{ color:"Pink", lens_color:"Rose" } }] };
  renderDetail(buildStore({}, [withAttributes]));
  openTab("Details");
  expect(screen.getByText(/lens color: Smoke Blue/)).toBeInTheDocument();
  expect(screen.getByText(/SKU: BLUE/)).toBeInTheDocument();
  // Product-level attributes still show, so the tab is not narrower than before.
  expect(screen.getByText(/frame material: Steel/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name:"Rayban Pink Pink" }));
  expect(screen.getByText(/lens color: Rose/)).toBeInTheDocument();
  expect(screen.queryByText(/lens color: Smoke Blue/)).not.toBeInTheDocument();
  expect(screen.getByText(/SKU: PINK/)).toBeInTheDocument();
});

test("a variant attribute overrides a product attribute of the same name rather than listing both", () => {
  const clashing = { ...product, attributes:{ color:"Assorted", frame_material:"Steel" },
    variants:[{ ...product.variants[0], attributes:{ color:"Blue" } }, product.variants[1]] };
  renderDetail(buildStore({}, [clashing]));
  openTab("Details");
  expect(screen.getByText(/color: Blue/)).toBeInTheDocument();
  expect(screen.queryByText(/color: Assorted/)).not.toBeInTheDocument();
});

test("Shipping is derived from the selected variant's real stock", () => {
  const stockLevels = { ...product,
    variants:[{ ...product.variants[0], quantityAvailable:9, lowStockThreshold:2 },
      { ...product.variants[1], quantityAvailable:1, lowStockThreshold:2 }] };
  renderDetail(buildStore({}, [stockLevels]));
  openTab("Shipping");
  expect(screen.getByText(/Blue is in stock and dispatches within 1 business day/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name:"Rayban Pink Pink" }));
  expect(screen.getByText(/Only 1 left in Pink/)).toBeInTheDocument();
});

test("Shipping reports a sold-out variant as undispatchable", () => {
  const soldOut = { ...product,
    variants:[product.variants[0], { ...product.variants[1], quantityAvailable:0 }] };
  renderDetail(buildStore({ "14:14":1 }, [soldOut]));
  fireEvent.click(screen.getByRole("button", { name:/Rayban Pink Pink Out of stock/ }));
  openTab("Shipping");
  expect(screen.getByText(/Pink is out of stock and cannot be dispatched/)).toBeInTheDocument();
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
