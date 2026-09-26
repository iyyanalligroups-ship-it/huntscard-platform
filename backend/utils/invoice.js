const PDFDocument = require('pdfkit');

// Hard-coded from the business's actual GST registration certificate
// (GST REG-06) -- not configurable, since this is the same legal entity
// for every invoice this app will ever issue. HuntsTAG is the consumer-
// facing brand (see client-app's Footer.jsx); Huntsworld/the GSTIN below
// is the registered legal identity a GST invoice must actually carry.
const BUSINESS = {
  gstin: '34EWSPM5689F1ZQ',
  legalName: 'MAHALAKSHMI R',
  tradeName: 'HUNTSWORLD',
  address: 'No.10/72, 7th Cross, Thulukanathamman Nagar, Murungapakkam, Nainarmandapam, Puducherry, Puducherry - 605004',
  tagline: 'A smart card for a smarter first impression.',
  email: 'info@huntsworld.com',
};

// Brand palette -- same holographic cyan/violet/magenta trio the live
// sites use (see client-app/src/styles.css :root --holo-cyan/violet/
// magenta), just deepened slightly for legible print/white-background use
// instead of the neon glow-on-dark values used on screen.
const COLOR = {
  cyan: '#14b8a6',
  violet: '#7c3aed',
  magenta: '#db2777',
  ink: '#1a1a2e', // near-black with a violet cast, for headings/table header bg
  textDim: '#6b7280',
  rule: '#e5e7eb',
  zebra: '#f5f3ff', // faint violet tint for alternating row backgrounds
};

// Mirrors the persisted global theme switch used by the admin and client
// applications. Invoice data never changes with the theme; only the accent
// colors used to render a newly downloaded PDF do.
const THEME_COLORS = {
  default: { cyan: '#0d9394', violet: '#13aaa5', magenta: '#7367f0', zebra: '#eefafa', soft: '#f2fbfa' },
  orange: { cyan: '#ff9f43', violet: '#ff7a1a', magenta: '#ffcf5c', zebra: '#fff7ed', soft: '#fff9f0' },
  cyber: { cyan: '#7367f0', violet: '#5f54d9', magenta: '#ea5455', zebra: '#f4f2ff', soft: '#f7f5ff' },
};

const PAGE_LEFT = 50;
const PAGE_RIGHT = 545; // A4 width 595.28pt, 50pt margins
const PAGE_WIDTH = PAGE_RIGHT - PAGE_LEFT;

// Copied into the backend's own assets (not imported from client-app's
// public/ folder) so invoice generation doesn't depend on that sibling
// app's directory existing next to this one at deploy time.
const path = require('path');
const LOGO_PATH = path.join(__dirname, '../assets/huntsTAG-wolf-logo.png');

// pdfkit's built-in Helvetica has no Rupee glyph without embedding a custom
// Unicode font, so amounts print as "Rs." rather than "₹" here.
function money(n) {
  return `Rs. ${Number(n || 0).toLocaleString('en-IN')}`;
}

function brandGradient(doc, x1, y1, x2, y2, colors = COLOR) {
  return doc.linearGradient(x1, y1, x2, y2).stop(0, colors.cyan).stop(0.5, colors.violet).stop(1, colors.magenta);
}

