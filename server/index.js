require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const axios   = require('axios');
const fs      = require('fs');
const path    = require('path');
const OAuthClient = require('intuit-oauth');

const { MongoClient } = require('mongodb');
const jwt        = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const { Resend }  = require('resend');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── CORS ────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'http://localhost:5176',
  'http://127.0.0.1:5176',
  'https://greensun-estimator-production.up.railway.app',
];
app.use(cors({
  origin: (origin, callback) => {
    // Allow Electron apps (null/file:// origin) and known web origins
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// ── Token storage path ───────────────────────────────────────────────────────
const TOKENS_FILE = path.join(__dirname, '.qbo-tokens.json');

function readTokens() {
  try {
    if (!fs.existsSync(TOKENS_FILE)) return null;
    return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeTokens(tokens) {
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2), 'utf8');
}

function deleteTokens() {
  try { fs.unlinkSync(TOKENS_FILE); } catch { /* ignore */ }
}

// ── OAuth client factory ─────────────────────────────────────────────────────
function makeOAuthClient() {
  return new OAuthClient({
    clientId:     process.env.QBO_CLIENT_ID,
    clientSecret: process.env.QBO_CLIENT_SECRET,
    environment:  'production',
    redirectUri:  process.env.QBO_REDIRECT_URI || 'http://localhost:3001/auth/callback',
  });
}

// ── Token refresh helper ──────────────────────────────────────────────────────
async function getValidTokens() {
  const tokens = readTokens();
  if (!tokens || !tokens.access_token) throw new Error('Not connected to QuickBooks');

  const createdAt  = tokens.createdAt  || 0;
  const expiresIn  = tokens.expires_in || 3600;
  const isExpired  = (Date.now() - createdAt) > (expiresIn - 60) * 1000;

  if (isExpired) {
    const oauthClient = makeOAuthClient();
    oauthClient.setToken(tokens);
    const refreshed = await oauthClient.refresh();
    const newTokenData = refreshed.getJson();
    const merged = {
      ...tokens,
      ...newTokenData,
      createdAt: Date.now(),
    };
    writeTokens(merged);
    return merged;
  }

  return tokens;
}

// ── QBO API base URL ─────────────────────────────────────────────────────────
const QBO_BASE = 'https://quickbooks.api.intuit.com';

function qboHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

// ── MongoDB ──────────────────────────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI ||
  'mongodb+srv://ivanark:Iv200151!@greensunestimator.akya4pl.mongodb.net/?appName=GreenSunEstimator';
let mongoClient, db;

async function connectMongo() {
  mongoClient = new MongoClient(MONGODB_URI, {
    tls: true,
    tlsInsecure: true,
  });
  await mongoClient.connect();
  db = mongoClient.db('greensun');
  console.log('Connected to MongoDB');
}

// ── App data persistence (MongoDB) ───────────────────────────────────────────
async function readAppData() {
  try {
    if (!db) return {};
    const doc = await db.collection('appdata').findOne({ _id: 'main' });
    return doc ? doc.data : {};
  } catch { return {}; }
}

async function writeAppData(data) {
  if (!db) return;
  await db.collection('appdata').updateOne(
    { _id: 'main' },
    { $set: { data, updatedAt: new Date() } },
    { upsert: true }
  );
}

// ── Azure AD JWT validation ──────────────────────────────────────────────────
const TENANT_ID = process.env.AZURE_TENANT_ID || 'b0ef5554-1d19-4200-a5d9-3544e65f0574';
const CLIENT_ID = process.env.AZURE_CLIENT_ID || '6d3e9ad5-f2c4-4542-b1f4-43d64838e122';

const jwks = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`,
  cache: true,
  rateLimit: true,
});

async function validateToken(token) {
  if (!token) throw new Error('No token');
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded?.header?.kid) throw new Error('Invalid token');
  const key = await jwks.getSigningKey(decoded.header.kid);
  // Verify signature only — issuer varies by account type
  const verified = jwt.verify(token, key.getPublicKey(), {
    algorithms: ['RS256'],
  });
  // Ensure the token is from our Azure tenant
  const iss = verified.iss || '';
  if (!iss.includes(TENANT_ID)) {
    throw new Error('Token is not from the expected Azure tenant');
  }
  return verified;
}

async function authMiddleware(req, res, next) {
  // Skip auth in development
  if (process.env.NODE_ENV === 'development') return next();
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '').trim();
    const claims = await validateToken(token);
    const email = claims.preferred_username || claims.email || '';
    // Check allowlist
    const allowed = await db.collection('allowlist').findOne({ email: email.toLowerCase() });
    if (!allowed) return res.status(403).json({ error: 'Access denied. Your email is not on the allowlist.' });
    req.user = { email, name: claims.name || '' };
    next();
  } catch (err) {
    res.status(401).json({ error: 'Unauthorized', detail: err.message });
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /api/auth/check — validate token and check/seed allowlist (unprotected)
app.get('/api/auth/check', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '').trim();
    const claims = await validateToken(token);
    const email = (claims.preferred_username || claims.email || '').toLowerCase();
    // If allowlist is empty, add this user as first admin
    const count = await db.collection('allowlist').countDocuments();
    if (count === 0) {
      await db.collection('allowlist').insertOne({ email, addedAt: new Date(), isAdmin: true });
    }
    const allowed = await db.collection('allowlist').findOne({ email });
    if (!allowed) return res.status(403).json({ allowed: false, email });
    res.json({ allowed: true, email, name: claims.name || '', isAdmin: allowed.isAdmin || false });
  } catch (err) {
    res.status(401).json({ allowed: false, error: err.message });
  }
});

// GET /api/data — return full app data
app.get('/api/data', authMiddleware, async (_req, res) => {
  res.json(await readAppData());
});

// POST /api/data — overwrite app data
app.post('/api/data', authMiddleware, async (req, res) => {
  try {
    await writeAppData(req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/qbo/status
app.get('/api/qbo/status', authMiddleware, (req, res) => {
  try {
    const tokens = readTokens();
    const connected = !!(tokens && tokens.access_token);
    res.json({ connected });
  } catch (err) {
    res.json({ connected: false });
  }
});

// GET /auth/quickbooks — redirect to QBO OAuth
app.get('/auth/quickbooks', (req, res) => {
  try {
    const oauthClient = makeOAuthClient();
    const authUri = oauthClient.authorizeUri({
      scope: [OAuthClient.scopes.Accounting],
      state: 'greensun',
    });
    res.redirect(authUri);
  } catch (err) {
    console.error('Auth redirect error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /auth/callback
app.get('/auth/callback', async (req, res) => {
  try {
    const oauthClient = makeOAuthClient();
    const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const token   = await oauthClient.createToken(fullUrl);
    const tokenData = token.getJson();
    const tokens = {
      ...tokenData,
      realmId:   req.query.realmId,
      createdAt: Date.now(),
    };
    writeTokens(tokens);
    res.send(`<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:60px">
      <h2 style="color:#27AE60">✓ QuickBooks Connected!</h2>
      <p>You can close this tab and return to GreenSun Estimator.</p>
    </body></html>`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).send(`OAuth error: ${err.message}`);
  }
});

// POST /api/qbo/push-invoice
app.post('/api/qbo/push-invoice', authMiddleware, async (req, res) => {
  try {
    const { invoice, clientAddress } = req.body;
    if (!invoice) return res.status(400).json({ error: 'invoice is required' });

    const tokens  = await getValidTokens();
    const headers = qboHeaders(tokens.access_token);
    const realmId = tokens.realmId;

    // 1. Find or create customer
    let customerId;
    const queryUrl = `${QBO_BASE}/v3/company/${realmId}/query?query=SELECT * FROM Customer WHERE DisplayName = '${invoice.clientName.replace(/'/g, "\\'")}'&minorversion=65`;

    const queryResp = await axios.get(queryUrl, { headers });
    const customers = queryResp.data?.QueryResponse?.Customer || [];

    if (customers.length > 0) {
      customerId = customers[0].Id;
    } else {
      const addr = clientAddress || '';
      const customerPayload = {
        DisplayName: invoice.clientName,
        BillAddr: {
          Line1:                 addr,
          City:                  '',
          CountrySubDivisionCode: 'MN',
          PostalCode:            '',
        },
      };
      const createCustResp = await axios.post(
        `${QBO_BASE}/v3/company/${realmId}/customer?minorversion=65`,
        customerPayload,
        { headers }
      );
      customerId = createCustResp.data?.Customer?.Id;
    }

    if (!customerId) throw new Error('Failed to get or create QBO customer');

    // 2. Get a Service item
    const itemQueryResp = await axios.get(
      `${QBO_BASE}/v3/company/${realmId}/query?query=SELECT * FROM Item WHERE Type = 'Service' MAXRESULTS 1&minorversion=65`,
      { headers }
    );
    const items = itemQueryResp.data?.QueryResponse?.Item || [];
    if (items.length === 0) throw new Error('No Service items found in QBO. Please create at least one Service item in QuickBooks.');
    const serviceItemId = items[0].Id;

    // 3. Create invoice
    const invoicePayload = {
      CustomerRef: { value: customerId },
      DocNumber:   invoice.invoiceNumber,
      DueDate:     invoice.dueDate,
      Line: [
        {
          Amount:     invoice.total,
          DetailType: 'SalesItemLineDetail',
          Description: `Services for ${invoice.clientName} — ${invoice.invoiceNumber}`,
          SalesItemLineDetail: {
            ItemRef:    { value: serviceItemId },
            UnitPrice:  invoice.total,
            Qty:        1,
          },
        },
      ],
    };

    const createInvResp = await axios.post(
      `${QBO_BASE}/v3/company/${realmId}/invoice?minorversion=65`,
      invoicePayload,
      { headers }
    );

    const qboInvoice = createInvResp.data?.Invoice;
    if (!qboInvoice) throw new Error('Failed to create QBO invoice');

    res.json({
      qboInvoiceId:  qboInvoice.Id,
      qboCustomerId: customerId,
      qboDocNumber:  qboInvoice.DocNumber,
    });
  } catch (err) {
    console.error('Push invoice error:', err?.response?.data || err.message);
    const detail = err?.response?.data ? JSON.stringify(err.response.data) : err.message;
    res.status(500).json({ error: detail });
  }
});

