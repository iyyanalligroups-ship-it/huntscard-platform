import Svg, { Path, Rect, Circle } from 'react-native-svg';

// Same inline-SVG icon set as client-app/src/components/Layout.jsx (no
// icon font/library dependency there either) -- re-drawn with
// react-native-svg's element API since RN can't parse raw <svg> markup.
// Only the icons this app actually uses so far are included.
function IconBase({ color, size, children }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </Svg>
  );
}

export function DashboardIcon({ color = '#edeff3', size = 22 }) {
  return (
    <IconBase color={color} size={size}>
      <Rect x="3" y="3" width="7" height="9" rx="1.5" />
      <Rect x="14" y="3" width="7" height="5" rx="1.5" />
      <Rect x="14" y="12" width="7" height="9" rx="1.5" />
      <Rect x="3" y="16" width="7" height="5" rx="1.5" />
    </IconBase>
  );
}

export function ShieldIcon({ color = '#edeff3', size = 22 }) {
  return (
    <IconBase color={color} size={size}>
      <Path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6l7-3Z" />
    </IconBase>
  );
}

export function CheckCircleIcon({ color = '#5eead4', size = 20 }) {
  return (
    <IconBase color={color} size={size}>
      <Circle cx="12" cy="12" r="9" />
      <Path d="M8 12.5l2.5 2.5 5.5-5.5" />
    </IconBase>
  );
}

export function WarnCircleIcon({ color = '#e8b559', size = 20 }) {
  return (
    <IconBase color={color} size={size}>
      <Circle cx="12" cy="12" r="9" />
      <Path d="M12 8v5" />
      <Circle cx="12" cy="16" r="0.5" fill={color} />
    </IconBase>
  );
}

export function UnknownCircleIcon({ color = '#8b93a3', size = 20 }) {
  return (
    <IconBase color={color} size={size}>
      <Circle cx="12" cy="12" r="9" />
      <Path d="M9.5 9.3a2.5 2.5 0 0 1 4.7 1.2c0 1.6-2.2 1.8-2.2 3.3" />
      <Circle cx="12" cy="16.5" r="0.5" fill={color} />
    </IconBase>
  );
}

export function ChevronRightIcon({ color = '#8b93a3', size = 18 }) {
  return (
    <IconBase color={color} size={size}>
      <Path d="M9 6l6 6-6 6" />
    </IconBase>
  );
}

export function MenuIcon({ color = '#edeff3', size = 24 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round">
      <Path d="M4 6h16M4 12h16M4 18h16" />
    </Svg>
  );
}
