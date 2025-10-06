// routes/aircraft.js
const express = require("express");
const router = express.Router();
const pool = require("../db");

/**
 * A helper function to generate the seat map layout object.
 */
const generateLayoutJson = (numRows, layoutString) => {
    const seatGroups = layoutString.split('-').map(n => parseInt(n, 10));
    const totalSeatsPerRow = seatGroups.reduce((sum, count) => sum + count, 0);
    const totalSeats = totalSeatsPerRow * numRows;

    let seatsPerRowArray = [];
    for (let i = 0; i < totalSeatsPerRow; i++) {
        seatsPerRowArray.push(String.fromCharCode('A'.charCodeAt(0) + i));
    }

    const layoutJson = {
        rows: numRows,
        config: layoutString,
        seats_per_row: seatsPerRowArray
    };

    return { totalSeats, layoutJson };
};

// CREATE Aircraft (No changes needed)
router.post("/create-with-seatmap", async (req, res) => {
    const client = await pool.connect();
    try {
        const { registration_no, model, manufacturer, seat_map_name, num_rows, layout_string } = req.body;
        
        // FIX: Ensure num_rows is an integer for the helper function
        const numRowsInt = parseInt(num_rows, 10);
        if (isNaN(numRowsInt)) {
            return res.status(400).json({ error: "Number of rows must be a valid number." });
        }
        
        const { totalSeats, layoutJson } = generateLayoutJson(numRowsInt, layout_string);

        await client.query('BEGIN');
        
        const seatMapQuery = `INSERT INTO seat_maps (name, total_seats, layout) VALUES ($1, $2, $3) RETURNING id`;
        const seatMapValues = [seat_map_name, totalSeats, layoutJson];
        const seatMapResult = await client.query(seatMapQuery, seatMapValues);
        const newSeatMapId = seatMapResult.rows[0].id;

        const aircraftQuery = `INSERT INTO aircraft (registration_no, model, manufacturer, seat_map_id, status) VALUES ($1, $2, $3, $4, $5) RETURNING *`;
        const aircraftValues = [registration_no, model, manufacturer, newSeatMapId, 'active'];
        const aircraftResult = await client.query(aircraftQuery, aircraftValues);
        
        await client.query('COMMIT');
        res.status(201).json({ 
            message: "✅ Aircraft and Seat Map created successfully", 
            aircraft: aircraftResult.rows[0] 
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Transaction Error in /aircraft/create-with-seatmap: ", err);
        res.status(500).json({ error: "Failed to create aircraft with seat map" });
    } finally {
        client.release();
    }
});

// READ All Aircraft (No changes needed)
router.get("/read", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.id, a.registration_no, a.model, a.manufacturer, a.status, sm.layout, sm.name as seat_map_name
       FROM aircraft a LEFT JOIN seat_maps sm ON a.seat_map_id = sm.id ORDER BY a.id`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Failed to fetch aircraft" });
  }
});


// READ Single Aircraft by ID (No changes needed)
router.get("/read/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT a.*, sm.name as seat_map_name, sm.layout
       FROM aircraft a LEFT JOIN seat_maps sm ON a.seat_map_id = sm.id WHERE a.id = $1`, [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Aircraft not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Failed to fetch aircraft" });
  }
});


// UPDATE Aircraft and its associated SeatMap - THIS IS THE CORRECTED VERSION
router.put("/update/:id", async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const { 
            registration_no, model, manufacturer, status,
            seat_map_name, num_rows, layout_string 
        } = req.body;

        // FIX 1: Convert num_rows from a string to an integer
        const numRowsInt = parseInt(num_rows, 10);
        if (isNaN(numRowsInt)) {
            return res.status(400).json({ error: "Number of rows must be a valid number." });
        }

        await client.query('BEGIN');

        // Step 1: Update the aircraft table
        const aircraftQuery = `UPDATE aircraft SET registration_no = $1, model = $2, manufacturer = $3, status = $4, updated_at = NOW()
                               WHERE id = $5 RETURNING seat_map_id`;
        const aircraftResult = await client.query(aircraftQuery, [registration_no, model, manufacturer, status, id]);
        
        if (aircraftResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: "Aircraft not found" });
        }
        const seatMapId = aircraftResult.rows[0].seat_map_id;

        // Step 2: Generate new layout and update the seat_maps table
        if (seatMapId) {
            // Pass the corrected integer value to the helper function
            const { totalSeats, layoutJson } = generateLayoutJson(numRowsInt, layout_string);
            
            // FIX 2: Removed "updated_at = NOW()" from this query for safety. 
            // Add it back ONLY if you have an `updated_at` column in your `seat_maps` table.
            const seatMapQuery = `UPDATE seat_maps SET name = $1, total_seats = $2, layout = $3
                                  WHERE id = $4`;
            await client.query(seatMapQuery, [seat_map_name, totalSeats, layoutJson, seatMapId]);
        }
        
        await client.query('COMMIT');
        res.json({ message: "Aircraft and its seat map updated successfully" });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error during aircraft/seatmap update:", err);
        res.status(500).json({ error: "Failed to update aircraft details" });
    } finally {
        client.release();
    }
});


// DELETE Aircraft (No changes needed)
router.delete("/delete/:id", async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        await client.query('BEGIN');
        const selectAircraftQuery = "SELECT seat_map_id FROM aircraft WHERE id = $1";
        const aircraftResult = await client.query(selectAircraftQuery, [id]);
        if (aircraftResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: "Aircraft not found" });
        }
        const seatMapId = aircraftResult.rows[0].seat_map_id;
        await client.query("DELETE FROM aircraft WHERE id = $1", [id]);
        if (seatMapId) {
            await client.query("DELETE FROM seat_maps WHERE id = $1", [seatMapId]);
        }
        await client.query('COMMIT');
        res.json({ message: "🗑️ Aircraft and its associated seat map were deleted successfully" });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error during cascading delete for aircraft:", err.message);
        res.status(500).json({ error: "Failed to delete aircraft and its resources" });
    } finally {
        client.release();
    }
});

module.exports = router;