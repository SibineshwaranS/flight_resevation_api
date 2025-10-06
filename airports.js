const express = require("express");
const router = express.Router();
const pool = require("../db"); // PostgreSQL connection

// CREATE Airport
router.post("/create", async (req, res) => {
  try {
    const { iata, icao, name, city, country, tz } = req.body;

    const result = await pool.query(
      `INSERT INTO airports (iata, icao, name, city, country, tz)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [iata, icao, name, city, country, tz]
    );

    res.json({ message: "✅ Airport created", airport: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// READ All Airports
router.get("/read", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM airports ORDER BY id ASC");
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// READ One Airport
router.get("/read/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("SELECT * FROM airports WHERE id = $1", [id]);

    if (result.rows.length === 0)
      return res.status(404).json({ message: "Airport not found" });

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// UPDATE Airport
router.put("/update/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { iata, icao, name, city, country, tz } = req.body;

    // This query has been corrected to REMOVE 'updated_at'
    const result = await pool.query(
      `UPDATE airports 
       SET iata=$1, icao=$2, name=$3, city=$4, country=$5, tz=$6
       WHERE id=$7 RETURNING *`,
      [iata, icao, name, city, country, tz, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Airport not found" });
    }
    res.json(result.rows[0]);

  } catch (err) {
    console.error("Update Airport Error:", err); 

    // This part is still useful for catching duplicate IATA/ICAO codes
    if (err.code === '23505') { 
      return res.status(409).json({ error: `Update failed: An airport with that IATA or ICAO code already exists.` });
    }

    res.status(500).json({ error: "Server error during airport update." });
  }
});

// DELETE Airport
router.delete("/delete/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("DELETE FROM airports WHERE id = $1 RETURNING *", [id]);

    if (result.rows.length === 0)
      return res.status(404).json({ message: "Airport not found" });

    res.json({ message: "🗑️ Airport deleted" });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
