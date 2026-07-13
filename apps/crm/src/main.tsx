import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './index.css';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import ComingSoon from './components/ComingSoon';
import AppShell from './layouts/AppShell';
import Landing from './pages/Landing';
import SignIn from './pages/SignIn';
import SignUp from './pages/SignUp';
import ForgotPassword from './pages/ForgotPassword';
import Dashboard from './pages/Dashboard';
import Deals from './pages/Deals';
import DealDetail from './pages/DealDetail';
import PropertySearch from './pages/PropertySearch';
import Contacts from './pages/Contacts';
import ContactDetail from './pages/ContactDetail';
import Loi from './pages/Loi';
import Hotspots from './pages/Hotspots';
import Portfolio from './pages/Portfolio';
import Owner from './pages/Owner';
import Filings from './pages/Filings';
import Followup from './pages/Followup';
import Playbook from './pages/Playbook';
import MarketIntel from './pages/MarketIntel';
import CapitalRaise from './pages/CapitalRaise';
import CapitalRaiseDetail from './pages/CapitalRaiseDetail';
import Settings from './pages/Settings';
import BillingSettings from './pages/BillingSettings';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/sign-in" element={<SignIn />} />
          <Route path="/sign-up" element={<SignUp />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/app" element={<AppShell />}>
              <Route index element={<Dashboard />} />
              <Route path="deals" element={<Deals />} />
              <Route path="deals/:id" element={<DealDetail />} />
              <Route path="property-search" element={<PropertySearch />} />
              <Route path="contacts" element={<Contacts />} />
              <Route path="contacts/:id" element={<ContactDetail />} />
              <Route path="loi" element={<Loi />} />
              <Route path="hotspots" element={<Hotspots />} />
              <Route path="portfolio" element={<Portfolio />} />
              <Route path="owner" element={<Owner />} />
              <Route path="filings" element={<Filings />} />
              <Route path="followup" element={<Followup />} />
              <Route path="playbook" element={<Playbook />} />
              <Route path="market" element={<MarketIntel />} />
              <Route path="capital" element={<CapitalRaise />} />
              <Route path="capital/:id" element={<CapitalRaiseDetail />} />
              <Route path="learn" element={<ComingSoon feature="Learn" />} />
              <Route path="settings" element={<Settings />} />
              <Route path="settings/billing" element={<BillingSettings />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