// POST /api/qbo/sync
app.post('/api/qbo/sync', authMiddleware, async (req, res) => {
  try {
    const { qboInvoiceIds } = req.body;
    if (!Array.isArray(qboInvoiceIds) || qboInvoiceIds.length === 0) {
      return res.json({});
    }

    const tokens  = await getValidTokens();
    const headers = qboHeaders(tokens.access_token);
    const realmId = tokens.realmId;
    const today   = new Date().toISOString().split('T')[0];
    const result  = {};

    await Promise.all(
      qboInvoiceIds.map(async (qboId) => {
        try {
          const resp = await axios.get(
            `${QBO_BASE}/v3/company/${realmId}/invoice/${qboId}?minorversion=65`,
            { headers }
          );
          const inv         = resp.data?.Invoice;
          if (!inv) return;
          const balance     = inv.Balance ?? 0;
          const emailStatus = inv.EmailStatus || '';
          const dueDate     = inv.DueDate || '';

          let qboStatus;
          if (balance === 0) {
            qboStatus = 'paid';
          } else if (balance > 0 && dueDate && today > dueDate) {
            qboStatus = 'overdue';
          } else if (balance > 0 && emailStatus === 'EmailSent') {
            qboStatus = 'sent';
          } else {
            qboStatus = 'draft';
          }

          result[qboId] = { balance, emailStatus, dueDate, qboStatus };
        } catch (err) {
          console.error(`Sync error for invoice ${qboId}:`, err?.response?.data || err.message);
          result[qboId] = { error: err.message };
        }
      })
    );

    res.json(result);
  } catch (err) {
    console.error('Sync error:', err?.response?.data || err.message);
    const detail = err?.response?.data ? JSON.stringify(err.response.data) : err.message;
    res.status(500).json({ error: detail });
  }
});

