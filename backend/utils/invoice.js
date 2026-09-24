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

function brandGradient(doc, x1, y1, x2, y2) {
  return doc.linearGradient(x1, y1, x2, y2).stop(0, COLOR.cyan).stop(0.5, COLOR.violet).stop(1, COLOR.magenta);
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
function buildInvoicePdf(order, client, res) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  doc.pipe(res);

  // ---- Header: actual app logo + wordmark (left), INVOICE title flanked
  // by brand-gradient bars (right) -- same composition as the reference
  // template, recolored to HuntsTAG's palette instead of yellow. Logo,
  // wordmark and tagline share one left-aligned column so nothing drifts
  // out of line with anything else in the block.
  const LOGO_SIZE = 32;
  doc.image(LOGO_PATH, PAGE_LEFT, 48, { width: LOGO_SIZE, height: LOGO_SIZE });
  const wordmarkX = PAGE_LEFT + LOGO_SIZE + 10;
  doc.font('Helvetica-Bold').fontSize(22).fillColor(COLOR.violet).text('HuntsTAG', wordmarkX, 50);
  doc.font('Helvetica').fontSize(8).fillColor(COLOR.textDim).text(BUSINESS.tagline, wordmarkX, 76);

  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR.ink).text(BUSINESS.tradeName, PAGE_LEFT, 96);
  doc.font('Helvetica').fontSize(8).fillColor(COLOR.textDim);
  doc.text(BUSINESS.legalName, PAGE_LEFT, 108);
  doc.text(BUSINESS.address, PAGE_LEFT, 119, { width: 280 });
  doc.text(`GSTIN: ${BUSINESS.gstin}`, PAGE_LEFT, doc.y + 2);

  // INVOICE row -- bar / text / bar all share one y + height, and each
  // element's x is computed from the previous one's measured width so
  // none of them can drift out of vertical or horizontal alignment with
  // each other (the earlier version hardcoded x/y per piece and they fell
  // out of line -- this version can't).
  const invoiceRowY = 58;
  const barH = 30;
  const bar1X = 290;
  const bar1W = 100;
  doc.rect(bar1X, invoiceRowY, bar1W, barH).fill(brandGradient(doc, bar1X, invoiceRowY, bar1X + bar1W, invoiceRowY));

  doc.font('Helvetica-Bold').fontSize(22).fillColor(COLOR.ink);
  const invoiceLabel = 'INVOICE';
  const invoiceTextX = bar1X + bar1W + 14;
  const invoiceTextY = invoiceRowY + (barH - doc.currentLineHeight()) / 2;
  doc.text(invoiceLabel, invoiceTextX, invoiceTextY);

  const bar2X = invoiceTextX + doc.widthOfString(invoiceLabel) + 14;
  const bar2W = PAGE_RIGHT - bar2X;
  doc.rect(bar2X, invoiceRowY, bar2W, barH).fill(brandGradient(doc, bar2X, invoiceRowY, PAGE_RIGHT, invoiceRowY));

  // ---- Invoice to: / Invoice#+Date -- two columns beneath the header.
  const metaY = 165;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR.ink).text('Invoice to:', PAGE_LEFT, metaY);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR.ink).text(order.delivery.name, PAGE_LEFT, metaY + 16);
  doc.font('Helvetica').fontSize(9).fillColor(COLOR.textDim);
  doc.text(`${order.delivery.line1}${order.delivery.line2 ? `, ${order.delivery.line2}` : ''}`, PAGE_LEFT, metaY + 31, { width: 260 });
  doc.text(`${order.delivery.city}, ${order.delivery.state}, ${order.delivery.country} - ${order.delivery.pincode}`, PAGE_LEFT, doc.y, { width: 260 });
  doc.text(`Phone: ${order.delivery.phone}`, PAGE_LEFT, doc.y);
  if (client?.fullName && client.fullName !== order.delivery.name) {
    doc.text(`Account: ${client.fullName}`, PAGE_LEFT, doc.y);
  }

  const metaRightX = 380;
  function metaRow(label, value, y) {
    doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR.ink).text(label, metaRightX, y, { width: 70 });
    doc.font('Helvetica').fontSize(10).fillColor(COLOR.textDim).text(value, metaRightX + 70, y, { width: 95, align: 'right' });
  }
  metaRow('Invoice#', order.orderNumber, metaY);
  metaRow('Date', new Date(order.createdAt).toLocaleDateString('en-IN'), metaY + 16);
  if (order.trackingId) metaRow('Tracking', order.trackingId, metaY + 32);
  metaRow('Status', String(order.paymentStatus || '').toUpperCase(), metaY + (order.trackingId ? 48 : 32));

  // ---- Line items table -- dark header row (brand ink), zebra-striped
  // body rows, no external table library (same hand-rolled column
  // approach the previous version used, now with real cell backgrounds).
  const tableTop = 260;
  const cols = [
    { key: 'sl', label: 'SL.', x: PAGE_LEFT, width: 30 },
    { key: 'item', label: 'Item Description', x: PAGE_LEFT + 30, width: 220 },
    { key: 'price', label: 'Price', x: PAGE_LEFT + 250, width: 80, align: 'right' },
    { key: 'qty', label: 'Qty.', x: PAGE_LEFT + 330, width: 50, align: 'right' },
    { key: 'total', label: 'Total', x: PAGE_LEFT + 380, width: 115, align: 'right' },
  ];
  const rowH = 26;
  const headerH = 28;

  doc.rect(PAGE_LEFT, tableTop, PAGE_WIDTH, headerH).fill(COLOR.ink);
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff');
  cols.forEach((c) => doc.text(c.label, c.x + 8, tableTop + 9, { width: c.width - 12, align: c.align || 'left' }));

  let rowY = tableTop + headerH;
  const items = order.items && order.items.length ? order.items : [{ name: '(no items)', quantity: 0, unitPrice: 0 }];
  items.forEach((item, i) => {
    if (i % 2 === 1) doc.rect(PAGE_LEFT, rowY, PAGE_WIDTH, rowH).fill(COLOR.zebra);
    doc.font('Helvetica').fontSize(9).fillColor(COLOR.ink);
    const cellY = rowY + 8;
    doc.text(String(i + 1), cols[0].x + 8, cellY, { width: cols[0].width - 12 });
    doc.text(item.name || '(deleted poster)', cols[1].x + 8, cellY, { width: cols[1].width - 12 });
    doc.text(money(item.unitPrice), cols[2].x + 8, cellY, { width: cols[2].width - 16, align: 'right' });
    doc.text(String(item.quantity), cols[3].x + 8, cellY, { width: cols[3].width - 16, align: 'right' });
    doc.text(money(item.unitPrice * item.quantity), cols[4].x + 8, cellY, { width: cols[4].width - 16, align: 'right' });
    rowY += rowH;
  });
  doc.rect(PAGE_LEFT, tableTop, PAGE_WIDTH, rowY - tableTop).strokeColor(COLOR.rule).lineWidth(1).stroke();

  // ---- Totals -- Sub Total / GST rows, then a brand-gradient highlight
  // bar for the Grand Total (same highlighted-bar treatment the reference
  // template gives its Total row, recolored to the brand gradient).
  let totalsY = rowY + 20;
  const totalsLabelX = 350;
  const totalsValueX = 430;
  const totalsWidth = 95;
  function totalsRow(label, value, opts = {}) {
    doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.bold ? 11 : 10).fillColor(opts.bold ? COLOR.ink : COLOR.textDim);
    doc.text(label, totalsLabelX, totalsY, { width: 75 });
    doc.text(value, totalsValueX, totalsY, { width: totalsWidth, align: 'right' });
    totalsY += opts.bold ? 26 : 18;
  }
  totalsRow('Sub Total', money(order.subtotal));
  totalsRow('Delivery', money(order.deliveryFee));
  totalsRow(`GST (${order.gstPercent}%)`, money(order.gstAmount));

  const totalBarH = 30;
  doc.rect(totalsLabelX, totalsY, PAGE_RIGHT - totalsLabelX, totalBarH).fill(brandGradient(doc, totalsLabelX, totalsY, PAGE_RIGHT, totalsY));
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#ffffff');
  doc.text('Total:', totalsLabelX + 12, totalsY + 9, { width: 75 });
  doc.text(money(order.amount), totalsValueX - 15, totalsY + 9, { width: totalsWidth + 15, align: 'right' });

  // ---- Footer -- thank-you note, GSTIN reminder, contact + signature
  // line, then a thin brand-gradient rule above the very bottom.
  const footerY = totalsY + totalBarH + 30;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR.ink).text('Thank you for your business!', PAGE_LEFT, footerY);
  doc.font('Helvetica').fontSize(8).fillColor(COLOR.textDim);
  doc.text('This is a computer-generated GST tax invoice and does not require a physical signature.', PAGE_LEFT, footerY + 16, {
    width: 300,
  });
  if (order.legacyInvoice) {
    doc.text('Legacy purchase: address, delivery and tax values not captured at checkout are shown as not recorded or zero.', PAGE_LEFT, doc.y + 4, {
      width: 330,
    });
  }
  doc.text(`Questions about this order? ${BUSINESS.email}`, PAGE_LEFT, doc.y + 4);

  // Pinned near the bottom for a typical short order, but pushed further
  // down (onto a new page if pdfkit decides it must) for an order with
  // enough line items that the table pushes the footer past this point --
  // never overlapping the totals/footer text above it.
  const ruleY = Math.max(758, footerY + 60);
  doc.rect(PAGE_LEFT, ruleY, PAGE_WIDTH, 3).fill(brandGradient(doc, PAGE_LEFT, ruleY, PAGE_RIGHT, ruleY));
  doc.font('Helvetica').fontSize(8).fillColor(COLOR.textDim).text(`${BUSINESS.tradeName}  |  ${BUSINESS.email}  |  GSTIN ${BUSINESS.gstin}`, PAGE_LEFT, ruleY + 10, {
    width: PAGE_WIDTH,
    align: 'center',
  });

  doc.end();
}

module.exports = { buildInvoicePdf, normalizeCardInvoiceOrder, BUSINESS };
