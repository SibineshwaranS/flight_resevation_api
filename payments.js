// routes/payments.js
const express = require("express");
const router = express.Router();
const pool = require("./db");

// CREATE payment
router.post("/", async (req, res) => {
  try {
    const { booking_id, amount, currency, payment_method, transaction_id, status } = req.body;
    const result = await pool.query(
      `INSERT INTO payments (booking_id, amount, currency, payment_method, transaction_id, status)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [booking_id, amount, currency || "INR", payment_method, transaction_id, status || "success"]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to create payment" });
  }
});
// Add this new route to routes/payments.js (or create the file if it doesn't exist)

// NEW: GET all payments (for admin dashboard)
router.get("/read", async (req, res) => {
    try {
        // CORRECTED: The "ORDER BY payment_date DESC" has been removed to prevent the error.
        const result = await pool.query("SELECT * FROM payments");
        
        res.json(result.rows);
    } catch (err) {
        console.error("❌ Error fetching all payments:", err.message);
        if (err.code === '42P01') { 
            return res.status(500).json({ error: "Server error: The 'payments' table does not exist." });
        }
        res.status(500).json({ error: "Server error while fetching payments." });
    }
});

// READ all payments
router.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM payments ORDER BY payment_id ASC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch payments" });
  }
});

// UPDATE payment status
router.put("/:id", async (req, res) => {
  try {
    const { status } = req.body;
    const result = await pool.query(
      `UPDATE payments SET status = $1 WHERE payment_id = $2 RETURNING *`,
      [status, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to update payment" });
  }
});

// DELETE payment
router.delete("/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM payments WHERE payment_id = $1", [req.params.id]);
    res.json({ message: "Payment deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete payment" });
  }
});

module.exports = router;

