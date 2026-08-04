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
const store = { product_list:[product], productsLoading:false, cartItems:{ "14:13":1 }, addToCart:jest.fn(), removeFromCart:jest.fn(),
  isWishlisted:()=>false, toggleWishlist:jest.fn() };

test("main product view resets to its default variant and variants keep independent cart state", () => {
  render(<MemoryRouter initialEntries={["/product/14"]}><StoreContext.Provider value={store}><Routes><Route path="/product/:id" element={<ProductDetail />} /></Routes></StoreContext.Provider></MemoryRouter>);
  expect(screen.getByText("View bag →")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name:"Rayban Pink Pink" }));
  expect(screen.getByRole("button", { name:"Add selected color to bag" })).toBeInTheDocument();
  expect(screen.getByText("₹2,099")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name:"Rayban main Rayban Primary view" }));
  expect(screen.getByText("View bag →")).toBeInTheDocument();
  expect(screen.getByText("₹1,999")).toBeInTheDocument();
});
