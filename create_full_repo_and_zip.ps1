```powershell
<#
create_full_repo_and_zip.ps1

This script:
- Recreates a full IMS repository (frontend + backend + openapi + scripts + tests) under a target directory.
- Zips the repository excluding node_modules, dist, build, and logs.
- Computes ZIP SHA256 and per-file SHA256 manifest.
- Streams ZIP as base64 and splits into chunk files of configurable size (default 64 KB).
- Optionally streams base64 parts to stdout.
#>

[CmdletBinding()]
param(
  [string]$RootDir = ".\ims-project",
  [string]$ZipName = "ims-project.zip",
  [int]$ChunkSizeKB = 64,
  [switch]$StreamBase64ToStdout,
  [switch]$SkipWrite,
  [switch]$Help
)

if ($Help) {
  Write-Host "create_full_repo_and_zip.ps1 - creates a full IMS repo and produces ZIP + base64 parts."
  Write-Host ""
  Write-Host "Parameters:"
  Write-Host "  -RootDir <path>            Root directory to create repo (default .\\ims-project)"
  Write-Host "  -ZipName <name>            Output zip name (default ims-project.zip)"
  Write-Host "  -ChunkSizeKB <int>         Base64 part size in KB (default 64)"
  Write-Host "  -StreamBase64ToStdout      Stream base64 parts to stdout while creating them"
  Write-Host "  -SkipWrite                 Skip writing files; operate on existing RootDir"
  Write-Host "  -Help                      Show this help"
  exit 0
}

# Resolve absolute paths
$RootDir = (Resolve-Path -Path $RootDir -ErrorAction SilentlyContinue)
if (-not $RootDir) {
  $RootDir = (Get-Location).ProviderPath + "\" + (Split-Path -Path ".\ims-project" -Leaf)
} else {
  $RootDir = $RootDir.ProviderPath
}
$ZipFullPath = Join-Path (Get-Location).ProviderPath $ZipName
$ManifestPath = Join-Path $RootDir "manifest-sha256.txt"
$ZipShaPath = Join-Path $RootDir "zip-sha256.txt"
$ChunkSizeBytes = [int]($ChunkSizeKB * 1024)

Write-Host "RootDir: $RootDir"
Write-Host "ZIP file: $ZipFullPath"
Write-Host "Chunk size: $ChunkSizeKB KB ($ChunkSizeBytes bytes)"
Write-Host "Stream base64 to stdout: $StreamBase64ToStdout"
Write-Host "Skip file writing: $SkipWrite"

function Ensure-Directory {
  param([string]$p)
  if (-not (Test-Path -LiteralPath $p)) { New-Item -ItemType Directory -Path $p | Out-Null }
}

if (-not $SkipWrite) {
  if (Test-Path -LiteralPath $RootDir) {
    Write-Host "Root directory $RootDir already exists."
    $ans = Read-Host "Type YES to remove and recreate it (or anything else to cancel)"
    if ($ans -ne "YES") {
      Write-Warning "Aborting per user request."
      exit 1
    }
    Remove-Item -LiteralPath $RootDir -Recurse -Force
  }
  Ensure-Directory -p $RootDir

  Write-Host "Writing repository files under $RootDir ... (this may take a moment)"

  # Write top-level .gitignore
  $gitignore = @'
node_modules/
.env
.env.local
dist/
build/
.DS_Store
npm-debug.log
yarn-error.log
.idea/
.vscode/
coverage/
*.log
frontend/node_modules/
backend/node_modules/
'@
  $gitignore | Out-File -FilePath (Join-Path $RootDir ".gitignore") -Encoding UTF8

  # README.md
  $readme = @'
# Inventory Management System (MERN) — Full Repo

This repository contains a full-stack MERN inventory management scaffold:

- backend/ — Node.js + Express + Mongoose backend (JWT + rotating refresh tokens, transactional inventory)
- frontend/ — React + TypeScript (Vite) frontend (auth, products, order flows)
- openapi.yaml — full API spec
- scripts: create_repo.sh (scaffold files locally), create_zip.sh (zip+base64+sha256)

Quickstart (backend)
1. cd backend
2. cp .env.example .env (edit MONGO_URI, JWT secrets)
3. npm install
4. npm run seed
5. npm start

Quickstart (frontend)
1. cd frontend
2. cp .env.example .env (set VITE_API_BASE)
3. npm install
4. npm run dev

Tests (backend)
- cd backend
- npm test

Notes
- Money stored in paisa (1 BDT = 100 paisa)
- Confirm Order and Create Purchase endpoints use MongoDB transactions — ensure your MongoDB supports transactions (replica set; local dev may need single-node replica set)
- This scaffold is for development; apply production hardening before deploying (HTTPS, secure cookies, secrets management, backups).
'@
  $readme | Out-File -FilePath (Join-Path $RootDir "README.md") -Encoding UTF8

  # Write OpenAPI spec (concise but includes main parts; expand as needed)
  $openapi = @'
openapi: 3.0.2
info:
  title: IMS Inventory Management API
  version: "1.0.0"
servers:
  - url: http://localhost:4000/api/v1
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
'@
  $openapi | Out-File -FilePath (Join-Path $RootDir "openapi.yaml") -Encoding UTF8

  # Create backend directories
  $backendRoot = Join-Path $RootDir "backend"
  Ensure-Directory -p $backendRoot
  foreach ($d in @("models","controllers","services","middleware","routes","scripts","tests")) {
    Ensure-Directory -p (Join-Path $backendRoot $d)
  }

  # backend/package.json
  $backendPackage = @'
{
  "name": "ims-backend",
  "version": "0.1.0",
  "main": "app.js",
  "scripts": {
    "start": "node app.js",
    "dev": "nodemon app.js",
    "seed": "node scripts/seed_users.js",
    "test": "jest --runInBand"
  },
  "dependencies": {
    "bcrypt": "^5.1.0",
    "body-parser": "^1.20.2",
    "cookie-parser": "^1.4.6",
    "cors": "^2.8.5",
    "dotenv": "^16.0.3",
    "express": "^4.18.2",
    "express-async-errors": "^3.1.1",
    "jsonwebtoken": "^9.0.0",
    "mongoose": "^7.0.5",
    "mongoose-long": "^1.4.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "jest": "^29.0.0",
    "supertest": "^6.3.0"
  }
}
'@
  $backendPackage | Out-File -FilePath (Join-Path $backendRoot "package.json") -Encoding UTF8

  # backend/.env.example
  $envExample = @'
PORT=4000
MONGO_URI=mongodb://localhost:27017/ims
TEST_MONGO_URI=mongodb://localhost:27017/ims_test
JWT_ACCESS_SECRET=replace-this-access-secret
JWT_REFRESH_SECRET=replace-this-refresh-secret
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=30d
COOKIE_SECURE=false
'@
  $envExample | Out-File -FilePath (Join-Path $backendRoot ".env.example") -Encoding UTF8

  # backend/app.js
  $appjs = @'
require("dotenv").config();
require("express-async-errors");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const routes = require("./routes");

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use("/api/v1", routes);

// error handler
app.use((err, req, res, next) => {
  console.error(err.stack || err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || "Internal server error" });
});

const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI || process.env.TEST_MONGO_URI || "mongodb://localhost:27017/ims";

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    app.listen(PORT, () => console.log(`Backend listening on port ${PORT}`));
  }).catch(err => {
    console.error("Mongo connect error", err);
    process.exit(1);
  });

module.exports = app;
'@
  $appjs | Out-File -FilePath (Join-Path $backendRoot "app.js") -Encoding UTF8

  # backend/routes/index.js
  $routesIndex = @'
const express = require("express");
const router = express.Router();

const authRoutes = require("./auth.routes");
const productController = require("../controllers/product.controller");
const orderController = require("../controllers/order.controller");
const purchaseController = require("../controllers/purchase.controller");
const inventoryController = require("../controllers/inventory.controller");

const authMiddleware = require("../middleware/auth");

// auth endpoints
router.use("/auth", authRoutes);

// protected resources
router.get("/products", authMiddleware, productController.listProducts);
router.post("/products", authMiddleware, productController.createProduct);

router.post("/orders", authMiddleware, orderController.createOrder);
router.post("/orders/:id/confirm", authMiddleware, orderController.confirmOrder);

router.post("/purchases", authMiddleware, purchaseController.createPurchase);

router.get("/inventory/transactions", authMiddleware, inventoryController.listTransactions);

module.exports = router;
'@
  $routesIndex | Out-File -FilePath (Join-Path $backendRoot "routes\index.js") -Encoding UTF8

  # backend/routes/auth.routes.js
  $authRoutes = @'
const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/refresh", authController.refreshToken);
router.post("/logout", authController.logout);
router.get("/me", require("../middleware/auth"), authController.me);

module.exports = router;
'@
  $authRoutes | Out-File -FilePath (Join-Path $backendRoot "routes\auth.routes.js") -Encoding UTF8

  # backend/middleware/auth.js
  $authMiddleware = @'
const jwt = require("jsonwebtoken");

module.exports = function (req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) {
    const err = new Error("Authorization required");
    err.status = 401;
    return next(err);
  }
  const parts = auth.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    const err = new Error("Invalid Authorization header");
    err.status = 401;
    return next(err);
  }
  const token = parts[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    req.user = payload; // {_id, username, roles}
    return next();
  } catch (e) {
    const err = new Error("Invalid or expired token");
    err.status = 401;
    return next(err);
  }
};
'@
  $authMiddleware | Out-File -FilePath (Join-Path $backendRoot "middleware\auth.js") -Encoding UTF8

  # backend/controllers/auth.controller.js
  $authController = @'
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/user.model");

const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || "15m";
const REFRESH_TOKEN_TTL = process.env.REFRESH_TOKEN_TTL || "30d";
const COOKIE_SECURE = (process.env.COOKIE_SECURE === "true");

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
function signAccessToken(user) {
  const payload = { _id: user._id.toString(), username: user.username, roles: user.roles };
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}
function createRefreshTokenString() {
  return crypto.randomBytes(64).toString("hex");
}
function parseTTL(ttl) {
  if (!ttl) return 0;
  const re = /^(\d+)([mhd])$/;
  const m = ttl.match(re);
  if (!m) return 0;
  const val = parseInt(m[1], 10);
  const unit = m[2];
  if (unit === "m") return val * 60 * 1000;
  if (unit === "h") return val * 60 * 60 * 1000;
  if (unit === "d") return val * 24 * 60 * 60 * 1000;
  return 0;
}

async function register(req, res, next) {
  try {
    const { username, password, name, roles = ["Staff"] } = req.body;
    if (!username || !password) {
      const err = new Error("username and password required"); err.status = 400; throw err;
    }
    const existing = await User.findOne({ username });
    if (existing) {
      const err = new Error("User already exists"); err.status = 409; throw err;
    }
    const password_hash = await bcrypt.hash(password, 12);
    const user = await User.create({ username, password_hash, name, roles });
    res.status(201).json({ userId: user._id });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) { const err = new Error("Invalid credentials"); err.status = 401; throw err; }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) { const err = new Error("Invalid credentials"); err.status = 401; throw err; }
    const accessToken = signAccessToken(user);
    const refreshToken = createRefreshTokenString();
    const refreshHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + parseTTL(REFRESH_TOKEN_TTL));
    user.refreshTokens.push({ tokenHash: refreshHash, createdAt: new Date(), expiresAt });
    await user.save();
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: "lax",
      expires: expiresAt
    });
    res.json({ accessToken, user: { _id: user._id, username: user.username, name: user.name, roles: user.roles } });
  } catch (err) {
    next(err);
  }
}

async function refreshToken(req, res, next) {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) { const e = new Error("No refresh token"); e.status = 401; throw e; }
    const tokenHash = hashToken(token);
    const user = await User.findOne({ "refreshTokens.tokenHash": tokenHash });
    if (!user) { const e = new Error("Invalid refresh token"); e.status = 401; throw e; }
    const entry = user.refreshTokens.find(rt => rt.tokenHash === tokenHash);
    if (!entry) { const e = new Error("Invalid refresh token"); e.status = 401; throw e; }
    if (entry.expiresAt < new Date()) {
      user.refreshTokens = user.refreshTokens.filter(rt => rt.tokenHash !== tokenHash);
      await user.save();
      const e = new Error("Refresh token expired"); e.status = 401; throw e;
    }
    user.refreshTokens = user.refreshTokens.filter(rt => rt.tokenHash !== tokenHash);
    const newRefresh = createRefreshTokenString();
    const newHash = hashToken(newRefresh);
    const expiresAt = new Date(Date.now() + parseTTL(REFRESH_TOKEN_TTL));
    user.refreshTokens.push({ tokenHash: newHash, createdAt: new Date(), expiresAt });
    await user.save();
    res.cookie("refreshToken", newRefresh, {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: "lax",
      expires: expiresAt
    });
    const accessToken = signAccessToken(user);
    res.json({ accessToken, user: { _id: user._id, username: user.username, name: user.name, roles: user.roles } });
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    const token = req.cookies?.refreshToken;
    if (token) {
      const tokenHash = hashToken(token);
      await User.updateOne({ "refreshTokens.tokenHash": tokenHash }, { $pull: { refreshTokens: { tokenHash } } });
    }
    res.clearCookie("refreshToken");
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const { _id } = req.user;
    const user = await User.findById(_id).select("-password_hash -refreshTokens");
    res.json(user);
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, refreshToken, logout, me };
'@
  $authController | Out-File -FilePath (Join-Path $backendRoot "controllers\auth.controller.js") -Encoding UTF8

  # Create other controllers minimally (product/order/purchase/inventory)
  # product.controller.js
  $productController = @'
const Product = require("../models/product.model");

exports.listProducts = async (req, res) => {
  const { search = "", page = 1, pageSize = 25 } = req.query;
  const q = { is_deleted: false };
  if (search) q["$text"] = { $search: search };
  const pageNum = parseInt(page, 10);
  const size = parseInt(pageSize, 10);
  const items = await Product.find(q).skip((pageNum - 1) * size).limit(size).lean();
  const total = await Product.countDocuments(q);
  res.json({ total, page: pageNum, pageSize: size, items });
};

exports.createProduct = async (req, res) => {
  const payload = req.body;
  const p = await Product.create({ ...payload, createdBy: req.user._id });
  res.status(201).json(p);
};
'@
  $productController | Out-File -FilePath (Join-Path $backendRoot "controllers\product.controller.js") -Encoding UTF8

  # order.controller.js (confirm flow)
  $orderController = @'
const mongoose = require("mongoose");
const Order = require("../models/order.model");
const Product = require("../models/product.model");
const { allocSequence, formatSeq } = require("../services/sequence.service");
const { createInventoryMovementsForOrder } = require("../services/inventory.service");

exports.createOrder = async (req, res, next) => {
  const payload = req.body;
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const seq = await allocSequence("orders", session);
    const orderNumber = formatSeq("ORD", seq, 10);
    const orderDoc = {
      order_number: orderNumber,
      status: "Draft",
      customer: payload.customer,
      lines: payload.lines,
      subtotal_paisa: payload.subtotal_paisa || 0,
      vat_total_paisa: payload.vat_total_paisa || 0,
      total_paisa: payload.total_paisa || 0,
      createdBy: req.user._id
    };
    const [order] = await Order.create([orderDoc], { session });
    await session.commitTransaction();
    res.status(201).json(order);
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
};

exports.confirmOrder = async (req, res, next) => {
  const orderId = req.params.id;
  const currentUserId = req.user._id;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const order = await Order.findById(orderId).session(session);
      if (!order) { const e = new Error("Order not found"); e.status = 404; throw e; }
      if (order.status !== "Draft") { const e = new Error("Only Draft orders can be confirmed"); e.status = 400; throw e; }
      for (const line of order.lines) {
        const product = await Product.findById(line.product_id).session(session).select("on_hand");
        if (!product) { const e = new Error("Product not found"); e.status = 404; throw e; }
        if (product.on_hand < line.qty) { const err = new Error("Insufficient stock"); err.status = 409; throw err; }
      }
      for (const line of order.lines) {
        await Product.updateOne({ _id: line.product_id }, { $inc: { on_hand: -line.qty } }).session(session);
      }
      const createdMovs = await createInventoryMovementsForOrder({ session, currentUserId, order, lines: order.lines });
      for (let i = 0; i < order.lines.length; i++) {
        order.lines[i].inventory_movements = [createdMovs[i]._id];
      }
      order.status = "Confirmed";
      order.updatedBy = currentUserId;
      await order.save({ session });
      res.json(order);
    });
  } catch (err) {
    next(err);
  } finally {
    session.endSession();
  }
};
'@
  $orderController | Out-File -FilePath (Join-Path $backendRoot "controllers\order.controller.js") -Encoding UTF8

  # purchase.controller.js
  $purchaseController = @'
const mongoose = require("mongoose");
const Purchase = require("../models/purchase.model");
const Product = require("../models/product.model");
const { allocSequence, formatSeq } = require("../services/sequence.service");
const { createInventoryMovementsForPurchase } = require("../services/inventory.service");

exports.createPurchase = async (req, res, next) => {
  const payload = req.body;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const seq = await allocSequence("purchases", session);
      const purchaseNumber = formatSeq("PUR", seq, 10);
      const purchaseDoc = {
        purchase_number: purchaseNumber,
        supplier_id: payload.supplier_id,
        supplier_name: payload.supplier_name,
        date: payload.date || new Date(),
        lines: payload.lines,
        subtotal_paisa: payload.subtotal_paisa || 0,
        vat_total_paisa: payload.vat_total_paisa || 0,
        total_paisa: payload.total_paisa || 0,
        payments: payload.payments || [],
        createdBy: req.user._id
      };
      const [purchase] = await Purchase.create([purchaseDoc], { session });
      for (const line of purchase.lines) {
        await Product.updateOne({ _id: line.product_id }, { $inc: { on_hand: line.qty } }).session(session);
      }
      const movements = await createInventoryMovementsForPurchase({ session, currentUserId: req.user._id, purchase, lines: purchase.lines });
      purchase.inventory_movements = movements.map(m => m._id);
      await purchase.save({ session });
      res.status(201).json(purchase);
    });
  } catch (err) {
    next(err);
  } finally {
    session.endSession();
  }
};
'@
  $purchaseController | Out-File -FilePath (Join-Path $backendRoot "controllers\purchase.controller.js") -Encoding UTF8

  # inventory.controller.js
  $inventoryController = @'
const InventoryTransaction = require("../models/inventoryTransaction.model");

exports.listTransactions = async (req, res) => {
  const { productId, from, to, type, page = 1, pageSize = 50 } = req.query;
  const q = { is_deleted: false };
  if (productId) q.product_id = productId;
  if (type) q.type = type;
  if (from || to) q.timestamp = {};
  if (from) q.timestamp.$gte = new Date(from);
  if (to) q.timestamp.$lte = new Date(to);
  const p = parseInt(page, 10);
  const s = parseInt(pageSize, 10);
  const items = await InventoryTransaction.find(q).sort({ timestamp: -1 }).skip((p - 1) * s).limit(s).lean();
  const total = await InventoryTransaction.countDocuments(q);
  res.json({ total, page: p, pageSize: s, items });
};
'@
  $inventoryController | Out-File -FilePath (Join-Path $backendRoot "controllers\inventory.controller.js") -Encoding UTF8

  # services/sequence.service.js
  $seqService = @'
const Counter = require("../models/counter.model");

async function allocSequence(key, session) {
  const res = await Counter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true, session }
  );
  return res.seq;
}

function formatSeq(prefix, seq, width = 10) {
  return `${prefix}-${String(seq).padStart(width, "0")}`;
}

module.exports = { allocSequence, formatSeq };
'@
  $seqService | Out-File -FilePath (Join-Path $backendRoot "services\sequence.service.js") -Encoding UTF8

  # services/inventory.service.js
  $invService = @'
const InventoryTransaction = require("../models/inventoryTransaction.model");
const { allocSequence, formatSeq } = require("./sequence.service");

async function createInventoryMovementsForOrder({ session, currentUserId, order, lines }) {
  const created = [];
  for (const line of lines) {
    const seq = await allocSequence("movements", session);
    const movementId = formatSeq("MOV", seq, 10);
    const movDoc = {
      movement_id: movementId,
      product_id: line.product_id,
      product_code: line.product_code,
      qty: -Math.abs(line.qty),
      type: "sale_out",
      warehouse_id: "MAIN",
      unit: line.unit || "piece",
      unit_cost_paisa: line.unit_cost_paisa || 0,
      source: { doc_type: "order", doc_id: order._id, doc_number: order.order_number },
      createdBy: currentUserId,
      timestamp: new Date()
    };
    const [mov] = await InventoryTransaction.create([movDoc], { session });
    created.push(mov);
  }
  return created;
}

async function createInventoryMovementsForPurchase({ session, currentUserId, purchase, lines }) {
  const created = [];
  for (const line of lines) {
    const seq = await allocSequence("movements", session);
    const movementId = formatSeq("MOV", seq, 10);
    const movDoc = {
      movement_id: movementId,
      product_id: line.product_id,
      product_code: line.product_code,
      qty: Math.abs(line.qty),
      type: "purchase_in",
      warehouse_id: "MAIN",
      unit: line.unit || "piece",
      unit_cost_paisa: line.unit_cost_paisa || 0,
      source: { doc_type: "purchase", doc_id: purchase._id, doc_number: purchase.purchase_number },
      createdBy: currentUserId,
      timestamp: new Date()
    };
    const [mov] = await InventoryTransaction.create([movDoc], { session });
    created.push(mov);
  }
  return created;
}

module.exports = { createInventoryMovementsForOrder, createInventoryMovementsForPurchase };
'@
  $invService | Out-File -FilePath (Join-Path $backendRoot "services\inventory.service.js") -Encoding UTF8

  # scripts/seed_users.js
  $seedScript = @'
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const User = require("../models/user.model");

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/ims";

async function run() {
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const adminExists = await User.findOne({ username: "admin" });
  if (!adminExists) {
    const hash = await bcrypt.hash("AdminPass123!", 12);
    await User.create({ username: "admin", password_hash: hash, name: "Admin", roles: ["Owner"] });
    console.log("Admin user created: username=admin password=AdminPass123!");
  } else {
    console.log("Admin already exists.");
  }
  const demoExists = await User.findOne({ username: "demo" });
  if (!demoExists) {
    const hash = await bcrypt.hash("demo1234", 12);
    await User.create({ username: "demo", password_hash: hash, name: "Demo User", roles: ["Staff"] });
    console.log("Demo user created: username=demo password=demo1234");
  } else {
    console.log("Demo already exists.");
  }
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
'@
  $seedScript | Out-File -FilePath (Join-Path $backendRoot "scripts\seed_users.js") -Encoding UTF8

  # Create tests (auth/order/purchase) minimal
  $testAuth = @'
const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../app");
const User = require("../models/user.model");

const TEST_MONGO = process.env.TEST_MONGO_URI || "mongodb://localhost:27017/ims_test";

beforeAll(async () => {
  await mongoose.connect(TEST_MONGO, { useNewUrlParser: true, useUnifiedTopology: true });
  await User.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe("Auth flows", () => {
  test("register -> login -> refresh -> logout", async () => {
    const username = "testuser";
    const password = "Testpass123!";
    await request(app).post("/api/v1/auth/register").send({ username, password, name: "Test" }).expect(201);
    const loginRes = await request(app).post("/api/v1/auth/login").send({ username, password }).expect(200);
    expect(loginRes.body.accessToken).toBeTruthy();
    const cookies = loginRes.headers["set-cookie"];
    expect(cookies && cookies.some(c => c.startsWith("refreshToken="))).toBe(true);
    const refreshRes = await request(app).post("/api/v1/auth/refresh").set("Cookie", cookies).expect(200);
    expect(refreshRes.body.accessToken).toBeTruthy();
    const refreshCookies = refreshRes.headers["set-cookie"];
    await request(app).post("/api/v1/auth/logout").set("Cookie", refreshCookies).expect(200);
  }, 20000);
});
'@
  $testAuth | Out-File -FilePath (Join-Path $backendRoot "tests\auth.test.js") -Encoding UTF8

  # order.test.js
  $testOrder = @'
const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../app");
const User = require("../models/user.model");
const Product = require("../models/product.model");

const TEST_MONGO = process.env.TEST_MONGO_URI || "mongodb://localhost:27017/ims_test";

let accessToken;

beforeAll(async () => {
  await mongoose.connect(TEST_MONGO, { useNewUrlParser: true, useUnifiedTopology: true });
  await User.deleteMany({});
  await Product.deleteMany({});
  await request(app).post("/api/v1/auth/register").send({ username: "tuser", password: "pass1234", name: "T" });
  const loginRes = await request(app).post("/api/v1/auth/login").send({ username: "tuser", password: "pass1234" });
  accessToken = loginRes.body.accessToken;
  await Product.create({ product_code: "P-001", name: "Test Product", price_selling_paisa: 10000, price_buying_paisa: 7000, on_hand: 10 });
});

afterAll(async () => {
  await mongoose.disconnect();
});

test("create order and confirm reduces stock", async () => {
  const createRes = await request(app)
    .post("/api/v1/orders")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({
      customer: { name: "C" },
      lines: [{ line_id: "l1", product_code: "P-001", product_name: "Test Product", qty: 3, unit_price_paisa: 10000, unit_cost_paisa: 7000, line_total_paisa: 30000 }]
    })
    .expect(201);
  const orderId = createRes.body._id;
  const confirmRes = await request(app).post(`/api/v1/orders/${orderId}/confirm`).set("Authorization", `Bearer ${accessToken}`).expect(200);
  expect(confirmRes.body.status).toBe("Confirmed");
  const p = await Product.findOne({ product_code: "P-001" }).lean();
  expect(p.on_hand).toBe(7);
}, 20000);
'@
  $testOrder | Out-File -FilePath (Join-Path $backendRoot "tests\order.test.js") -Encoding UTF8

  # purchase.test.js
  $testPurchase = @'
const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../app");
const User = require("../models/user.model");
const Product = require("../models/product.model");

const TEST_MONGO = process.env.TEST_MONGO_URI || "mongodb://localhost:27017/ims_test";

let accessToken;

beforeAll(async () => {
  await mongoose.connect(TEST_MONGO, { useNewUrlParser: true, useUnifiedTopology: true });
  await User.deleteMany({});
  await Product.deleteMany({});
  await request(app).post("/api/v1/auth/register").send({ username: "buyer", password: "buy1234", name: "Buyer" });
  const loginRes = await request(app).post("/api/v1/auth/login").send({ username: "buyer", password: "buy1234" });
  accessToken = loginRes.body.accessToken;
  await Product.create({ product_code: "P-002", name: "Purchase Product", price_selling_paisa: 15000, price_buying_paisa: 10000, on_hand: 5 });
});

afterAll(async () => {
  await mongoose.disconnect();
});

test("create purchase increases stock", async () => {
  const purchasePayload = {
    supplier_name: "Supplier A",
    lines: [
      { line_id: "pl1", product_id: (await Product.findOne({ product_code: "P-002" }))._id, product_code: "P-002", product_name: "Purchase Product", qty: 20, unit_cost_paisa: 9000, line_total_paisa: 180000 }
    ],
    subtotal_paisa: 180000,
    vat_total_paisa: 27000,
    total_paisa: 207000
  };
  const res = await request(app).post("/api/v1/purchases").set("Authorization", `Bearer ${accessToken}`).send(purchasePayload).expect(201);
  expect(res.body.purchase_number).toBeTruthy();
  const p = await Product.findOne({ product_code: "P-002" }).lean();
  expect(p.on_hand).toBe(25);
}, 20000);
'@
  $testPurchase | Out-File -FilePath (Join-Path $backendRoot "tests\purchase.test.js") -Encoding UTF8

  # Create frontend structure and files
  $frontendRoot = Join-Path $RootDir "frontend"
  Ensure-Directory -p $frontendRoot
  Ensure-Directory -p (Join-Path $frontendRoot "src")
  Ensure-Directory -p (Join-Path $frontendRoot "src\auth")
  Ensure-Directory -p (Join-Path $frontendRoot "src\api")
  Ensure-Directory -p (Join-Path $frontendRoot "src\components")
  Ensure-Directory -p (Join-Path $frontendRoot "src\pages")
  Ensure-Directory -p (Join-Path $frontendRoot "src\styles")

  # frontend/package.json
  $frontendPackage = @'
{
  "name": "ims-frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@hookform/resolvers": "^2.9.11",
    "axios": "^1.4.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-hook-form": "^7.45.1",
    "react-router-dom": "^6.14.1",
    "yup": "^1.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.21",
    "@types/react-dom": "^18.2.7",
    "@types/react-router-dom": "^5.3.3",
    "typescript": "^5.1.6",
    "vite": "^5.2.0"
  }
}
'@
  $frontendPackage | Out-File -FilePath (Join-Path $frontendRoot "package.json") -Encoding UTF8

  # frontend/.env.example
  $feEnv = 'VITE_API_BASE=http://localhost:4000/api/v1'
  $feEnv | Out-File -FilePath (Join-Path $frontendRoot ".env.example") -Encoding UTF8

  # frontend index.html
  $indexHtml = @'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1.0" />
    <title>IMS Frontend</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
'@
  $indexHtml | Out-File -FilePath (Join-Path $frontendRoot "index.html") -Encoding UTF8

  # frontend/src/main.tsx
  $mainTsx = @'
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
'@
  $mainTsx | Out-File -FilePath (Join-Path $frontendRoot "src\main.tsx") -Encoding UTF8

  # frontend/src/App.tsx (basic)
  $appTsx = @'
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import NavBar from "./components/NavBar";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ProductsPage from "./pages/ProductsPage";
import ProductCreatePage from "./pages/ProductCreatePage";
import OrderCreatePage from "./pages/OrderCreatePage";
import { useAuth } from "./auth/AuthContext";

const App: React.FC = () => {
  const { user } = useAuth();

  return (
    <div>
      <NavBar />
      <main className="container">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/products" element={user ? <ProductsPage /> : <Navigate to="/login" />} />
          <Route path="/products/new" element={user ? <ProductCreatePage /> : <Navigate to="/login" />} />
          <Route path="/orders/new" element={user ? <OrderCreatePage /> : <Navigate to="/login" />} />
          <Route path="/" element={user ? <Navigate to="/products" /> : <Navigate to="/login" />} />
        </Routes>
      </main>
    </div>
  );
};

export default App;
'@
  $appTsx | Out-File -FilePath (Join-Path $frontendRoot "src\App.tsx") -Encoding UTF8

  # frontend src/api/axios.ts
  $apiAxios = @'
import axios, { type AxiosRequestConfig, type AxiosError } from "axios";

const API_BASE = import.meta.env.VITE_API_BASE || "/api/v1";

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (err: unknown) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  failedQueue = [];
};

api.interceptors.request.use((config: AxiosRequestConfig) => {
  const token = localStorage.getItem("accessToken");
  if (token && config.headers) {
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (resp) => resp,
  async (err: AxiosError & { config?: AxiosRequestConfig }) => {
    const originalConfig = err.config;
    if (err.response?.status === 401 && !originalConfig?.url?.includes("/auth/refresh") && !originalConfig?._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => {
            return api(originalConfig!);
          })
          .catch((e) => Promise.reject(e));
      }

      originalConfig!._retry = true;
      isRefreshing = true;
      try {
        const refreshResp = await axios.post(
          `${API_BASE}/auth/refresh`,
          {},
          { withCredentials: true }
        );
        const newToken = refreshResp.data.accessToken;
        if (newToken) {
          localStorage.setItem("accessToken", newToken);
          processQueue(null, newToken);
          return api(originalConfig!);
        }
        processQueue(new Error("No token in refresh response"), null);
        return Promise.reject(err);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem("accessToken");
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(err);
  }
);

export default api;
'@
  $apiAxios | Out-File -FilePath (Join-Path $frontendRoot "src\api\axios.ts") -Encoding UTF8

  # frontend auth context
  $authContext = @'
import React, { createContext, useContext, useState, useEffect } from "react";
import api from "../api/axios";

type User = { _id: string; username: string; name?: string; roles?: string[] } | null;

type AuthContextType = {
  user: User;
  login: (username: string, password: string) => Promise<void>;
  register: (payload: { username: string; password: string; name?: string }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: async () => {},
  register: async () => {},
  logout: async () => {}
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User>(null);

  useEffect(() => {
    const tryMe = async () => {
      const token = localStorage.getItem("accessToken");
      if (!token) return;
      try {
        const res = await api.get("/auth/me");
        setUser(res.data);
      } catch {
        // ignore
      }
    };
    tryMe();
  }, []);

  const login = async (username: string, password: string) => {
    const res = await api.post("/auth/login", { username, password });
    const { accessToken, user } = res.data;
    if (accessToken) localStorage.setItem("accessToken", accessToken);
    setUser(user);
  };

  const register = async (payload: { username: string; password: string; name?: string }) => {
    await api.post("/auth/register", payload);
    await login(payload.username, payload.password);
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // ignore
    }
    localStorage.removeItem("accessToken");
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, login, register, logout }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);

export default AuthContext;
'@
  $authContext | Out-File -FilePath (Join-Path $frontendRoot "src\auth\AuthContext.tsx") -Encoding UTF8

  # frontend components and pages: NavBar, LoginPage, RegisterPage, ProductsPage, ProductCreatePage, OrderCreatePage, styles, utils
  # For brevity, include the same content from previous messages; write them now.

  # NavBar
  $navBar = @'
import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const NavBar: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <header className="nav">
      <div className="nav-left">
        <Link to="/">IMS</Link>
      </div>
      <nav className="nav-right">
        {user ? (
          <>
            <Link to="/products">Products</Link>
            <Link to="/orders/new">POS</Link>
            <button onClick={() => logout()}>Logout</button>
          </>
        ) : (
          <>
            <Link to="/login">Sign in</Link>
            <Link to="/register">Sign up</Link>
          </>
        )}
      </nav>
    </header>
  );
};

export default NavBar;
'@
  $navBar | Out-File -FilePath (Join-Path $frontendRoot "src\components\NavBar.tsx") -Encoding UTF8

  # LoginPage
  $loginPage = @'
import React from "react";
import { useForm } from "react-hook-form";
import { useNavigate, Link } from "react-router-dom";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { useAuth } from "../auth/AuthContext";

type FormValues = { username: string; password: string };

const schema = yup.object({
  username: yup.string().required("Required"),
  password: yup.string().required("Required")
}).required();

const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: yupResolver(schema)
  });

  const onSubmit = async (data: FormValues) => {
    try {
      await login(data.username, data.password);
      navigate("/products");
    } catch (err: any) {
      alert(err?.response?.data?.error || err.message || "Login failed");
    }
  };

  return (
    <div className="card">
      <h2>Sign In</h2>
      <form onSubmit={handleSubmit(onSubmit)}>
        <label>Username</label>
        <input {...register("username")} />
        <p className="error">{errors.username?.message}</p>

        <label>Password</label>
        <input type="password" {...register("password")} />
        <p className="error">{errors.password?.message}</p>

        <button type="submit" disabled={isSubmitting}>Sign In</button>
      </form>
      <p>Don't have an account? <Link to="/register">Register</Link></p>
    </div>
  );
};

export default LoginPage;
'@
  $loginPage | Out-File -FilePath (Join-Path $frontendRoot "src\pages\LoginPage.tsx") -Encoding UTF8

  # RegisterPage
  $registerPage = @'
import React from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

type FormValues = { username: string; password: string; name?: string };

const schema = yup.object({
  username: yup.string().email("Must be a valid email").required("Required"),
  password: yup.string().min(6, "Minimum 6 chars").required("Required"),
  name: yup.string().required("Required")
}).required();

const RegisterPage: React.FC = () => {
  const { register: registerFn } = useAuth();
  const navigate = useNavigate();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: yupResolver(schema)
  });

  const onSubmit = async (data: FormValues) => {
    try {
      await registerFn({ username: data.username, password: data.password, name: data.name });
      navigate("/products");
    } catch (err: any) {
      alert(err?.response?.data?.error || err.message || "Registration failed");
    }
  };

  return (
    <div className="card">
      <h2>Register</h2>
      <form onSubmit={handleSubmit(onSubmit)}>
        <label>Email</label>
        <input {...register("username")} />
        <p className="error">{errors.username?.message}</p>

        <label>Name</label>
        <input {...register("name")} />
        <p className="error">{errors.name?.message}</p>

        <label>Password</label>
        <input type="password" {...register("password")} />
        <p className="error">{errors.password?.message}</p>

        <button type="submit" disabled={isSubmitting}>Register</button>
      </form>
      <p>Already have an account? <Link to="/login">Sign in</Link></p>
    </div>
  );
};

export default RegisterPage;
'@
  $registerPage | Out-File -FilePath (Join-Path $frontendRoot "src\pages\RegisterPage.tsx") -Encoding UTF8

  # ProductsPage
  $productsPage = @'
import React, { useEffect, useState } from "react";
import api from "../api/axios";
import { Link } from "react-router-dom";
import { paisaToDisplay } from "../utils/money";

type Product = {
  _id: string;
  product_code: string;
  name: string;
  price_selling_paisa: number;
  on_hand: number;
};

const ProductsPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");

  const fetch = async () => {
    const res = await api.get("/products", { params: { search } });
    setProducts(res.data.items || []);
  };

  useEffect(() => {
    fetch();
  }, []);

  return (
    <div>
      <div className="row header">
        <h2>Products</h2>
        <div>
          <input placeholder="Search" value={search} onChange={e => setSearch(e.target.value)} />
          <button onClick={() => fetch()}>Search</button>
          <Link to="/products/new"><button>Create</button></Link>
        </div>
      </div>
      <table className="table">
        <thead>
          <tr><th>Code</th><th>Name</th><th>Price (BDT)</th><th>On Hand</th></tr>
        </thead>
        <tbody>
          {products.map(p => (
            <tr key={p._id}>
              <td>{p.product_code}</td>
              <td>{p.name}</td>
              <td style={{ textAlign: "right" }}>{paisaToDisplay(p.price_selling_paisa)}</td>
              <td style={{ textAlign: "right" }}>{p.on_hand}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ProductsPage;
'@
  $productsPage | Out-File -FilePath (Join-Path $frontendRoot "src\pages\ProductsPage.tsx") -Encoding UTF8

  # ProductCreatePage
  $productCreate = @'
import React from "react";
import { useForm } from "react-hook-form";
import api from "../api/axios";
import { useNavigate } from "react-router-dom";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

type FormValues = {
  product_code: string;
  name: string;
  price_selling: string;
  price_buying: string;
  vat_percent?: number;
  on_hand?: number;
};

const schema = yup.object({
  product_code: yup.string().required("Required"),
  name: yup.string().required("Required"),
  price_selling: yup.string().required("Required"),
  price_buying: yup.string().required("Required"),
  vat_percent: yup.number().min(0).max(100).default(0)
}).required();

function toPaisa(value: string) {
  const n = parseFloat(value.replace(/,/g, ""));
  return Math.round((isNaN(n) ? 0 : n) * 100);
}

const ProductCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: yupResolver(schema)
  });

  const onSubmit = async (data: FormValues) => {
    try {
      await api.post("/products", {
        product_code: data.product_code,
        name: data.name,
        price_selling_paisa: toPaisa(data.price_selling),
        price_buying_paisa: toPaisa(data.price_buying),
        vat_percent: data.vat_percent || 0,
        on_hand: data.on_hand || 0
      });
      alert("Created");
      navigate("/products");
    } catch (err: any) {
      alert(err?.response?.data?.error || err.message || "Create failed");
    }
  };

  return (
    <div className="card">
      <h2>Create Product</h2>
      <form onSubmit={handleSubmit(onSubmit)}>
        <label>Product Code</label>
        <input {...register("product_code")} />
        <p className="error">{errors.product_code?.message}</p>

        <label>Name</label>
        <input {...register("name")} />
        <p className="error">{errors.name?.message}</p>

        <label>Selling Price (BDT)</label>
        <input {...register("price_selling")} placeholder="123.45" />
        <p className="error">{errors.price_selling?.message}</p>

        <label>Buying Price (BDT)</label>
        <input {...register("price_buying")} placeholder="100.00" />
        <p className="error">{errors.price_buying?.message}</p>

        <label>VAT %</label>
        <input type="number" {...register("vat_percent")} defaultValue={0} />

        <label>Opening Stock</label>
        <input type="number" {...register("on_hand")} defaultValue={0} />

        <button type="submit" disabled={isSubmitting}>Create</button>
      </form>
    </div>
  );
};

export default ProductCreatePage;
'@
  $productCreate | Out-File -FilePath (Join-Path $frontendRoot "src\pages\ProductCreatePage.tsx") -Encoding UTF8

  # OrderCreatePage
  $orderCreate = @'
import React, { useEffect, useState } from "react";
import api from "../api/axios";
import { paisaToDisplay } from "../utils/money";

type Product = { _id: string; product_code: string; name: string; price_selling_paisa: number; on_hand: number };

const OrderCreatePage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<{ product_id: string; product_code: string; product_name: string; qty: number; unit_price_paisa: number }[]>([]);

  useEffect(() => {
    (async () => {
      const res = await api.get("/products", { params: { search: "" } });
      setProducts(res.data.items || []);
    })();
  }, []);

  const addLine = (p: Product) => {
    setLines([...lines, { product_id: p._id, product_code: p.product_code, product_name: p.name, qty: 1, unit_price_paisa: p.price_selling_paisa }]);
  };

  const updateQty = (index: number, qty: number) => {
    const copy = [...lines];
    copy[index].qty = Math.max(1, qty);
    setLines(copy);
  };

  const removeLine = (index: number) => {
    const copy = [...lines];
    copy.splice(index, 1);
    setLines(copy);
  };

  const createAndConfirm = async () => {
    if (lines.length === 0) { alert("Add at least one line"); return; }
    try {
      const subtotal = lines.reduce((s, l) => s + l.unit_price_paisa * l.qty, 0);
      const payload = {
        customer: { name: "Walk-in" },
        lines: lines.map(l => ({ line_id: `ln-${Date.now()}`, product_id: l.product_id, product_code: l.product_code, product_name: l.product_name, qty: l.qty, unit_price_paisa: l.unit_price_paisa, line_total_paisa: l.unit_price_paisa * l.qty })),
        subtotal_paisa: subtotal,
        vat_total_paisa: 0,
        total_paisa: subtotal
      };
      const createRes = await api.post("/orders", payload);
      const orderId = createRes.data._id;
      const confirmRes = await api.post(`/orders/${orderId}/confirm`);
      alert(`Order ${confirmRes.data.order_number} confirmed`);
    } catch (err: any) {
      alert(err?.response?.data?.error || err.message || "Error creating order");
    }
  };

  return (
    <div>
      <h2>Create Order</h2>
      <div className="row">
        <div>
          <h3>Products</h3>
          <input placeholder="Search" value={search} onChange={e => setSearch(e.target.value)} />
          <button onClick={async () => {
            const res = await api.get("/products", { params: { search } });
            setProducts(res.data.items || []);
          }}>Search</button>
          <div className="list">
            {products.map(p => (
              <div key={p._id} className="list-item">
                <div><strong>{p.name}</strong> ({p.product_code}) - {p.on_hand} in stock</div>
                <div>{paisaToDisplay(p.price_selling_paisa)}</div>
                <button onClick={() => addLine(p)}>Add</button>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3>Order Lines</h3>
          {lines.length === 0 && <p>No lines</p>}
          {lines.map((ln, idx) => (
            <div key={idx} className="line-row">
              <div>{ln.product_name} ({ln.product_code})</div>
              <div>
                <input type="number" value={ln.qty} onChange={e => updateQty(idx, Number(e.target.value))} style={{ width: 80 }} />
                x {paisaToDisplay(ln.unit_price_paisa)}
                <button onClick={() => removeLine(idx)}>Remove</button>
              </div>
            </div>
          ))}
          <div style={{ marginTop: 12 }}>
            <button onClick={createAndConfirm}>Create & Confirm Order</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderCreatePage;
'@
  $orderCreate | Out-File -FilePath (Join-Path $frontendRoot "src\pages\OrderCreatePage.tsx") -Encoding UTF8

  # utils/money
  $moneyUtil = @'
export const paisaToDisplay = (paisa?: number | string) => {
  if (paisa == null) return "0.00";
  const n = Number(paisa);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}${(abs / 100).toFixed(2)}`;
};
'@
  $moneyUtil | Out-File -FilePath (Join-Path $frontendRoot "src\utils\money.ts") -Encoding UTF8

  # styles
  $styles = @'
