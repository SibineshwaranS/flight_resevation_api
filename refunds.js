// routes/refunds.js
const express = require("express");
const router = express.Router();
const pool = require("./db");

// CREATE refund
router.post("/", async (req, res) => {
  try {
    const { payment_id, amount, reason, status } = req.body;
    const result = await pool.query(
      `INSERT INTO refunds (payment_id, amount, reason, status)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [payment_id, amount, reason, status || "processed"]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to create refund" });
  }
});

// READ all refunds
router.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM refunds ORDER BY refund_id ASC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch refunds" });
  }
});

// UPDATE refund status
router.put("/:id", async (req, res) => {
  try {
    const { status } = req.body;
    const result = await pool.query(
      `UPDATE refunds SET status = $1 WHERE refund_id = $2 RETURNING *`,
      [status, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to update refund" });
  }
});

// DELETE refund
router.delete("/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM refunds WHERE refund_id = $1", [req.params.id]);
    res.json({ message: "Refund deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete refund" });
  }
});

module.exports = router;

