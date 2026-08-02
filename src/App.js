import React, { useEffect, useLayoutEffect, useRef } from "react";
import Navbar from "./components/Navbar/Navbar";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import Home from "./pages/Home/Home";
import Cart from "./pages/Cart/Cart";
import PlaceOrder from "./pages/PlaceOrder/PlaceOrder";
import ProductDetail from "./pages/ProductDetail/ProductDetail";
import Footer from "./components/Footer/Footer";
import PromoBar from "./components/PromoBar/PromoBar";
import SignIn from "./pages/SignIn/SignIn";
import AdminDashboard from "./pages/Admin/AdminDashboard";
import ProtectedRoute from "./components/ProtectedRoute/ProtectedRoute";
import { useAuth } from "./context/AuthContext";
import MyOrders from "./pages/MyOrders/MyOrders";
import Wishlist from "./pages/Wishlist/Wishlist";

const ScrollToTop = () => {
  const { pathname, hash } = useLocation();

  useLayoutEffect(() => {
    if (hash) return undefined;

    const root = document.documentElement;
    const previousBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    root.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });

    const restoreFrame = window.requestAnimationFrame(() => {
      root.style.scrollBehavior = previousBehavior;
    });

    return () => {
      window.cancelAnimationFrame(restoreFrame);
      root.style.scrollBehavior = previousBehavior;
    };
  }, [pathname, hash]);

  return null;
};

const AdminExitGuard = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin, signOut } = useAuth();
  const previousPath = useRef(location.pathname);

  useEffect(() => {
    const wasInAdmin = previousPath.current.startsWith("/admin");
    const isInAdmin = location.pathname.startsWith("/admin");
    previousPath.current = location.pathname;

    if (wasInAdmin && !isInAdmin && isAdmin) {
      signOut().finally(() => navigate("/signin", { replace: true }));
    }
  }, [location.pathname, isAdmin, navigate, signOut]);

  return null;
};

const App = () => {
  return (
    <><ScrollToTop /><AdminExitGuard /><Routes>
      <Route path="/signin" element={<SignIn />} />
      <Route path="/admin" element={<ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>} />
      <Route path="*" element={<>
        <div className="app"><PromoBar /><Navbar /><Routes>
          <Route path="/" element={<Home />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/order" element={<ProtectedRoute><PlaceOrder /></ProtectedRoute>} />
          <Route path="/product/:id" element={<ProductDetail />} />
          <Route path="/my-orders" element={<ProtectedRoute><MyOrders /></ProtectedRoute>} />
          <Route path="/wishlist" element={<ProtectedRoute><Wishlist /></ProtectedRoute>} />
        </Routes></div><Footer />
      </>} />
    </Routes></>
  );
};

export default App;
