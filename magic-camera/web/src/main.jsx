import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import MagicCamera from './pages/MagicCamera.jsx';
import './styles.css';

// Standalone Magic Camera: scans every active Magic Poster / Magic Business
// Card. "/" scans them all; "/:clientId" scopes to one person's card.
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MagicCamera />} />
        <Route path="/:clientId" element={<MagicCamera />} />
        <Route path="*" element={<MagicCamera />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
