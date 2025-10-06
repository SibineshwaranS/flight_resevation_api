const express = require("express");
const router = express.Router();
const pool = require("./db"); // pg pool

// CREATE flight
router.post("/create", async (req, res) => {
  try {
    const { flight_number, route_id, aircraft_id, departure_time, arrival_time, frequency, status } = req.body;
    const result = await pool.query(
      `INSERT INTO flights (flight_number, route_id, aircraft_id, departure_time, arrival_time, frequency, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [flight_number, route_id, aircraft_id, departure_time, arrival_time, frequency, status]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// READ all flights
router.get("/read", async (req, res) => {
  try {
    // This query includes all data needed by your new dashboard, admincreate.html, and userflights.html
    const result = await pool.query(
      `SELECT 
         f.id, f.flight_number, f.departure_time, f.arrival_time, f.route_id, f.aircraft_id, f.frequency, f.status,
         a.registration_no AS aircraft_reg,
         src.iata AS source_airport_iata,
         dest.iata AS dest_airport_iata,
         src.name AS source_airport,
         dest.name AS destination_airport
       FROM flights f
       JOIN aircraft a ON f.aircraft_id = a.id
       JOIN routes r ON f.route_id = r.id
       JOIN airports src ON r.source_airport_id = src.id
       JOIN airports dest ON r.dest_airport_id = dest.id
       ORDER BY f.flight_number`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Failed to fetch flights." });
  }
});


// --- NEW ROUTES REQUIRED FOR THE DASHBOARD ---

// NEW: READ one flight by ID
router.get("/read/:id", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM flights WHERE id = $1", [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Flight not found" });
        }
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: "Error fetching flight." });
    }
});

// NEW: UPDATE a flight
router.put("/update/:id", async (req, res) => {
    try {
        const { flight_number, route_id, aircraft_id, departure_time, arrival_time, frequency, status } = req.body;
        
        // ⭐ FIX: Rewriting the query as a clean, single-line string to eliminate hidden syntax errors.
        const query = 'UPDATE flights SET flight_number=$1, departure_time=$2, arrival_time=$3, frequency=$4, status=$5, route_id=$6, aircraft_id=$7 WHERE id=$8 RETURNING *';
        
        const values = [flight_number, departure_time, arrival_time, frequency, status, route_id, aircraft_id, req.params.id];

        const result = await pool.query(query, values);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Flight not found" });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error("Database error during flight update:", err); 
        res.status(500).json({ error: "Server error while updating flight." });
    }
});


// NEW: DELETE a flight
router.delete("/delete/:id", async (req, res) => {
    try {
        const result = await pool.query("DELETE FROM flights WHERE id = $1 RETURNING *", [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Flight not found" });
        }
        res.json({ message: "Flight deleted successfully" });
    } catch (err) {
        // Add a check for foreign key violation
        if (err.code === '23503') { // PostgreSQL error code for foreign key violation
            return res.status(400).json({ error: "Cannot delete this flight because flight instances depend on it." });
        }
        res.status(500).json({ error: "Error deleting flight." });
    }
});


module.exports = router;