// Converts both new card-checkout snapshots and older paid CardRequest
// records into the same order shape buildInvoicePdf consumes. Historical
// requests predate address/GST capture, so their stored paid amount is the
// subtotal, delivery/GST stay zero, and a current saved address is used
// only when one exists. Missing information is labelled honestly instead
// of inventing tax or delivery values.
function normalizeCardInvoiceOrder(request, client, plan, savedAddress, fallbackUnitPrice = 0) {
  const raw = typeof request?.toObject === 'function' ? request.toObject() : request || {};
  const legacyInvoice = !raw.orderNumber || !raw.delivery?.line1 || !raw.invoiceItems?.length;
  const quantity = Math.max(1, Number(raw.quantity) || 1);
  const paidTotal = Number(raw.amountPaid ?? raw.amount ?? 0);
  const storedSubtotal = Number(raw.subtotal ?? paidTotal ?? 0);
  const subtotal = storedSubtotal > 0 ? storedSubtotal : Number(fallbackUnitPrice || 0) * quantity;
  const unitPrice = Number(fallbackUnitPrice) > 0 && Number(fallbackUnitPrice) * quantity === subtotal
    ? Number(fallbackUnitPrice)
    : subtotal / quantity;

  const variants = new Map(
    (plan?.variants || []).map((variant) => [String(variant._id), variant.name || 'Card'])
  );
  let items = (raw.invoiceItems || []).map((item) => ({
    name: item.name,
    unitPrice: Number(item.unitPrice) || 0,
    quantity: Math.max(1, Number(item.quantity) || 1),
  }));
  if (!items.length && raw.variantBreakdown?.length) {
    items = raw.variantBreakdown.map((entry) => ({
      name: `${plan?.name || raw.requestedPlan || 'HuntsTAG Card'} - ${variants.get(String(entry.variantId)) || 'Card'}`,
      unitPrice,
      quantity: Math.max(1, Number(entry.quantity) || 1),
    }));
  }
  if (!items.length) {
    items = [{ name: plan?.name || raw.requestedPlan || 'HuntsTAG Card', unitPrice, quantity }];
  }

  const sourceAddress = raw.delivery?.line1 ? raw.delivery : savedAddress;
  const delivery = sourceAddress
    ? {
        name: sourceAddress.name || client?.fullName || 'Customer',
        phone: sourceAddress.phone || client?.phone || 'Not recorded',
        line1: sourceAddress.line1 || 'Address not recorded',
        line2: sourceAddress.line2 || '',
        country: sourceAddress.country || 'India',
        state: sourceAddress.state || 'Not recorded',
        city: sourceAddress.city || 'Not recorded',
        pincode: sourceAddress.pincode || 'Not recorded',
      }
    : {
        name: client?.fullName || 'Customer',
        phone: client?.phone || 'Not recorded',
        line1: 'Address not recorded for this legacy purchase',
        line2: '',
        country: 'India',
        state: 'Not recorded',
        city: 'Not recorded',
        pincode: 'Not recorded',
      };

  const deliveryFee = Number(raw.deliveryFee ?? 0);
  const gstPercent = Number(raw.gstPercent ?? 0);
  const gstAmount = Number(raw.gstAmount ?? 0);
  const storedAmount = Number(raw.amount ?? raw.amountPaid ?? 0);
  const amount = storedAmount > 0 ? storedAmount : subtotal + deliveryFee + gstAmount;

  return {
    ...raw,
    orderNumber: raw.orderNumber || `HC${String(raw._id || '').slice(-10).toUpperCase()}`,
    items,
    subtotal,
    deliveryFee,
    gstPercent,
    gstAmount,
    amount,
    amountPaid: raw.amountPaid ?? amount,
    paymentStatus: raw.paymentStatus || 'paid',
    delivery,
    legacyInvoice,
  };
}

