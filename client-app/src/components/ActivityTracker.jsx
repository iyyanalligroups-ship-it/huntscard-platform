import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { startActivityTracker, trackPageOpen } from '../activityTracker.js';

// Mounted once in App.jsx. Starts the website activity tracker and notes each page the person opens.
// It does nothing unless a client is logged in (see activityTracker.js).
export default function ActivityTracker() {
  const { pathname } = useLocation();
  useEffect(() => startActivityTracker(), []);
  useEffect(() => {
    const t = setTimeout(() => trackPageOpen(pathname), 0); // the page has set its own state by then
    return () => clearTimeout(t);
  }, [pathname]);
  return null;
}
