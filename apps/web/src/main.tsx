import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './index.css';
import Home from './pages/Home';
import Property from './pages/Property';
import Deal from './pages/Deal';
import Deals from './pages/Deals';
import Loi from './pages/Loi';
import Hotspots from './pages/Hotspots';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/property" element={<Property />} />
        <Route path="/deal" element={<Deal />} />
        <Route path="/deals" element={<Deals />} />
        <Route path="/loi" element={<Loi />} />
        <Route path="/hotspots" element={<Hotspots />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
