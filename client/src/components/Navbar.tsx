import { NavLink } from "react-router-dom";

export function Navbar() {
  return (
    <header className="navbar">
      <NavLink className="brand" to="/">
        Smart Catalogue
      </NavLink>
      <nav>
        <NavLink to="/">Products</NavLink>
        <NavLink to="/docs">API Docs</NavLink>
      </nav>
    </header>
  );
}
