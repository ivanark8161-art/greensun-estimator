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
    res.redirect(process.env.APP_URL ? `${process.env.APP_URL}/invoices` : 'http://127.0.0.1:5176/invoices');
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

// ── Start ─────────────────────────────────────────────────────────────────────
connectMongo().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GreenSun QBO server running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to connect to MongoDB:', err);
  process.exit(1);
});
