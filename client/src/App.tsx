import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Navbar } from "./components/Navbar";
import { ApiDocsPage } from "./pages/ApiDocsPage";
import { CataloguePage } from "./pages/CataloguePage";
import { LocationProvider } from "./context/LocationContext";
import { DiscoveryPage } from "./pages/DiscoveryPage";
import { ProductDetailPage } from "./pages/ProductDetailPage";
import { CartPage } from "./pages/CartPage";
import { CheckoutPage } from "./pages/CheckoutPage";
import { OrdersPage } from "./pages/OrdersPage";
import { OrderDetailPage } from "./pages/OrderDetailPage";
import { StoreDashboardPage } from "./pages/StoreDashboardPage";
import { DeliveryDashboardPage } from "./pages/DeliveryDashboardPage";
import { DeliveryAgentsPage } from "./pages/DeliveryAgentsPage";
import { AgentDeliveriesPage } from "./pages/AgentDeliveriesPage";
import { AgentDeliveryDetailPage } from "./pages/AgentDeliveryDetailPage";
import { ActiveOrderBanner } from "./components/orders/ActiveOrderBanner";
export default function App() {
  return (
    <BrowserRouter>
      <LocationProvider><Navbar /><ActiveOrderBanner />
        <Routes>
          <Route path="/" element={<CataloguePage />} />
          <Route path="/docs" element={<ApiDocsPage />} />
          <Route path="/discover" element={<DiscoveryPage />} />
          <Route path="/fashion/:id" element={<ProductDetailPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/:orderId" element={<OrderDetailPage />} />
          <Route path="/store-dashboard" element={<StoreDashboardPage />} />
          <Route path="/admin/delivery" element={<DeliveryDashboardPage />} />
          <Route path="/admin/delivery-agents" element={<DeliveryAgentsPage />} />
          <Route path="/agent/deliveries" element={<AgentDeliveriesPage />} />
          <Route path="/agent/deliveries/:id" element={<AgentDeliveryDetailPage />} />
        </Routes>
      </LocationProvider>
    </BrowserRouter>
  );
}