// POST /api/qbo/disconnect
app.post('/api/qbo/disconnect', authMiddleware, (req, res) => {
  try {
    deleteTokens();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Allowlist management routes ───────────────────────────────────────────────
app.get('/api/allowlist', authMiddleware, async (req, res) => {
  const list = await db.collection('allowlist').find({}).toArray();
  res.json(list.map(e => ({ email: e.email, isAdmin: e.isAdmin || false, addedAt: e.addedAt })));
});

app.post('/api/allowlist', authMiddleware, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });
  await db.collection('allowlist').updateOne(
    { email: email.toLowerCase() },
    { $set: { email: email.toLowerCase(), addedAt: new Date() } },
    { upsert: true }
  );
  res.json({ ok: true });
});

app.delete('/api/allowlist/:email', authMiddleware, async (req, res) => {
  await db.collection('allowlist').deleteOne({ email: req.params.email.toLowerCase() });
  res.json({ ok: true });
});

// ── Email: Send estimate for signature ────────────────────────────────────────
const resend = new Resend(process.env.RESEND_API_KEY);
const RAILWAY_URL = process.env.RAILWAY_URL || 'https://greensun-estimator-production.up.railway.app';
const FROM_EMAIL  = process.env.FROM_EMAIL  || 'onboarding@resend.dev';

