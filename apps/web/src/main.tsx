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
import Followup from './pages/Followup';
import Portfolio from './pages/Portfolio';
import Owner from './pages/Owner';
import Filings from './pages/Filings';
import Contacts from './pages/Contacts';
import ContactDetail from './pages/ContactDetail';
import Settings from './pages/Settings';
import Playbook from './pages/Playbook';
import DevModeBanner from './components/DevModeBanner';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <DevModeBanner />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/property" element={<Property />} />
        <Route path="/deal" element={<Deal />} />
        <Route path="/deals" element={<Deals />} />
        <Route path="/loi" element={<Loi />} />
        <Route path="/hotspots" element={<Hotspots />} />
        <Route path="/followup" element={<Followup />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/owner" element={<Owner />} />
        <Route path="/filings" element={<Filings />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/contact/:id" element={<ContactDetail />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/playbook" element={<Playbook />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
