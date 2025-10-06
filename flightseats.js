// routes/flightseats.js
const express = require("express");
const router = express.Router();
const cron = require("node-cron");
const pool = require("../db");

// ✅ CREATE seat
// POST multiple seats
router.post('/create', async (req, res) => {
  const client = await pool.connect();
  try {
    const seats = req.body; // Expecting an array of seats

    if (!Array.isArray(seats)) {
      return res.status(400).json({ error: "Expected an array of seats" });
    }

    const insertQuery = `
      INSERT INTO flight_seats (flight_instance_id, seat_number, status)
      VALUES ($1, $2, $3)
      ON CONFLICT (flight_instance_id, seat_number) DO NOTHING
      RETURNING *;
    `;

    let results = [];
    for (const seat of seats) {
      const { flight_instance_id, seat_number, status } = seat;
      const result = await client.query(insertQuery, [flight_instance_id, seat_number, status || 'available']);
      if (result.rows.length > 0) results.push(result.rows[0]);
    }

    res.json({ inserted: results.length, seats: results });
  } catch (err) {
    console.error("Error inserting seats:", err);
    res.status(500).json({ error: "Failed to create seat(s)" });
  } finally {
    client.release();
  }
});


// ✅ READ all seats
router.get("/read", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM flight_seats ORDER BY seat_id ASC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch seats" });
  }
});

router.get("/instance/:instance_id", async (req, res) => {
    try {
        const { instance_id } = req.params;
        const result = await pool.query(
            "SELECT seat_id, seat_number, status FROM flight_seats WHERE flight_instance_id = $1 ORDER BY seat_id",
            [instance_id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching seats for instance:", err);
        res.status(500).json({ error: "Failed to fetch seats for the specified instance." });
    }
});


router.put("/update/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const result = await pool.query(
      "UPDATE flight_seats SET status=$1 WHERE seat_id=$2 RETURNING *",
      [status, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


// ✅ DELETE seat
router.delete("/delete/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM flight_seats WHERE seat_id = $1", [req.params.id]);
    res.json({ message: "Seat deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete seat" });
  }
});

cron.schedule("* * * * *", async () => {
  try {
    const now = new Date();

    // Find flight instances whose departure time has passed
    const { rows } = await pool.query(
      `SELECT id FROM flight_instances
       WHERE scheduled_departure <= NOW()`
    );

    if (rows.length > 0) {
      const instanceIds = rows.map(r => r.id);

      // Reset all booked seats for these flight instances
      await pool.query(
        `UPDATE flight_seats
         SET status = 'available'
         WHERE flight_instance_id = ANY($1::int[]) AND status = 'booked'`,
        [instanceIds]
      );

      console.log(`✅ Reset booked seats for flight instances: ${instanceIds.join(", ")}`);
    }
  } catch (err) {
    console.error("❌ Error resetting booked seats:", err.message);
  }
});

router.patch("/mark-booked", async (req, res) => {
  try {
    const { flight_instance_id, seat_numbers } = req.body;

    if (!flight_instance_id || !seat_numbers || seat_numbers.length === 0) {
      return res.status(400).json({ error: "Missing flight instance ID or seats" });
    }

    // Make sure seat_numbers is an array
    const seatsArray = Array.isArray(seat_numbers) ? seat_numbers : [seat_numbers];

    const query = `
      UPDATE flight_seats
      SET status = 'booked'
      WHERE flight_instance_id = $1 AND seat_number = ANY($2::text[])
    `;

    await pool.query(query, [flight_instance_id, seatsArray]);

    res.json({ message: "Seats marked as booked" });
  } catch (err) {
    console.error("❌ Mark booked error:", err);
    res.status(500).json({ error: "Failed to mark seats as booked" });
  }
});

module.exports = router;
