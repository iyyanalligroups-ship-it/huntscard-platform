import { createNavigationContainerRef } from '@react-navigation/native';

// Lets code outside a screen (sheets, deep links) navigate.
export const navigationRef = createNavigationContainerRef();

export function navigate(name, params) {
  if (navigationRef.isReady()) navigationRef.navigate(name, params);
}
