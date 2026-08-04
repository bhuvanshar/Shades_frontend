import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import StoreContextProvider, { StoreContext } from "./StoreContext";
import { useContext } from "react";
import * as api from "../services/api";

const mockAuth = { accessToken:"cookie-session", user:{ userId:7 }, isAdmin:false };
jest.mock("./AuthContext", () => ({ useAuth: () => mockAuth }));
jest.mock("../services/api", () => ({ getStoreProducts:jest.fn(), getCart:jest.fn(), updateCartItem:jest.fn(),
  addCartItem:jest.fn(), removeCartItem:jest.fn(), getWishlist:jest.fn(), addWishlistItem:jest.fn(), removeWishlistItem:jest.fn() }));

function Harness() { const store = useContext(StoreContext); return <><output aria-label="quantity">{store.cartItems["14:13"] || 0}</output><output aria-label="pink quantity">{store.cartItems["14:14"] || 0}</output><button onClick={() => store.addToCart("14",13)}>add blue</button><button onClick={() => store.removeFromCart("14",13)}>decrease</button></>; }

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockAuth, { accessToken:"cookie-session", user:{ userId:7 }, isAdmin:false });
  api.getStoreProducts.mockResolvedValue({ content:[] }); api.getWishlist.mockResolvedValue({ items:[] });
  api.getCart.mockResolvedValue({ items:[{ productId:14, variantId:13, quantity:3 }] });
  api.updateCartItem.mockResolvedValue({ items:[] }); api.removeCartItem.mockResolvedValue({ items:[] });
});

test("rapid decrements use the latest intended quantity and are serialized", async () => {
  render(<StoreContextProvider><Harness /></StoreContextProvider>);
  await waitFor(() => expect(screen.getByLabelText("quantity")).toHaveTextContent("3"));
  fireEvent.click(screen.getByRole("button", { name:"decrease" }));
  fireEvent.click(screen.getByRole("button", { name:"decrease" }));
  expect(screen.getByLabelText("quantity")).toHaveTextContent("1");
  await waitFor(() => expect(api.updateCartItem).toHaveBeenCalledTimes(2));
  expect(api.updateCartItem.mock.calls.map((call) => call[2])).toEqual([2,1]);
});

test("sign in merges a guest variant with an existing remote variant", async () => {
  Object.assign(mockAuth, { accessToken:null, user:null, isAdmin:false });
  api.getCart.mockResolvedValue({ items:[{ productId:14, variantId:14, quantity:2 }] });
  api.addCartItem.mockResolvedValue({ items:[
    { productId:14, variantId:13, quantity:1 }, { productId:14, variantId:14, quantity:2 },
  ] });
  const tree = <StoreContextProvider><Harness /></StoreContextProvider>;
  const { rerender } = render(tree);
  fireEvent.click(screen.getByRole("button", { name:"add blue" }));
  expect(screen.getByLabelText("quantity")).toHaveTextContent("1");

  Object.assign(mockAuth, { accessToken:"cookie-session", user:{ userId:7 } });
  rerender(<StoreContextProvider><Harness /></StoreContextProvider>);

  await waitFor(() => expect(api.addCartItem).toHaveBeenCalledWith("cookie-session", 13, 1));
  await waitFor(() => expect(screen.getByLabelText("pink quantity")).toHaveTextContent("2"));
  expect(screen.getByLabelText("quantity")).toHaveTextContent("1");
});
