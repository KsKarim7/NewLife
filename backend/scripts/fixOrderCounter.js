require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const Order = require('../models/Order');
const Counter = require('../models/Counter');

async function fixOrderCounter() {
    try {
        await connectDB();
        console.log('Connected to database...');

        // Query all non-deleted orders
        const orders = await Order.find({ is_deleted: false }).select('order_number');
        console.log(`Found ${orders.length} orders`);

        if (orders.length === 0) {
            console.log('No orders found. Setting counter seq to 0.');
            await Counter.findOneAndUpdate(
                { key: 'orders' },
                { $set: { seq: 0 } },
                { upsert: true }
            );
            console.log('Counter updated: seq = 0');
        } else {
            // Extract numeric sequences from order_number (e.g., "ORD-0005" -> 5)
            const sequences = orders
                .map((order) => {
                    const match = order.order_number.match(/ORD-(\d+)/);
                    return match ? parseInt(match[1], 10) : 0;
                })
                .filter((seq) => seq > 0);

            const maxSeq = Math.max(...sequences);
            console.log(`Highest order sequence found: ${maxSeq} (ORD-${String(maxSeq).padStart(4, '0')})`);

            // Update the counter
            await Counter.findOneAndUpdate(
                { key: 'orders' },
                { $set: { seq: maxSeq } },
                { upsert: true }
            );

            console.log(`Counter updated: seq = ${maxSeq}`);
        }

        // Verify the fix
        const updatedCounter = await Counter.findOne({ key: 'orders' });
        console.log(`Verification - Current counter state:`, updatedCounter);

        console.log('\n✅ Counter fix completed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error fixing counter:', err.message);
        process.exit(1);
    }
}

fixOrderCounter();
