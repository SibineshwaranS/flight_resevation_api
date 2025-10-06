const express = require("express");
const router = express.Router();
const pool = require("../db"); // PostgreSQL connection

// ✅ CREATE route
router.post("/create", async (req, res) => {
  try {
    const { source_airport_id, dest_airport_id, distance_nm, typical_duration_min } = req.body;

    // Prevent same source and destination
    if (source_airport_id === dest_airport_id) {
      return res.status(400).json({ error: "Source and destination airports cannot be the same." });
    }

    const result = await pool.query(
      `INSERT INTO routes (source_airport_id, dest_airport_id, distance_nm, typical_duration_min)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [source_airport_id, dest_airport_id, distance_nm, typical_duration_min]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error creating route." });
  }
});

// ✅ READ all routes
router.get("/read", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.id, 
              a1.name AS source_airport, 
              a2.name AS destination_airport, 
              r.distance_nm, 
              r.typical_duration_min
       FROM routes r
       JOIN airports a1 ON r.source_airport_id = a1.id
       JOIN airports a2 ON r.dest_airport_id = a2.id`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error fetching routes." });
  }
});

// ✅ READ single route
// NEW: READ one route by ID (for the update modal)
router.get("/read/:id", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM routes WHERE id = $1", [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Route not found" });
        }
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: "Error fetching route." });
    }
});

// NEW: UPDATE a route
router.put("/update/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { distance_nm, typical_duration_min } = req.body;

        // FIX: Removed ", updated_at = NOW()" from the SQL query
        const result = await pool.query(
            "UPDATE routes SET distance_nm = $1, typical_duration_min = $2 WHERE id = $3 RETURNING *",
            [distance_nm, typical_duration_min, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Route not found" });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(`Error in PUT /routes/update/${req.params.id}:`, err);
        res.status(500).json({ error: "Error updating route." });
    }
});

// NEW: DELETE a route
router.delete("/delete/:id", async (req, res) => {
    try {
        const result = await pool.query("DELETE FROM routes WHERE id = $1 RETURNING *", [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Route not found" });
        }
        res.json({ message: "Route deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: "Error deleting route." });
    }
});


module.exports = router;