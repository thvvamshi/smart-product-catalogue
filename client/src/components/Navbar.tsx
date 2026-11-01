import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { LocationSelector } from "./location/LocationSelector";
import { fetchCart } from "../lib/api";

export function Navbar() {
  const [cartCount, setCartCount] = useState(0);
  useEffect(() => {
    let active = true;
    const load = () => {
      void fetchCart().then((response) => {
        if (active) setCartCount(response.data.itemCount);
      }).catch(() => { /* catalogue navigation remains usable when the API is unavailable */ });
    };
    window.addEventListener("cart:changed", load);
    return () => { active = false; window.removeEventListener("cart:changed", load); };
  }, []);
  return (
    <header className="navbar">
      <NavLink className="brand" to="/">
        Smart Catalogue
      </NavLink>
      <div className="navbar-actions"><LocationSelector /><nav>
        <NavLink to="/">Products</NavLink>
        <NavLink to="/discover">Fashion</NavLink>
        <NavLink to="/cart">Cart{cartCount ? ` (${cartCount})` : ""}</NavLink>
        <NavLink to="/orders">Orders</NavLink>
        <NavLink to="/store-dashboard">Demo store</NavLink>
        <NavLink to="/admin/delivery">Demo dispatch</NavLink>
        <NavLink to="/agent/deliveries">Demo agent</NavLink>
        <NavLink to="/docs">API Docs</NavLink>
      </nav></div>
    </header>
  );
}