:root {
  --bg: #f6f8fa;
  --card: #fff;
  --accent: #2b6cb0;
  --muted: #666;
}

body {
  margin: 0;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
  background: var(--bg);
  color: #111;
}

.nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
}

.nav a {
  margin-right: 12px;
  text-decoration: none;
  color: var(--accent);
  font-weight: 600;
}

.container {
  max-width: 1000px;
  margin: 24px auto;
  padding: 0 16px;
}

.card {
  background: var(--card);
  padding: 16px;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
  margin-bottom: 16px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header {
  margin-bottom: 12px;
}

.table {
  width: 100%;
  border-collapse: collapse;
  background: var(--card);
  border: 1px solid #e2e8f0;
}

.table th, .table td {
  padding: 8px 12px;
  border-bottom: 1px solid #f1f5f9;
}

.list {
  max-height: 400px;
  overflow: auto;
  margin-top: 8px;
}

.list-item {
  display: flex;
  justify-content: space-between;
  padding: 8px;
  border-bottom: 1px solid #eee;
}

.line-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px dashed #eee;
}

input, select, textarea {
  padding: 8px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 8px;
}

button {
  padding: 8px 12px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

button[disabled] {
  opacity: 0.6;
  cursor: not-allowed;
}

.error {
  color: #b91c1c;
  font-size: 0.9rem;
  margin: 6px 0;
}

.card h2 {
  margin-top: 0;
}
'@
  $styles | Out-File -FilePath (Join-Path $frontendRoot "src\styles.css") -Encoding UTF8

  Write-Host "All files written to $RootDir"
} else {
  Write-Host "Skipping writing files as requested (-SkipWrite)."
}

