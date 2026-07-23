import { Navigate, Route, Routes } from 'react-router-dom';
import { isLoggedIn } from './api.js';
import PublicLayout from './components/PublicLayout.jsx';
import Home from './pages/Home.jsx';
import Shop from './pages/Shop.jsx';
import Catalog from './pages/Catalog.jsx';
import ContactUs from './pages/ContactUs.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ChangePassword from './pages/ChangePassword.jsx';
import Layout from './components/Layout.jsx';
import DashboardHome from './pages/DashboardHome.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Profile from './pages/Profile.jsx';
import Track from './pages/Track.jsx';
import Settings from './pages/Settings.jsx';
import ArLayout from './pages/ArLayout.jsx';
import Contacts from './pages/Contacts.jsx';
import PublicProfile from './pages/PublicProfile.jsx';

function RequireAuth({ children }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      {/* Public site -- anyone can browse and buy without an account */}
      <Route path="/" element={<PublicLayout />}>
        <Route index element={<Home />} />
        <Route path="shop" element={<Shop />} />
        <Route path="catalog" element={<Catalog />} />
        <Route path="contact" element={<ContactUs />} />
      </Route>

      {/* Public tap page -- what a stranger sees when they tap the physical
          card or scan its QR code. No login, standalone (not wrapped in
          PublicLayout's marketing-site header). */}
      <Route path="/c/:clientId" element={<PublicProfile />} />

      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/change-password"
        element={
          <RequireAuth>
            <ChangePassword />
          </RequireAuth>
        }
      />

      {/* Authenticated area -- unchanged from before, just now reached
          via Login rather than being the whole app */}
      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardHome />} />
        <Route path="profile" element={<Dashboard />} />
        <Route path="settings" element={<Profile />} />
        <Route path="ar-layout" element={<ArLayout />} />
        <Route path="upgrade" element={<Shop />} />
        <Route path="track" element={<Track />} />
        <Route path="account-settings" element={<Settings />} />
        <Route path="contacts" element={<Contacts />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
