import { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { api } from '../api.js';


const CONTACT_PICKER_SUPPORTED =
  typeof navigator !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window;

// Formats a Date as the local (no-timezone) string <input
// type="datetime-local"> expects/returns, e.g. "2026-08-05T14:30".
function toDatetimeLocalValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function roundUpToNext5Min(date) {
  const rounded = new Date(date);
  rounded.setSeconds(0, 0);
  rounded.setMinutes(Math.ceil(rounded.getMinutes() / 5) * 5);
  return rounded;
}

// wa.me needs a full international number (no +, no spaces/dashes) to
// open a chat with a SPECIFIC contact rather than a generic "pick
// someone" share -- contact phone numbers in this app are entered in
// wildly inconsistent formats (see normalizePhone in
// routes/appointments.js), so this strips to digits and assumes a bare
// 10-digit number is Indian (country code 91), same assumption the rest
// of this codebase's SMS integration already makes.
function waNumber(phone) {
  const digits = (phone || '').replace(/\D/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
}

// A ContactAddress from the picker is a structured object, not a string --
// flatten it to one line for storage/display.
function formatAddress(addr) {
  if (!addr) return '';
  const parts = [
    ...(Array.isArray(addr.addressLine) ? addr.addressLine : []),
    addr.city,
    addr.region,
    addr.postalCode,
    addr.country,
  ].filter(Boolean);
  return parts.join(', ');
}

// Best-effort split of a single full name into first/last -- first word is
// firstName, everything else is lastName. Used for sources that only ever
// hand over one name string: the Contact Picker, and Excel rows with no
// explicit First/Last columns.
function splitName(fullName) {
  const trimmed = (fullName || '').trim();
  if (!trimmed) return { firstName: '', lastName: '' };
  const parts = trimmed.split(/\s+/);
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

// Column headers we'll accept in an uploaded sheet, per field -- lets people
// use whatever header text they already have (e.g. an export from their
// phone's own contacts app) instead of forcing an exact template.
const HEADER_ALIASES = {
  firstName: ['first name', 'firstname'],
  lastName: ['last name', 'lastname', 'surname'],
  name: ['name', 'full name', 'contact name'],
  phone: ['phone', 'phone number', 'mobile', 'mobile number', 'tel', 'telephone'],
  email: ['email', 'email address'],
  org: ['org', 'organization', 'organisation', 'company'],
  address: ['address'],
  notes: ['notes', 'note'],
};

function rowToContact(row) {
  const lower = {};
  for (const [k, v] of Object.entries(row)) lower[k.trim().toLowerCase()] = v;
  const pick = (aliases) => {
    for (const key of aliases) {
      if (lower[key] != null && String(lower[key]).trim()) return String(lower[key]).trim();
    }
    return '';
  };

  let firstName = pick(HEADER_ALIASES.firstName);
  let lastName = pick(HEADER_ALIASES.lastName);
  if (!firstName && !lastName) {
    const split = splitName(pick(HEADER_ALIASES.name));
    firstName = split.firstName;
    lastName = split.lastName;
  }
  const name = [firstName, lastName].filter(Boolean).join(' ').trim() || pick(HEADER_ALIASES.name);

  return {
    name,
    firstName,
    lastName,
    phone: pick(HEADER_ALIASES.phone),
    email: pick(HEADER_ALIASES.email),
    org: pick(HEADER_ALIASES.org),
    address: pick(HEADER_ALIASES.address),
    notes: pick(HEADER_ALIASES.notes),
  };
}

const EMPTY_FORM = { firstName: '', lastName: '', phone: '', email: '', org: '', address: '', notes: '' };

export default function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [excelImporting, setExcelImporting] = useState(false);
  const excelInputRef = useRef(null);
  // Properties the Contact Picker API can actually return on this device --
  // requesting one it doesn't support (e.g. 'address' is spottily supported
  // across Android OEM contact providers) is what makes the native picker's
  // own "Done" button get stuck disabled on some phones. Checked once up
  // front (not inside the click handler) because select() must run
  // synchronously off the click's user gesture -- no await can come before it.
  const [pickerProperties, setPickerProperties] = useState(['name', 'tel', 'email', 'address']);

  // Add/Edit form -- one form, two modes. `editingContact` is null for Add,
  // or the contact being edited.
  const [formMode, setFormMode] = useState(null); // null | 'add' | 'edit'
  const [editingContact, setEditingContact] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formPhotoFile, setFormPhotoFile] = useState(null);
  const [formPhotoPreview, setFormPhotoPreview] = useState(null);
  const [formError, setFormError] = useState('');
  const [formSaving, setFormSaving] = useState(false);
  const formPhotoInputRef = useRef(null);

  // Appointment-request modal -- opened by the arrow icon on a contact
  // row (see routes/appointments.js). `appointmentTarget` is the contact
  // being requested, or null when the modal's closed.
  const [appointmentTarget, setAppointmentTarget] = useState(null);
  const [appointmentNote, setAppointmentNote] = useState('');
  const [appointmentProposedAt, setAppointmentProposedAt] = useState(''); // <input type="datetime-local"> value, local to the sender's own clock
  const [busyTimes, setBusyTimes] = useState([]); // this contact's own upcoming accepted appointments, if they're a registered account -- see openAppointmentModal
  const [appointmentSending, setAppointmentSending] = useState(false);
  const [appointmentError, setAppointmentError] = useState('');
  const [appointmentSentIds, setAppointmentSentIds] = useState(new Set());
  // The just-created request, once sent -- switches the modal into a
  // "sent" state offering a WhatsApp quick-share. This is a MANUAL
  // share the sender chooses to send themselves, not an automated
  // notification -- real automated WhatsApp delivery needs a WhatsApp
  // Business API account (Meta Cloud API/Twilio/etc.) with an
  // approved message template, the same kind of credential this app
  // doesn't have for SMS either (see routes/appointments.js). Email
  // (matched accounts) and SMS (unmatched, once DLT-approved) are the
  // real automated channels; this is the honest middle ground for
  // WhatsApp specifically.
  const [sentRequest, setSentRequest] = useState(null);

  function loadContacts() {
    return api
      .listContacts()
      .then(setContacts)
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    loadContacts().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!CONTACT_PICKER_SUPPORTED) return;
    navigator.contacts
      .getProperties()
      .then((supported) => setPickerProperties(['name', 'tel', 'email', 'address'].filter((p) => supported.includes(p))))
      .catch(() => {});
  }, []);

  // Must be called directly from the click handler, with no `await`
  // before it -- the Contact Picker API requires a real user gesture and
  // will reject if anything asynchronous runs first.
  async function handleImport() {
    setError('');
    setImportResult(null);
    setImporting(true);
    try {
      const picked = await navigator.contacts.select(pickerProperties, { multiple: true });
      const mapped = picked.map((c) => {
        const { firstName, lastName } = splitName(c.name?.[0] || '');
        return {
          name: c.name?.[0] || '',
          firstName,
          lastName,
          phone: c.tel?.[0] || '',
          email: c.email?.[0] || '',
          address: formatAddress(c.address?.[0]),
        };
      });
      const result = await api.importContacts(mapped);
      setImportResult(result);
      await loadContacts();
    } catch (err) {
      // The picker itself throws if the user cancels the dialog -- that's
      // not an error worth showing, just a no-op.
      if (err.name !== 'AbortError') setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  async function handleExport() {
    setError('');
    setExporting(true);
    try {
      await api.exportContacts();
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  // Works on any device/browser (unlike the Contact Picker import above) --
  // this is the way iPhone users, or anyone restoring in bulk from a
  // spreadsheet, get contacts in. Parsed entirely client-side and posted
  // through the same /contacts/import endpoint the phone-picker flow uses,
  // so duplicate handling stays identical either way.
  async function handleExcelImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setImportResult(null);
    setExcelImporting(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      const mapped = rows.map(rowToContact);
      const result = await api.importContacts(mapped);
      setImportResult(result);
      await loadContacts();
    } catch (err) {
      setError(err.message || 'Could not read that file -- make sure it’s a valid Excel (.xlsx) or CSV file.');
    } finally {
      setExcelImporting(false);
      if (excelInputRef.current) excelInputRef.current.value = '';
    }
  }

  function handleExcelExport() {
    const rows = contacts.map((c) => ({
      'First Name': c.firstName || '',
      'Last Name': c.lastName || '',
      Phone: c.phone,
      Email: c.email || '',
      Company: c.org || '',
      Address: c.address || '',
      Notes: c.notes || '',
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Contacts');
    XLSX.writeFile(workbook, 'huntstag-contacts.xlsx');
  }

  // Same header names rowToContact() looks for -- gives people the exact
  // columns to fill in instead of guessing at what "flexible" headers means.
  function handleDownloadTemplate() {
    const sheet = XLSX.utils.json_to_sheet([
      {
        'First Name': 'Jane',
        'Last Name': 'Doe',
        Phone: '+91 98765 43210',
        Email: 'jane@example.com',
        Company: 'Acme Inc',
        Address: '123 Main St, Bengaluru',
        Notes: 'Met at HuntsTAG launch event',
      },
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Contacts');
    XLSX.writeFile(workbook, 'huntstag-contacts-template.xlsx');
  }

  async function handleDelete(id) {
    if (!window.confirm('Remove this contact from your HuntsTAG backup?')) return;
    setError('');
    setDeletingId(id);
    try {
      await api.deleteContact(id);
      setContacts((list) => list.filter((c) => c._id !== id));
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  function openAppointmentModal(contact) {
    setAppointmentTarget(contact);
    setAppointmentNote('');
    // Defaults to an hour from now, not blank -- an empty field made it
    // easy to either submit with no time at all or (worse) hand-type a
    // date in the past with nothing stopping you. Rounded to the next 5
    // minutes so it doesn't look like an oddly specific auto-pick.
    setAppointmentProposedAt(toDatetimeLocalValue(roundUpToNext5Min(new Date(Date.now() + 60 * 60 * 1000))));
    setAppointmentError('');
    setBusyTimes([]);
    setSentRequest(null);
    if (contact.phone) {
      api
        .getAppointmentBusyTimes(contact.phone)
        .then((res) => setBusyTimes(res.matched ? res.busy : []))
        .catch(() => {});
    }
  }

  async function handleSendAppointment(e) {
    e.preventDefault();
    if (!appointmentTarget) return;
    // <input type="datetime-local"> gives a value with no timezone (e.g.
    // "2026-08-05T14:30") -- `new Date(...)` on that string interprets it
    // in the BROWSER's own local timezone, which is exactly what was
    // intended (the sender picked a time on their own clock).
    const proposedDate = appointmentProposedAt ? new Date(appointmentProposedAt) : null;
    if (proposedDate && proposedDate.getTime() < Date.now()) {
      setAppointmentError('That time has already passed -- pick a time in the future.');
      return;
    }
    setAppointmentSending(true);
    setAppointmentError('');
    try {
      const request = await api.sendAppointmentRequest(appointmentTarget._id, appointmentNote, proposedDate?.toISOString());
      setAppointmentSentIds((ids) => new Set(ids).add(appointmentTarget._id));
      // Stays open in a "sent" state (see the modal JSX) instead of
      // closing outright -- that's where the WhatsApp quick-share lives.
      setSentRequest(request);
    } catch (err) {
      setAppointmentError(err.message);
    } finally {
      setAppointmentSending(false);
    }
  }

  function openAddForm() {
    setFormMode('add');
    setEditingContact(null);
    setForm(EMPTY_FORM);
    setFormPhotoFile(null);
    setFormPhotoPreview(null);
    setFormError('');
  }

  function openEditForm(contact) {
    setFormMode('edit');
    setEditingContact(contact);
    setForm({
      firstName: contact.firstName || '',
      lastName: contact.lastName || '',
      phone: contact.phone || '',
      email: contact.email || '',
      org: contact.org || '',
      address: contact.address || '',
      notes: contact.notes || '',
    });
    setFormPhotoFile(null);
    setFormPhotoPreview(contact.photoUrl || null);
    setFormError('');
  }

  function closeForm() {
    setFormMode(null);
    setEditingContact(null);
    setFormPhotoFile(null);
    setFormPhotoPreview(null);
    setFormError('');
    if (formPhotoInputRef.current) formPhotoInputRef.current.value = '';
  }

  function updateFormField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleFormPhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFormPhotoFile(file);
    setFormPhotoPreview(URL.createObjectURL(file));
  }

  // Single user-facing "Save" action, two requests internally when a photo
  // is involved: create/update the text fields first (a brand-new contact
  // needs an id before a photo can be attached to it), then upload the
  // photo against that id if one was chosen.
  async function handleSaveContact(e) {
    e.preventDefault();
    if (!form.phone.trim()) {
      setFormError('Phone number is required');
      return;
    }
    setFormError('');
    setFormSaving(true);
    try {
      const contact =
        formMode === 'edit'
          ? await api.updateContact(editingContact._id, form)
          : await api.createContact(form);

      if (formPhotoFile) {
        await api.uploadContactPhoto(contact._id, formPhotoFile);
      }

      await loadContacts();
      closeForm();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setFormSaving(false);
    }
  }

  if (loading) return <p className="subtitle">Loading…</p>;

  return (
    <div>
      <h1>Contacts</h1>
      <p className="subtitle">
        Back up your phone's contacts to your HuntsTAG account. If you switch phones, log in here and export to
        restore them.
      </p>

      {error && <div className="error-banner">{error}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {CONTACT_PICKER_SUPPORTED ? (
            <button type="button" className="secondary" style={{ width: 'auto' }} onClick={handleImport} disabled={importing}>
              {importing ? 'Importing…' : 'Import contacts from this phone'}
            </button>
          ) : (
            <button type="button" className="secondary" style={{ width: 'auto' }} disabled>
              Import contacts from this phone
            </button>
          )}
          <button
            type="button"
            className="secondary"
            style={{ width: 'auto' }}
            onClick={handleExport}
            disabled={exporting || contacts.length === 0}
          >
            {exporting ? 'Preparing…' : 'Export contacts'}
          </button>
        </div>
        <p className="hint" style={{ margin: '10px 0 0' }}>
          {CONTACT_PICKER_SUPPORTED
            ? 'Import picks contacts from this device and adds any that aren’t already saved here.'
            : 'Import is only available in Chrome on Android — it isn’t supported in this browser.'}
          {' '}Export downloads a file you can open on any phone to add them to its contacts app.
        </p>
        {importResult && (
          <p className="hint" style={{ margin: '8px 0 0', color: 'var(--holo-cyan)' }}>
            Imported {importResult.imported}, skipped {importResult.skipped} already saved.
          </p>
        )}

        <div style={{ borderTop: '1px solid var(--panel-border)', margin: '16px 0' }} />

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            ref={excelInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleExcelImport}
            style={{ display: 'none' }}
            id="excelInput"
            disabled={excelImporting}
          />
          <label
            htmlFor="excelInput"
            className="secondary"
            style={{ display: 'inline-block', width: 'auto', cursor: excelImporting ? 'default' : 'pointer', opacity: excelImporting ? 0.6 : 1 }}
          >
            {excelImporting ? 'Importing…' : 'Upload Excel sheet'}
          </label>
          <button
            type="button"
            className="secondary"
            style={{ width: 'auto' }}
            onClick={handleExcelExport}
            disabled={contacts.length === 0}
          >
            Export to Excel
          </button>
          <button type="button" className="secondary" style={{ width: 'auto' }} onClick={handleDownloadTemplate}>
            Download template
          </button>
        </div>
        <p className="hint" style={{ margin: '10px 0 0' }}>
          Works on any phone or computer, no browser restrictions. Columns: First Name, Last Name, Phone, Email,
          Company, Address, Notes (header names are flexible, but if you're not sure, grab the template above and
          fill it in). Export gives you a spreadsheet you can re-upload here on any device, including iPhone.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label style={{ margin: 0 }}>Add a contact by hand</label>
          {formMode !== 'add' && (
            <button type="button" className="secondary" style={{ width: 'auto' }} onClick={openAddForm}>
              + Add contact
            </button>
          )}
        </div>
        {!formMode && (
          <p className="hint" style={{ margin: '8px 0 0' }}>
            For anything import can't carry -- a photo, a company, a note about where you met.
          </p>
        )}

        {formMode && (
          <form onSubmit={handleSaveContact} style={{ marginTop: 14 }}>
            {formError && <div className="error-banner">{formError}</div>}

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  flexShrink: 0,
                  background: formPhotoPreview ? 'transparent' : 'var(--holo-gradient)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 22,
                  fontWeight: 700,
                  color: '#06120f',
                  border: '1px solid var(--panel-border)',
                }}
              >
                {formPhotoPreview ? (
                  <img src={formPhotoPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  (form.firstName || form.lastName || '?').charAt(0).toUpperCase()
                )}
              </div>
              <div>
                <input
                  ref={formPhotoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFormPhotoChange}
                  style={{ display: 'none' }}
                  id="contactPhotoInput"
                />
                <label htmlFor="contactPhotoInput" className="secondary" style={{ display: 'inline-block', width: 'auto', cursor: 'pointer' }}>
                  {formPhotoPreview ? 'Change photo' : 'Choose photo'}
                </label>
                <p className="hint" style={{ margin: '6px 0 0' }}>JPEG, PNG, or WEBP. Max 5MB.</p>
              </div>
            </div>

            <div className="field-grid">
              <div className="field">
                <label htmlFor="cFirstName">First name</label>
                <input id="cFirstName" value={form.firstName} onChange={(e) => updateFormField('firstName', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="cLastName">Last name</label>
                <input id="cLastName" value={form.lastName} onChange={(e) => updateFormField('lastName', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="cPhone">Phone number</label>
                <input id="cPhone" type="tel" required value={form.phone} onChange={(e) => updateFormField('phone', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="cEmail">Email</label>
                <input id="cEmail" type="email" value={form.email} onChange={(e) => updateFormField('email', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="cOrg">Company</label>
                <input id="cOrg" value={form.org} onChange={(e) => updateFormField('org', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="cAddress">Address</label>
                <input id="cAddress" value={form.address} onChange={(e) => updateFormField('address', e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="cNotes">Notes</label>
              <textarea
                id="cNotes"
                rows={3}
                value={form.notes}
                onChange={(e) => updateFormField('notes', e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--panel-raised)',
                  border: '1px solid var(--panel-border)',
                  borderRadius: 9,
                  padding: '11px 13px',
                  color: 'var(--text)',
                  fontSize: 14,
                  fontFamily: 'var(--font-ui)',
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" disabled={formSaving} style={{ width: 'auto' }}>
                {formSaving ? 'Saving…' : formMode === 'edit' ? 'Save changes' : 'Add contact'}
              </button>
              <button type="button" className="secondary" style={{ width: 'auto' }} onClick={closeForm} disabled={formSaving}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="card">
        {contacts.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>No contacts saved yet — use Import to add some from this phone.</p>
        ) : (
          <div className="contact-list">
            {contacts.map((c) => (
              <div className="contact-row" key={c._id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <div className="contact-row-avatar">
                    {c.photoUrl ? (
                      <img src={c.photoUrl} alt="" />
                    ) : (
                      (c.name || '?').charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="contact-row-info">
                    <div className="contact-row-name">{c.name}</div>
                    <div className="contact-row-meta">
                      {c.phone}
                      {c.email ? ` · ${c.email}` : ''}
                    </div>
                    {c.org && <div className="contact-row-meta">{c.org}</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button
                    type="button"
                    className="secondary"
                    title="Send an appointment request"
                    aria-label="Send an appointment request"
                    style={{ width: 36, height: 36, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    onClick={() => openAppointmentModal(c)}
                  >
                    {appointmentSentIds.has(c._id) ? (
                      <span style={{ color: 'var(--holo-cyan)', fontSize: 16 }}>✓</span>
                    ) : (
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 19V5" />
                        <path d="M5 12l7-7 7 7" />
                      </svg>
                    )}
                  </button>
                  <button type="button" className="secondary" style={{ width: 'auto' }} onClick={() => openEditForm(c)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    style={{ width: 'auto' }}
                    onClick={() => handleDelete(c._id)}
                    disabled={deletingId === c._id}
                  >
                    {deletingId === c._id ? 'Removing…' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {appointmentTarget && (
        <div className="auth-modal-backdrop" onClick={(e) => e.target === e.currentTarget && setAppointmentTarget(null)}>
          <div className="auth-modal-card">
            <button className="auth-modal-close" onClick={() => setAppointmentTarget(null)} aria-label="Close">
              ×
            </button>
            {sentRequest ? (
              <>
                <h1 style={{ fontSize: 18 }}>Request sent</h1>
                <p className="subtitle" style={{ marginBottom: 20 }}>
                  {sentRequest.toClientId
                    ? `${appointmentTarget.name} is already on HuntsTAG -- they've been emailed, and it's waiting on their Appointment Requests page.`
                    : `We texted ${appointmentTarget.name} a link to create an account and see it -- that text needs your SMS provider's template approved before it actually delivers (ask your dev if unsure).`}
                </p>
                <p className="hint" style={{ margin: '0 0 12px' }}>
                  Want to make sure it doesn't get missed? Send it yourself too:
                </p>
                <a
                  href={`https://wa.me/${waNumber(appointmentTarget.phone)}?text=${encodeURIComponent(
                    sentRequest.toClientId
                      ? `Hi ${appointmentTarget.name.split(' ')[0]}, I just sent you an appointment request on HuntsTAG${
                          sentRequest.proposedAt ? ` for ${new Date(sentRequest.proposedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : ''
                        }. Check it out: ${window.location.origin}/dashboard/appointments`
                      : `Hi, I'd like to schedule an appointment with you${
                          sentRequest.proposedAt ? ` for ${new Date(sentRequest.proposedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : ''
                        }. Create your free HuntsTAG account to see my request: ${window.location.origin}/register`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    background: '#25D366',
                    color: '#06120f',
                    fontWeight: 700,
                    fontSize: 14,
                    padding: 13,
                    borderRadius: 9,
                    textDecoration: 'none',
                    marginBottom: 10,
                  }}
                >
                  Send via WhatsApp
                </a>
                <button type="button" className="secondary" onClick={() => setAppointmentTarget(null)}>
                  Done
                </button>
              </>
            ) : (
              <>
                <h1 style={{ fontSize: 18 }}>Request an appointment</h1>
                <p className="subtitle" style={{ marginBottom: 20 }}>
                  {appointmentTarget.name}
                  {' — '}
                  if they're already on HuntsTAG they'll see this on their Appointment Requests page (and get
                  emailed); otherwise we'll text them a link to create an account and view it.
                </p>
                {appointmentError && <div className="error-banner">{appointmentError}</div>}
                <form onSubmit={handleSendAppointment}>
                  <div className="field">
                    <label htmlFor="appointmentProposedAt">Proposed date &amp; time (optional)</label>
                    <input
                      id="appointmentProposedAt"
                      type="datetime-local"
                      value={appointmentProposedAt}
                      min={toDatetimeLocalValue(new Date())}
                      onChange={(e) => setAppointmentProposedAt(e.target.value)}
                    />
                    {busyTimes.length > 0 && (
                      <p className="hint" style={{ margin: '6px 0 0' }}>
                        {appointmentTarget.name} already has an appointment around:{' '}
                        {busyTimes
                          .map((t) =>
                            new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                          )
                          .join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="field">
                    <label htmlFor="appointmentNote">Note (optional)</label>
                    <textarea
                      id="appointmentNote"
                      rows={3}
                      maxLength={500}
                      value={appointmentNote}
                      onChange={(e) => setAppointmentNote(e.target.value)}
                      placeholder="What's this about…"
                      style={{
                        width: '100%',
                        background: 'var(--panel-raised)',
                        border: '1px solid var(--panel-border)',
                        borderRadius: 9,
                        padding: '11px 13px',
                        color: 'var(--text)',
                        fontSize: 14,
                        fontFamily: 'var(--font-ui)',
                        resize: 'vertical',
                      }}
                    />
                  </div>
                  <button type="submit" disabled={appointmentSending}>
                    {appointmentSending ? 'Sending…' : 'Send request'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
