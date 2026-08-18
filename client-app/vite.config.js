import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Local-only mkcert certificate (see .certs/, gitignored) -- only needed
// for testing a real phone over the LAN, where camera access
// (getUserMedia) requires a secure context and a plain LAN IP over HTTP
// doesn't qualify. Opt-in via VITE_DEV_HTTPS=1 -- the USB/adb-reverse
// route (see host below) is the default now, and THAT needs plain HTTP:
// adb reverse maps the phone's own "localhost" to this dev server, and
// localhost is automatically a secure context regardless of protocol, so
// forcing HTTPS there just adds an extra (currently-untrusted-on-device)
// cert prompt for no benefit.
const certPath = path.join(__dirname, '.certs', 'cert.pem');
const keyPath = path.join(__dirname, '.certs', 'key.pem');
const httpsConfig =
  process.env.VITE_DEV_HTTPS === '1' && fs.existsSync(certPath) && fs.existsSync(keyPath)
    ? { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) }
    : undefined;

// Serves the mkcert root CA (public/huntstag-dev-ca.crt) with the MIME
// type Android's cert installer actually looks for -- Vite's static
// middleware doesn't know a .crt extension and serves it with no
// Content-Type at all otherwise, which is why Chrome on Android just
// showed the raw PEM text / failed the download instead of offering to
// install it as a trusted certificate.
function caCertMimePlugin() {
  return {
    name: 'ca-cert-mime',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/huntstag-dev-ca.crt')) {
          res.setHeader('Content-Type', 'application/x-x509-ca-cert');
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), caCertMimePlugin()],
  optimizeDeps: {
    // mind-ar's own source uses Vite-specific `?worker&inline` imports
    // internally (compiler.js/controller.js) -- esbuild's dependency
    // pre-bundling step doesn't understand that query-suffix syntax (it's
    // a Vite plugin transform, not a standard JS import), so pre-bundling
    // this package breaks with "No matching export ... for import
    // default". Excluding it makes Vite serve it as source instead,
    // where its own plugin pipeline (including `?worker` handling)
    // applies correctly. Dev-server-only issue -- the production build
    // (`vite build`) already worked without this.
    exclude: ['mind-ar'],
    // Excluding mind-ar above also stops Vite's dependency scanner from
    // discovering (and converting to browser-compatible ESM) mind-ar's
    // OWN CommonJS dependencies, since it only walks entry points it's
    // actually pre-bundling. Without this, they get served as raw
    // CommonJS source and throw "module is not defined" the moment the
    // browser tries to run them (confirmed for `long`, pulled in by
    // @tensorflow/tfjs -- listing tfjs itself here should cover its own
    // internal deps too, `long` included explicitly since it broke even
    // with tfjs discoverable elsewhere in the graph).
    include: ['@tensorflow/tfjs', '@msgpack/msgpack', 'mathjs', 'ml-matrix', 'svd-js', 'tinyqueue', 'long', 'seedrandom'],
  },
  server: {
    port: 5173,
    // Without this, Vite binds IPv6 loopback ([::1]) only on this
    // machine -- fine for a plain browser (curl/Chrome resolve
    // "localhost" to ::1 first and it just works), but `adb reverse`
    // connects to 127.0.0.1 (IPv4) on the host side, so a phone tunneled
    // in over USB got ERR_EMPTY_RESPONSE with nothing listening there.
    // Binding IPv4 loopback explicitly (not `true`/0.0.0.0 -- no need to
    // expose this beyond the host) fixes phone-over-adb-reverse testing.
    host: '127.0.0.1',
    // Uploaded media (photos/banners/AR videos) get an absolute URL built
    // from PUBLIC_BASE_URL, which points at this dev server's own origin
    // (matching how one shared domain works in production) -- but the
    // files themselves are only ever served by the backend's /uploads
    // static route on :4000. Proxy them through so those URLs actually
    // resolve locally instead of 404ing against Vite.
    proxy: {
      '/uploads': 'http://localhost:4000',
    },
    https: httpsConfig,
  },
});
