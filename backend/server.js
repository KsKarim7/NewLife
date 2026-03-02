require('express-async-errors');

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const { connectDB } = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const authRoutes = require('./routes/authRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const productRoutes = require('./routes/productRoutes');
const customerRoutes = require('./routes/customerRoutes');
const orderRoutes = require('./routes/orderRoutes');
const salesReturnRoutes = require('./routes/salesReturnRoutes');
const purchaseRoutes = require('./routes/purchaseRoutes');
const purchaseReturnRoutes = require('./routes/purchaseReturnRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const reportRoutes = require('./routes/reportRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const protect = require('./middleware/protect');

dotenv.config();
connectDB();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(cookieParser());
app.use(express.json());

app.get('/api/v1/health', (req, res) => {
  res.json({ success: true, data: { status: 'ok' } });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/customers', customerRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/sales-returns', salesReturnRoutes);
app.use('/api/v1/purchases', purchaseRoutes);
app.use('/api/v1/purchase-returns', purchaseReturnRoutes);
app.use('/api/v1/expenses', expenseRoutes);
app.use('/api/v1/inventory', inventoryRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/reports', protect, reportRoutes);
app.use('/api/v1/settings', protect, settingsRoutes);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
