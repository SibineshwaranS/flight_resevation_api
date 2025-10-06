// routes/flightinstances.js
const express = require("express");
const router = express.Router();
const pool = require("../db");

// Helper function to generate seat numbers based on the JSON layout
const generateSeatNumbers = (layoutJson) => {
    const seats = [];
    if (!layoutJson || !layoutJson.rows || !layoutJson.seats_per_row) {
        return seats;
    }
    const numRows = layoutJson.rows;
    const seatLetters = layoutJson.seats_per_row;
    for (let row = 1; row <= numRows; row++) {
        for (const letter of seatLetters) {
            seats.push(`${row}${letter}`);
        }
    }
    return seats;
};

// In routes/flightinstances.js

// This is the definitive version to fix the hidden syntax error.
router.post("/create-with-seats", async (req, res) => {
    const client = await pool.connect();
    try {
        const { flight_id, departure_date, arrival_date, status } = req.body;
        
        await client.query('BEGIN');

        const flightTimeRes = await client.query('SELECT departure_time, arrival_time FROM flights WHERE id = $1', [flight_id]);

        if (flightTimeRes.rows.length === 0) {
            throw new Error(`Flight with ID ${flight_id} not found.`);
        }
        
        const { departure_time, arrival_time } = flightTimeRes.rows[0];

        const scheduled_departure = `${departure_date} ${departure_time}`;
        const scheduled_arrival = `${arrival_date} ${arrival_time}`;

        // Using a clean, single-line string to prevent any whitespace/invisible character issues.
        const instanceQuery = 'INSERT INTO flight_instances (flight_id, scheduled_departure, scheduled_arrival, status) VALUES ($1, $2::TIMESTAMPTZ, $3::TIMESTAMPTZ, $4) RETURNING id';
        
        const instanceResult = await client.query(instanceQuery, [flight_id, scheduled_departure, scheduled_arrival, status]);
        
        const newInstanceId = instanceResult.rows[0].id;
        
        const seatMapInfoQuery = 'SELECT sm.layout FROM flights f JOIN aircraft a ON f.aircraft_id = a.id JOIN seat_maps sm ON a.seat_map_id = sm.id WHERE f.id = $1';
        
        const seatMapInfoResult = await client.query(seatMapInfoQuery, [flight_id]);
        
        if (seatMapInfoResult.rows.length === 0 || !seatMapInfoResult.rows[0].layout) {
            throw new Error("Could not find a valid seat map layout for the given flight.");
        }
        
        const { layout } = seatMapInfoResult.rows[0];
        const seatNumbers = generateSeatNumbers(layout);
        
        if (seatNumbers.length === 0) {
            throw new Error("No seats were generated. Check seat map configuration.");
        }

        const insertSeatQuery = 'INSERT INTO flight_seats (flight_instance_id, seat_number, status) VALUES ($1, $2, \'available\')';

        for (const seatNum of seatNumbers) {
            await client.query(insertSeatQuery, [newInstanceId, seatNum]);
        }

        await client.query('COMMIT');
        
        res.status(201).json({
            message: `✅ Flight instance created with ${seatNumbers.length} seats generated.`,
            flight_instance_id: newInstanceId
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Transaction Error in /flightinstances/create-with-seats:", err.message);
        res.status(500).json({ error: "Failed to create flight instance and seats." });
    } finally {
        client.release();
    }
});

router.put("/update/:id", async (req, res) => {
    try {
        const { id } = req.params;
        // The edit form sends the full timestamps and status
        const { scheduled_departure, scheduled_arrival, status } = req.body;

        const result = await pool.query(
            `UPDATE flight_instances 
             SET scheduled_departure = $1, scheduled_arrival = $2, status = $3, updated_at = NOW()
             WHERE id = $4 RETURNING *`,
            [scheduled_departure, scheduled_arrival, status, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Flight instance not found" });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error("❌ Error updating flight instance:", err);
        res.status(500).json({ error: "Server error during flight instance update." });
    }
});


// READ all flight instances
router.get("/read", async (req, res) => {
     try {
         const result = await pool.query("SELECT * FROM flight_instances ORDER BY scheduled_departure ASC");
        res.json(result.rows);
     } catch (err) {
         console.error("❌ Error fetching flight instances:", err.message);
         res.status(500).json({ error: "Server error" });
     }
});


// ⭐⭐⭐ ADD THIS NEW ROUTE TO YOUR FILE ⭐⭐⭐
// READ a single flight instance by ID (for the admin edit modal)
router.get("/read/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query("SELECT * FROM flight_instances WHERE id = $1", [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Flight instance not found" });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error(`❌ Error fetching flight instance ${req.params.id}:`, err.message);
        res.status(500).json({ error: "Server error" });
    }
});


/**
 * @route   GET /flight-instances/seatmap/:instance_id
 * @desc    Get the seat map layout and all seats for a specific flight instance
 * @access  Public
 */
