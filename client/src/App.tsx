import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Navbar } from "./components/Navbar";
import { ApiDocsPage } from "./pages/ApiDocsPage";
import { CataloguePage } from "./pages/CataloguePage";
export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<CataloguePage />} />
        <Route path="/docs" element={<ApiDocsPage />} />
      </Routes>
    </BrowserRouter>
  );
}
