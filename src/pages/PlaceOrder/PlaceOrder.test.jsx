import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PlaceOrder from "./PlaceOrder";
import { StoreContext } from "../../context/StoreContext";
import * as api from "../../services/api";

jest.mock("../../context/AuthContext", () => ({ useAuth: () => ({ accessToken: "cookie-session" }) }));
jest.mock("../../services/api", () => ({
  createAddress: jest.fn(), createOrder: jest.fn(), processMockPayment: jest.fn(),
  getAddresses: jest.fn(),
}));

const store = {
  cartItems: { "19:21": 2 },
  product_list: [{ _id: "19", name: "Barcelona Sun", price: 123, image: "/frame.jpg", images: [],
    variants: [{ variantId: 21, variantName: "Ocean Blue", sku: "BAR-BLU", price: 123, attributes: { color: "Blue" } }] }],
  getTotalCartAmount: () => 246,
  appliedOffer: null,
  clearCartState: jest.fn(),
  getCartCount: () => 2,
  cartSyncing: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  api.getAddresses.mockResolvedValue([{ addressId: 4, recipientName: "Asha", addressLine1: "1 Market Street",
    city: "Barcelona", state: "Catalonia", pincode: "08001", country: "Spain", isDefault: true }]);
});

test("requires review of exact variants, address and final total before placing order", async () => {
  render(<MemoryRouter><StoreContext.Provider value={store}><PlaceOrder /></StoreContext.Provider></MemoryRouter>);
  expect(await screen.findByText("Barcelona Sun")).toBeInTheDocument();
  expect(screen.getByText(/Blue · BAR-BLU/)).toBeInTheDocument();
  expect(screen.getByText(/Quantity 2 × ₹123/)).toBeInTheDocument();
  expect((await screen.findAllByText("Asha")).length).toBeGreaterThan(0);
  await waitFor(() => expect(screen.queryByText(/Loading saved addresses/i)).not.toBeInTheDocument());
  const submit = screen.getByRole("button", { name: /Place order · ₹339.28/i });
  expect(submit).toBeDisabled();
  const confirmation = screen.getByRole("checkbox", { name: /I reviewed the items, variants, quantities/i });
  fireEvent.click(confirmation);
  await waitFor(() => expect(submit).toBeEnabled());
});