router.get("/seatmap/:instance_id", async (req, res) => {
    const { instance_id } = req.params;

    if (!instance_id || isNaN(parseInt(instance_id, 10))) {
        return res.status(400).json({ error: "A valid flight instance ID is required." });
    }

    try {
        // ⭐⭐⭐ CORRECTED QUERY START ⭐⭐⭐
        const query = `
            SELECT
                sm.layout,
                json_agg(
                    json_build_object(
                        -- FIX: Changed fs.id to fs.seat_id, which is the correct column name
                        'seat_id', fs.seat_id,
                        'seat_number', fs.seat_number,
                        'status', fs.status,
                        'flight_instance_id', fs.flight_instance_id
                    -- FIX: Also changed the ordering to use the correct column name
                    ) ORDER BY fs.seat_id
                ) AS seats
            FROM flight_instances fi
            JOIN flights f ON fi.flight_id = f.id
            JOIN aircraft a ON f.aircraft_id = a.id
            JOIN seat_maps sm ON a.seat_map_id = sm.id
            LEFT JOIN flight_seats fs ON fi.id = fs.flight_instance_id
            WHERE fi.id = $1
            GROUP BY sm.layout;
        `;
        // ⭐⭐⭐ CORRECTED QUERY END ⭐⭐⭐
        
        const result = await pool.query(query, [instance_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Seat map not found for this flight instance." });
        }
        
        const data = result.rows[0];

        // The check for [null] now needs to inspect 'seat_id'
        if (data.seats && data.seats.length === 1 && data.seats[0].seat_id === null) {
            data.seats = [];
        }

        res.json(data);

    } catch (err) {
        console.error("Error fetching seat map for flight instance:", err);
        res.status(500).json({ error: "Failed to retrieve seat map data." });
    }
});





// --- ADD THIS ROUTE FOR PAYMENT PAGE ---
// This route gets the specific details needed for the payment page.
router.delete("/delete/:id", async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;

        // Start a transaction
        await client.query('BEGIN');

        // Step 1: Delete the dependent seats from the 'flight_seats' table first.
        const deletedSeatsResult = await client.query(
            "DELETE FROM flight_seats WHERE flight_instance_id = $1",
            [id]
        );

        // Step 2: Delete the main flight instance from the 'flight_instances' table.
        const deletedInstanceResult = await client.query(
            "DELETE FROM flight_instances WHERE id = $1 RETURNING *",
            [id]
        );

        // If the instance ID didn't exist, nothing was deleted, so we should roll back.
        if (deletedInstanceResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: "Flight instance not found." });
        }
        
        // If both deletions were successful, commit the transaction.
        await client.query('COMMIT');

        res.json({ 
            message: "🗑️ Flight instance and its seats were deleted successfully.",
            deleted_instance: deletedInstanceResult.rows[0],
            deleted_seats_count: deletedSeatsResult.rowCount 
        });

    } catch (err) {
        // If any error occurs, roll back all changes.
        await client.query('ROLLBACK');
        console.error("❌ Error during flight instance deletion:", err);
        res.status(500).json({ error: "Failed to delete flight instance." });
    } finally {
        // Release the database client back to the pool.
        client.release();
    }
});

// This function is used by the cron job in your server.js
async function shiftExpiredFlights() {
  const query = `
    UPDATE flight_instances
    SET scheduled_departure = scheduled_departure + INTERVAL '3 days',
        scheduled_arrival   = scheduled_arrival + INTERVAL '3 days',
        updated_at = NOW()
    WHERE scheduled_departure::date < CURRENT_DATE;
  `;
  const result = await pool.query(query);
  console.log(`✅ ${result.rowCount} expired flights shifted forward by +3 days`);
  return result.rowCount;
}

// Manual trigger route for shifting expired flights
router.get("/shift-expired", async (req, res) => {
  try {
    const count = await shiftExpiredFlights();
    res.send(`✅ Manually triggered shift: ${count} expired flights were shifted by +3 days`);
  } catch (err) {
    console.error("❌ Error manually shifting flights:", err);
    res.status(500).send("Error shifting flights");
  }
});
router.get("/details/:id", async (req, res) => {
    try {
        const { id } = req.params;

        // This SQL query joins multiple tables to get all necessary details
        const query = `
            SELECT 
                fi.scheduled_departure,
                fi.scheduled_arrival,
                f.flight_number,
                source_airport.name AS source_airport,
                dest_airport.name AS destination_airport
            FROM 
                flight_instances fi
            JOIN 
                flights f ON fi.flight_id = f.id
            JOIN 
                routes r ON f.route_id = r.id
            JOIN 
                airports source_airport ON r.source_airport_id = source_airport.id
            JOIN 
                airports dest_airport ON r.dest_airport_id = dest_airport.id
            WHERE 
                fi.id = $1;
        `;

        const result = await pool.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Flight instance details not found" });
        }

        res.json(result.rows[0]);

    } catch (err) {
        console.error(`❌ Error fetching flight instance details for ID ${req.params.id}:`, err.message);
        res.status(500).json({ error: "Server error while fetching flight details" });
    }
});

// Export both the router and the function, as expected by your server.js
module.exports = { router, shiftExpiredFlights };