app.post('/api/send-estimate', authMiddleware, async (req, res) => {
  try {
    const { contractId, clientName, clientEmail, estimateNumber, contractText } = req.body;
    if (!clientEmail) return res.status(400).json({ error: 'clientEmail is required' });

    const signLink = `${RAILWAY_URL}/sign/${contractId}`;

    await resend.emails.send({
      from: FROM_EMAIL,
      to:   clientEmail,
      subject: `GreenSun Landscapes — Estimate #${estimateNumber} Ready for Review`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#111;padding:24px;border-radius:8px 8px 0 0">
            <h1 style="color:#27AE60;margin:0;font-size:22px">GreenSun Landscapes</h1>
          </div>
          <div style="background:#f9fafb;padding:32px;border-radius:0 0 8px 8px;border:1px solid #e5e7eb">
            <p style="font-size:16px;color:#111;margin-top:0">Hi ${clientName},</p>
            <p style="color:#444">Your estimate <strong>#${estimateNumber}</strong> is ready for review. Please click the button below to view your estimate, review the service agreement, and sign electronically.</p>
            <div style="text-align:center;margin:32px 0">
              <a href="${signLink}" style="background:#27AE60;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600;display:inline-block">
                Review & Sign Estimate →
              </a>
            </div>
            <p style="color:#888;font-size:13px">This link is unique to your estimate. If you have questions, reply to this email or call us at 715-347-2340.</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
            <p style="color:#aaa;font-size:11px;margin:0">GreenSun Landscapes LLC · 7221 Chicago Avenue, Minneapolis MN 55423 · info@greensun.co</p>
          </div>
        </div>
      `,
    });

    // Store pending signature record in MongoDB
    await db.collection('signatures').updateOne(
      { contractId },
      { $set: { contractId, clientName, clientEmail, estimateNumber, contractText: contractText || '', status: 'pending', sentAt: new Date(), signedAt: null, signatureData: null } },
      { upsert: true }
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('Send estimate error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Public: Signature page data ───────────────────────────────────────────────
app.get('/sign/:contractId', async (req, res) => {
  try {
    const { contractId } = req.params;
    const appData = await readAppData();
    const contract = (appData.contracts || []).find(c => c.id === contractId);
    const sig = await db.collection('signatures').findOne({ contractId });
    if (!contract || !sig) return res.status(404).send('<h2>Estimate not found or link expired.</h2>');

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>GreenSun Estimate #${sig.estimateNumber}</title>
  <style>
    body { font-family: sans-serif; background: #f9fafb; margin: 0; padding: 20px; }
    .container { max-width: 700px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
    .header { background: #111; padding: 24px 32px; }
    .header h1 { color: #27AE60; margin: 0; font-size: 22px; }
    .body { padding: 32px; }
    .contract-box { background: #f3f4f6; border-radius: 8px; padding: 20px; font-size: 13px; color: #444; white-space: pre-wrap; max-height: 300px; overflow-y: auto; border: 1px solid #e5e7eb; margin: 20px 0; }
    canvas { border: 2px solid #27AE60; border-radius: 8px; cursor: crosshair; display: block; margin: 16px 0; }
    .btn { background: #27AE60; color: white; border: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; }
    .btn:disabled { background: #aaa; cursor: not-allowed; }
    .btn-clear { background: #e5e7eb; color: #444; border: none; padding: 8px 16px; border-radius: 6px; font-size: 13px; cursor: pointer; margin-left: 8px; }
    .success { background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 24px; text-align: center; color: #166534; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>GreenSun Landscapes — Estimate #${sig.estimateNumber}</h1></div>
    <div class="body">
      ${sig.status === 'signed' ? `
        <div class="success">
          <h2>✓ Already Signed</h2>
          <p>This estimate was signed on ${new Date(sig.signedAt).toLocaleDateString()}. Thank you, ${sig.clientName}!</p>
        </div>
      ` : `
        <p style="color:#444">Hi <strong>${sig.clientName}</strong>, please review your estimate and service agreement below, then sign in the box to approve.</p>
        ${sig.contractText ? `<div class="contract-box">${sig.contractText}</div>` : ''}
        <h3 style="margin-bottom:8px">Your Signature</h3>
        <canvas id="sig-canvas" width="600" height="150"></canvas>
        <div>
          <button class="btn-clear" onclick="clearSig()">Clear</button>
        </div>
        <p style="font-size:12px;color:#888">By clicking "Approve & Sign" you agree to the estimate and service agreement above.</p>
        <button class="btn" id="submit-btn" onclick="submitSig('${contractId}')">Approve & Sign</button>
        <div id="msg" style="margin-top:16px;font-size:14px"></div>
      `}
    </div>
  </div>
  <script>
    const canvas = document.getElementById('sig-canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      let drawing = false;
      canvas.addEventListener('mousedown', e => { drawing = true; ctx.beginPath(); ctx.moveTo(e.offsetX, e.offsetY); });
      canvas.addEventListener('mousemove', e => { if (!drawing) return; ctx.lineTo(e.offsetX, e.offsetY); ctx.stroke(); });
      canvas.addEventListener('mouseup', () => drawing = false);
      canvas.addEventListener('touchstart', e => { e.preventDefault(); drawing = true; const t = e.touches[0]; const r = canvas.getBoundingClientRect(); ctx.beginPath(); ctx.moveTo(t.clientX - r.left, t.clientY - r.top); });
      canvas.addEventListener('touchmove', e => { e.preventDefault(); if (!drawing) return; const t = e.touches[0]; const r = canvas.getBoundingClientRect(); ctx.lineTo(t.clientX - r.left, t.clientY - r.top); ctx.stroke(); });
      canvas.addEventListener('touchend', () => drawing = false);
    }
    function clearSig() { const c = document.getElementById('sig-canvas'); if(c) c.getContext('2d').clearRect(0,0,c.width,c.height); }
    async function submitSig(contractId) {
      const c = document.getElementById('sig-canvas');
      const signatureData = c.toDataURL();
      const btn = document.getElementById('submit-btn');
      btn.disabled = true; btn.textContent = 'Submitting…';
      const res = await fetch('/sign/' + contractId, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ signatureData }) });
      const data = await res.json();
      if (data.ok) { document.getElementById('msg').innerHTML = '<div style="color:#166534;background:#f0fdf4;padding:16px;border-radius:8px;text-align:center"><strong>✓ Signed! Thank you.</strong><br>A copy will be emailed to you shortly.</div>'; btn.style.display='none'; }
      else { document.getElementById('msg').textContent = 'Error: ' + data.error; btn.disabled = false; btn.textContent = 'Approve & Sign'; }
    }
  </script>
</body>
</html>`);
  } catch (err) {
    res.status(500).send(`<h2>Error: ${err.message}</h2>`);
  }
});

// ── Public: Submit signature ───────────────────────────────────────────────────
app.post('/sign/:contractId', async (req, res) => {
  try {
    const { contractId } = req.params;
    const { signatureData } = req.body;
    const sig = await db.collection('signatures').findOne({ contractId });
    if (!sig) return res.status(404).json({ error: 'Not found' });

    await db.collection('signatures').updateOne(
      { contractId },
      { $set: { status: 'signed', signedAt: new Date(), signatureData } }
    );

    // Email notification to GreenSun
    const adminEmail = process.env.ADMIN_EMAIL || 'info@greensun.co';
    await resend.emails.send({
      from: FROM_EMAIL,
      to:   adminEmail,
      subject: `✓ Estimate #${sig.estimateNumber} Signed by ${sig.clientName}`,
      html: `<p><strong>${sig.clientName}</strong> has approved and signed estimate <strong>#${sig.estimateNumber}</strong>.</p><p>Signed at: ${new Date().toLocaleString()}</p><p>Log in to GreenSun Estimator to convert this quote to an active job.</p>`,
    });

    // Email copy to client
    await resend.emails.send({
      from: FROM_EMAIL,
      to:   sig.clientEmail,
      subject: `GreenSun Landscapes — Your Signed Estimate #${sig.estimateNumber}`,
      html: `<p>Hi ${sig.clientName},</p><p>Thank you for approving estimate <strong>#${sig.estimateNumber}</strong>. We'll be in touch shortly to confirm your start date.</p><p>— GreenSun Landscapes</p>`,
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Get signature status ───────────────────────────────────────────────────────
app.get('/api/signature/:contractId', authMiddleware, async (req, res) => {
  try {
    const sig = await db.collection('signatures').findOne({ contractId: req.params.contractId });
    res.json(sig || { status: 'not_sent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
connectMongo().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GreenSun QBO server running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to connect to MongoDB:', err);
  process.exit(1);
});