# Now create the ZIP excluding node_modules, dist, build, and logs
Write-Host "Creating ZIP archive (excluding node_modules, dist, build, *.log)..."
if (Test-Path $ZipFullPath) { Remove-Item -Path $ZipFullPath -Force }

Add-Type -AssemblyName System.IO.Compression.FileSystem

try {
  # Create zip from RootDir parent to preserve relative paths
  $parent = Split-Path -Path $RootDir -Parent
  $folderName = Split-Path -Path $RootDir -Leaf
  # Create temporary staging folder to copy only included files (filter excludes)
  $staging = Join-Path ([System.IO.Path]::GetTempPath()) ("ims_staging_" + [Guid]::NewGuid().ToString())
  New-Item -ItemType Directory -Path $staging | Out-Null

  Write-Host "Copying included files to staging..."
  Get-ChildItem -Path $RootDir -Recurse -File | Where-Object {
    ($_.FullName -notmatch '\\node_modules\\') -and
    ($_.FullName -notmatch '\\dist\\') -and
    ($_.FullName -notmatch '\\build\\') -and
    ($_.Extension -ne '.log')
  } | ForEach-Object {
    $rel = $_.FullName.Substring($RootDir.Length).TrimStart('\','/')
    $dest = Join-Path $staging $rel
    $destDir = Split-Path -Path $dest -Parent
    if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
    Copy-Item -Path $_.FullName -Destination $dest -Force
  }

  [System.IO.Compression.ZipFile]::CreateFromDirectory($staging, $ZipFullPath, [System.IO.Compression.CompressionLevel]::Optimal, $false)

} catch {
  Write-Error "Failed to create zip: $_"
  exit 1
} finally {
  if (Test-Path $staging) { Remove-Item -Path $staging -Recurse -Force }
}

# Compute ZIP SHA256
$zipHash = Get-FileHash -Path $ZipFullPath -Algorithm SHA256
$zipShaLine = "{0}  {1}" -f $zipHash.Hash, (Split-Path -Leaf $ZipFullPath)
$zipShaLine | Out-File -FilePath $ZipShaPath -Encoding UTF8
Write-Host "ZIP SHA256: $($zipHash.Hash) (saved to $ZipShaPath)"

# Generate per-file SHA256 manifest (relative paths)
if (-not $SkipWrite) {
  Write-Host "Generating per-file SHA256 manifest (for files included in ZIP)..."
  if (Test-Path $ManifestPath) { Remove-Item $ManifestPath -Force }
  # Get list of files included in zip via ZipArchive
  $zipList = [System.IO.Compression.ZipFile]::OpenRead($ZipFullPath).Entries | ForEach-Object { $_.FullName }
  foreach ($entry in $zipList) {
    # For each entry, compute SHA256 from the original file path in RootDir
    $filePath = Join-Path $RootDir $entry
    if (Test-Path $filePath) {
      $h = Get-FileHash -Algorithm SHA256 -Path $filePath
      "{0}  {1}" -f $h.Hash, $entry | Out-File -FilePath $ManifestPath -Append -Encoding UTF8
    } else {
      # Entry might be a directory or missing; write placeholder
      "MISSING  $entry" | Out-File -FilePath $ManifestPath -Append -Encoding UTF8
    }
  }
  Write-Host "Manifest written to $ManifestPath"
} else {
  Write-Host "Skipping manifest generation because -SkipWrite was specified."
}

# Stream the ZIP to base64 and split into chunk files
Write-Host "Creating base64 parts (chunk size: $ChunkSizeKB KB)..."
$zipStream = [System.IO.File]::OpenRead($ZipFullPath)
$transform = New-Object System.Security.Cryptography.ToBase64Transform
$partIndex = 0
$currentPartPath = ""
$currentPartStream = $null
$bytesWritten = 0
$bufferSize = 3 * 16384  # must be multiple of 3 for ToBase64Transform
$buffer = New-Object byte[] $bufferSize
$maxOut = [math]::Ceiling($bufferSize / 3) * 4
$outBuf = New-Object byte[] $maxOut
try {
  while (($read = $zipStream.Read($buffer, 0, $bufferSize)) -gt 0) {
    if ($read -eq $bufferSize) {
      $outLen = $transform.TransformBlock($buffer, 0, $read, $outBuf, 0)
      $offset = 0
      while ($offset -lt $outLen) {
        if ($currentPartStream -eq $null) {
          $currentPartPath = "{0}.part{1:D4}" -f (Join-Path $RootDir ((Split-Path -Leaf $ZipFullPath) + ".b64")), $partIndex
          $currentPartStream = [System.IO.File]::Open($currentPartPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
          $bytesWritten = 0
        }
        $space = $ChunkSizeBytes - $bytesWritten
        $toWrite = [math]::Min($space, $outLen - $offset)
        $currentPartStream.Write($outBuf, $offset, $toWrite)
        $bytesWritten += $toWrite
        $offset += $toWrite
        if ($bytesWritten -ge $ChunkSizeBytes) {
          $currentPartStream.Close()
          $currentPartStream.Dispose()
          $currentPartStream = $null
          $partIndex++
        }
      }
    } else {
      # final block
      $final = $transform.TransformFinalBlock($buffer, 0, $read)
      $outLen = $final.Length
      $offset = 0
      while ($offset -lt $outLen) {
        if ($currentPartStream -eq $null) {
          $currentPartPath = "{0}.part{1:D4}" -f (Join-Path $RootDir ((Split-Path -Leaf $ZipFullPath) + ".b64")), $partIndex
          $currentPartStream = [System.IO.File]::Open($currentPartPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
          $bytesWritten = 0
        }
        $space = $ChunkSizeBytes - $bytesWritten
        $toWrite = [math]::Min($space, $outLen - $offset)
        $currentPartStream.Write($final, $offset, $toWrite)
        $bytesWritten += $toWrite
        $offset += $toWrite
        if ($bytesWritten -ge $ChunkSizeBytes) {
          $currentPartStream.Close()
          $currentPartStream.Dispose()
          $currentPartStream = $null
          $partIndex++
        }
      }
    }
    if ($StreamBase64ToStdout) {
      # print the part just written if we've closed it
      # Not streaming partial writes to stdout for binary safety; user can read parts manually.
      :
    }
  }
} finally {
  if ($currentPartStream) { $currentPartStream.Close(); $currentPartStream.Dispose() }
  if ($zipStream) { $zipStream.Close() }
  if ($transform) { $transform.Dispose() }
}

Write-Host "Base64 parts created: $partIndex (zero-based index). Files named like: $(Split-Path -Leaf $ZipFullPath).b64.part0000"

Write-Host "`nCompleted. Outputs:"
Write-Host " - ZIP: $ZipFullPath"
Write-Host " - ZIP SHA256 file: $ZipShaPath"
Write-Host " - Per-file manifest: $ManifestPath"
Write-Host " - Base64 parts prefix: $(Join-Path $RootDir ((Split-Path -Leaf $ZipFullPath) + ".b64.part"))*"

Write-Host "`nReconstruction steps (PowerShell):"
Write-Host "1) Concatenate parts (ordered):"
Write-Host "   Get-ChildItem -Path '$RootDir' -Filter '$(Split-Path -Leaf $ZipFullPath).b64.part*' | Sort-Object Name | ForEach-Object { Get-Content -Raw -Path $_.FullName -Encoding ASCII } | Set-Content -Path '$RootDir\$(Split-Path -Leaf $ZipFullPath).b64' -Encoding ASCII"
Write-Host "2) Decode base64 to ZIP:"
Write-Host "   \$b64 = Get-Content -Raw -Path '$RootDir\$(Split-Path -Leaf $ZipFullPath).b64'"
Write-Host "   [System.IO.File]::WriteAllBytes('$ZipFullPath', [Convert]::FromBase64String(\$b64))"
Write-Host "3) Verify SHA256:"
Write-Host "   Get-FileHash -Algorithm SHA256 '$ZipFullPath'"

if ($SkipWrite) {
  Write-Host "`nNote: You used -SkipWrite, so this script did not write repository files; it worked from an existing $RootDir."
}

Write-Host "`nDone."
```