// Same "holographic security-foil" palette as client-app/src/styles.css
// (:root) -- kept in sync by hand since this is a separate RN project, not
// a shared package. Update both places if the web palette changes.
export const colors = {
  space: '#0a0b10',
  panel: '#12141b',
  panelRaised: '#181b24',
  panelBorder: 'rgba(255, 255, 255, 0.08)',
  text: '#edeff3',
  textDim: '#8b93a3',
  holoCyan: '#5eead4',
  holoViolet: '#a78bfa',
  holoMagenta: '#f472b6',
  danger: '#f4746a',
  // Not in the web palette (that CSS has no warning color yet) -- a muted
  // amber picked to sit calmly between holoCyan (pass) and danger (fail)
  // without reading as an alarm color itself.
  warning: '#e8b559',
};

export const radius = 14;
