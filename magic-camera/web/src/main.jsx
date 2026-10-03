import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import MagicCamera from './pages/MagicCamera.jsx';
import './styles.css';

// Standalone Magic Camera: scans every active Magic Poster / Magic Business
// Card. "/" scans them all; "/:clientId" scopes to one person's card.
// Camera access needs a secure origin (https:// or localhost). On a plain http://<ip>
// address the browser hides navigator.mediaDevices entirely, which used to leave a
// silent black screen -- say so instead.
const cameraUnavailable = !(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {cameraUnavailable ? (
      <div style={{ position: 'fixed', inset: 0, background: '#000', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 28, textAlign: 'center', fontFamily: 'sans-serif' }}>
        <h2 style={{ margin: 0 }}>Camera is blocked on this address</h2>
        <p style={{ maxWidth: 360, color: '#9aa3b5', lineHeight: 1.5 }}>Browsers only allow camera access on a secure address (https://). Open Magic Camera through an HTTPS link, or on this computer at http://localhost.</p>
      </div>
    ) : (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MagicCamera />} />
        <Route path="/:clientId" element={<MagicCamera />} />
        <Route path="*" element={<MagicCamera />} />
      </Routes>
    </BrowserRouter>
    )}
  </React.StrictMode>
);