// Streams a GST invoice PDF for one paid Magic Poster order directly to
// `res` -- caller sets Content-Type/Content-Disposition first (see
// routes/profile.js and routes/admin.js's invoice GET endpoints).
function buildInvoicePdf(order, client, res, options = {}) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const C = { ...COLOR, ...(THEME_COLORS[options.theme] || THEME_COLORS.default) };
  doc.pipe(res);

  // Compact branded masthead. The source logo is a wide transparent PNG,
  // so `fit` preserves its aspect ratio instead of squeezing it into a
  // square (the cause of the tiny/distorted logo in the previous invoice).
  const headerY = 42;
  const headerH = 104;
  doc.roundedRect(PAGE_LEFT, headerY, PAGE_WIDTH, headerH, 14).fill(C.soft);
  doc.save();
  doc.roundedRect(PAGE_LEFT, headerY, PAGE_WIDTH, headerH, 14).clip();
  doc.rect(PAGE_LEFT, headerY, 7, headerH).fill(brandGradient(doc, PAGE_LEFT, headerY, PAGE_LEFT, headerY + headerH, C));
  doc.circle(PAGE_RIGHT - 8, headerY + 6, 72).fillOpacity(0.055).fill(C.violet);
  doc.fillOpacity(1).restore();

  const logoTileX = PAGE_LEFT + 20;
  const logoTileY = headerY + 20;
  doc.roundedRect(logoTileX, logoTileY, 66, 64, 13).fill('#ffffff');
  doc.image(LOGO_PATH, logoTileX + 5, logoTileY + 13, { fit: [56, 38], align: 'center', valign: 'center' });

  const wordmarkX = logoTileX + 82;
  const wordmarkY = headerY + 25;
  doc.font('Helvetica-Bold').fontSize(25).fillColor(C.ink).text('Hunts', wordmarkX, wordmarkY, { lineBreak: false });
  const huntsWidth = doc.widthOfString('Hunts');
  doc.fillColor(C.violet).text('TAG', wordmarkX + huntsWidth, wordmarkY, { lineBreak: false });
  doc.font('Helvetica').fontSize(8.5).fillColor(C.textDim).text(BUSINESS.tagline, wordmarkX, wordmarkY + 34, { width: 235 });
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.cyan).text('SMART CONNECTIONS. ONE TAP.', wordmarkX, wordmarkY + 53, { characterSpacing: 0.8 });

  const invoiceBadgeX = PAGE_RIGHT - 120;
  doc.roundedRect(invoiceBadgeX, headerY + 23, 100, 27, 13.5).fill(brandGradient(doc, invoiceBadgeX, headerY + 23, invoiceBadgeX + 100, headerY + 23, C));
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#ffffff').text('TAX INVOICE', invoiceBadgeX, headerY + 32, { width: 100, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.ink).text(order.orderNumber, invoiceBadgeX, headerY + 61, { width: 100, align: 'right' });
  doc.font('Helvetica').fontSize(7.5).fillColor(C.textDim).text(new Date(order.createdAt).toLocaleDateString('en-IN'), invoiceBadgeX, headerY + 76, { width: 100, align: 'right' });

  // Seller and delivery details use equal cards, making the legal identity
  // and customer destination easy to scan without a large empty header.
  const detailY = 162;
  const detailGap = 14;
  const detailW = (PAGE_WIDTH - detailGap) / 2;
  const detailH = 114;
  const buyerX = PAGE_LEFT + detailW + detailGap;
  function detailCard(x, label) {
    doc.roundedRect(x, detailY, detailW, detailH, 10).fillAndStroke('#ffffff', C.rule);
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.cyan).text(label, x + 14, detailY + 13, { characterSpacing: 0.8 });
  }
  detailCard(PAGE_LEFT, 'SOLD BY');
  detailCard(buyerX, 'SHIP TO');

  doc.font('Helvetica-Bold').fontSize(10).fillColor(C.ink).text(BUSINESS.tradeName, PAGE_LEFT + 14, detailY + 31, { width: detailW - 28 });
  doc.font('Helvetica-Bold').fontSize(7.7).fillColor(C.ink).text(`GSTIN: ${BUSINESS.gstin}`, PAGE_LEFT + 14, detailY + 50, { width: detailW - 28 });

  doc.font('Helvetica-Bold').fontSize(10).fillColor(C.ink).text(order.delivery.name, buyerX + 14, detailY + 31, { width: detailW - 28 });
  doc.font('Helvetica').fontSize(7.7).fillColor(C.textDim);
  const addressLine = `${order.delivery.line1}${order.delivery.line2 ? `, ${order.delivery.line2}` : ''}`;
  doc.text(addressLine, buyerX + 14, detailY + 47, { width: detailW - 28, lineGap: 1 });
  doc.text(`${order.delivery.city}, ${order.delivery.state}`, buyerX + 14, detailY + 70, { width: detailW - 28 });
  doc.text(`${order.delivery.country} - ${order.delivery.pincode}`, buyerX + 14, detailY + 82, { width: detailW - 28 });
  doc.font('Helvetica-Bold').fontSize(7.7).fillColor(C.ink).text(`Phone: ${order.delivery.phone}`, buyerX + 14, detailY + 96, { width: detailW - 28 });

  const summaryY = detailY + detailH + 12;
  doc.roundedRect(PAGE_LEFT, summaryY, PAGE_WIDTH, 31, 8).fill('#f7f7fa');
  const summaryItems = [
    ['PAYMENT', String(order.paymentStatus || 'paid').toUpperCase()],
    ['ORDER ID', order.orderNumber],
    ['TRACKING ID', order.trackingId || 'Pending dispatch'],
  ];
  summaryItems.forEach(([label, value], index) => {
    const width = PAGE_WIDTH / summaryItems.length;
    const x = PAGE_LEFT + index * width;
    if (index) doc.moveTo(x, summaryY + 7).lineTo(x, summaryY + 24).strokeColor(C.rule).lineWidth(1).stroke();
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor(C.textDim).text(label, x + 11, summaryY + 7, { width: width - 22 });
    doc.font('Helvetica-Bold').fontSize(8).fillColor(index === 0 ? C.cyan : C.ink).text(value, x + 11, summaryY + 17, { width: width - 22, ellipsis: true });
  });

  // Line item table.
  const tableTop = summaryY + 46;
  const cols = [
    { key: 'sl', label: 'SL.', x: PAGE_LEFT, width: 30 },
    { key: 'item', label: 'ITEM DESCRIPTION', x: PAGE_LEFT + 30, width: 220 },
    { key: 'price', label: 'Price', x: PAGE_LEFT + 250, width: 80, align: 'right' },
    { key: 'qty', label: 'Qty.', x: PAGE_LEFT + 330, width: 50, align: 'right' },
    { key: 'total', label: 'Total', x: PAGE_LEFT + 380, width: 115, align: 'right' },
  ];
  const rowH = 29;
  const tableHeaderH = 30;

  doc.roundedRect(PAGE_LEFT, tableTop, PAGE_WIDTH, tableHeaderH, 8).fill(C.ink);
  doc.font('Helvetica-Bold').fontSize(7.8).fillColor('#ffffff');
  cols.forEach((c) => doc.text(c.label.toUpperCase(), c.x + 8, tableTop + 11, { width: c.width - 12, align: c.align || 'left', characterSpacing: 0.35 }));

  let rowY = tableTop + tableHeaderH;
  const items = order.items && order.items.length ? order.items : [{ name: '(no items)', quantity: 0, unitPrice: 0 }];
  items.forEach((item, i) => {
    doc.rect(PAGE_LEFT, rowY, PAGE_WIDTH, rowH).fill(i % 2 ? C.zebra : '#ffffff');
    doc.font('Helvetica').fontSize(8.5).fillColor(C.ink);
    const cellY = rowY + 10;
    doc.text(String(i + 1), cols[0].x + 8, cellY, { width: cols[0].width - 12 });
    doc.font('Helvetica-Bold').text(item.name || '(deleted poster)', cols[1].x + 8, cellY, { width: cols[1].width - 12, ellipsis: true, lineBreak: false });
    doc.font('Helvetica');
    doc.text(money(item.unitPrice), cols[2].x + 8, cellY, { width: cols[2].width - 16, align: 'right' });
    doc.text(String(item.quantity), cols[3].x + 8, cellY, { width: cols[3].width - 16, align: 'right' });
    doc.text(money(item.unitPrice * item.quantity), cols[4].x + 8, cellY, { width: cols[4].width - 16, align: 'right' });
    rowY += rowH;
  });
  doc.roundedRect(PAGE_LEFT, tableTop, PAGE_WIDTH, rowY - tableTop, 8).strokeColor(C.rule).lineWidth(1).stroke();

  // Notes and totals form a balanced two-column close beneath the table.
  const closingY = rowY + 18;
  doc.roundedRect(PAGE_LEFT, closingY, 260, 105, 10).fill('#f7f7fa');
  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.ink).text('Payment & support', PAGE_LEFT + 14, closingY + 14);
  doc.font('Helvetica').fontSize(7.8).fillColor(C.textDim);
  doc.text('Payment received securely. This invoice is generated electronically and does not require a physical signature.', PAGE_LEFT + 14, closingY + 32, { width: 232, lineGap: 2 });
  doc.text(`Questions? ${BUSINESS.email}`, PAGE_LEFT + 14, closingY + 77, { width: 232 });

  const totalsBoxX = 325;
  doc.roundedRect(totalsBoxX, closingY, PAGE_RIGHT - totalsBoxX, 105, 10).fillAndStroke('#ffffff', C.rule);
  let totalsY = closingY + 13;
  const totalsLabelX = totalsBoxX + 14;
  const totalsValueX = totalsBoxX + 96;
  const totalsWidth = PAGE_RIGHT - totalsValueX - 14;
  function totalsRow(label, value, opts = {}) {
    doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.bold ? 10 : 8.5).fillColor(opts.bold ? C.ink : C.textDim);
    doc.text(label, totalsLabelX, totalsY, { width: 78 });
    doc.text(value, totalsValueX, totalsY, { width: totalsWidth, align: 'right' });
    totalsY += opts.bold ? 23 : 16;
  }
  totalsRow('Sub Total', money(order.subtotal));
  totalsRow('Delivery', money(order.deliveryFee));
  totalsRow(`GST (${order.gstPercent}%)`, money(order.gstAmount));

  const totalBarY = closingY + 69;
  doc.roundedRect(totalsBoxX + 8, totalBarY, PAGE_RIGHT - totalsBoxX - 16, 28, 7).fill(brandGradient(doc, totalsBoxX, totalBarY, PAGE_RIGHT, totalBarY, C));
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#ffffff');
  doc.text('TOTAL PAID', totalsBoxX + 20, totalBarY + 9, { width: 78 });
  doc.text(money(order.amount), totalsValueX - 4, totalBarY + 9, { width: totalsWidth + 4, align: 'right' });

  if (order.legacyInvoice) {
    doc.font('Helvetica').fontSize(7).fillColor(C.textDim).text('Legacy purchase: unavailable historical delivery or tax values are shown as zero/not recorded.', PAGE_LEFT, closingY + 112, { width: PAGE_WIDTH });
  }

  // Stable footer for normal one-page orders.
  const footerY = 742;
  doc.rect(PAGE_LEFT, footerY, PAGE_WIDTH, 3).fill(brandGradient(doc, PAGE_LEFT, footerY, PAGE_RIGHT, footerY, C));
  doc.font('Helvetica-Bold').fontSize(8).fillColor(C.ink).text('Thank you for choosing HuntsTAG.', PAGE_LEFT, footerY + 12, {
    width: PAGE_WIDTH,
    align: 'center',
  });
  doc.font('Helvetica').fontSize(7).fillColor(C.textDim).text(`${BUSINESS.tradeName}  |  ${BUSINESS.email}  |  GSTIN ${BUSINESS.gstin}`, PAGE_LEFT, footerY + 27, {
    width: PAGE_WIDTH,
    align: 'center',
  });

  doc.end();
}

module.exports = { buildInvoicePdf, normalizeCardInvoiceOrder, BUSINESS };
