// routes/bookings.js
const express = require("express");
const router = express.Router();
const pool = require("db");

// Helper function to generate a random 6-character alphanumeric PNR
function generatePNR(length = 6) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// ✅ CREATE a Booking (This is the fully corrected version)
router.post("/create", async (req, res) => {
    const client = await pool.connect();
    try {
        const { user_id, flight_instance_id, seat_numbers } = req.body;
        if (!user_id || !flight_instance_id || !seat_numbers?.length) {
            return res.status(400).json({ error: "Missing required fields for booking." });
        }
        
        const seatsArray = Array.isArray(seat_numbers) ? seat_numbers : [seat_numbers];
        const seatsStr = seatsArray.join(",");

        // --- Step 1: Start Transaction ---
        await client.query("BEGIN");

        // --- Step 2: Lock seats and check availability to prevent double-booking ---
        const seatsCheckQuery = `
            SELECT seat_number, status FROM flight_seats
            WHERE flight_instance_id = $1 AND seat_number = ANY($2::text[])
            FOR UPDATE;
        `;
        const seatsResult = await client.query(seatsCheckQuery, [flight_instance_id, seatsArray]);

        if (seatsResult.rows.length !== seatsArray.length) {
            throw new Error("One or more selected seats could not be found for this flight.");
        }

        const alreadyBooked = seatsResult.rows.find(seat => seat.status !== 'available');
        if (alreadyBooked) {
            throw new Error(`Sorry, seat ${alreadyBooked.seat_number} is no longer available.`);
        }

        // --- Step 3: Get flight details and create the booking ---
        const instanceResult = await client.query(
            'SELECT scheduled_departure, scheduled_arrival FROM flight_instances WHERE id = $1',
            [flight_instance_id]
        );
        const { scheduled_departure, scheduled_arrival } = instanceResult.rows[0];
        
        const pnr = generatePNR();

        const bookingResult = await client.query(
            `INSERT INTO bookings 
               (user_id, flight_instance_id, seat_numbers, booking_date, status, pnr, scheduled_departure, scheduled_arrival)
             VALUES ($1, $2, $3, NOW(), 'confirmed', $4, $5, $6) RETURNING *`,
            [user_id, flight_instance_id, seatsStr, pnr, scheduled_departure, scheduled_arrival]
        );

        // --- Step 4: CORRECTLY update seat status to 'booked' ---
        await client.query(
            `UPDATE flight_seats
             SET status = 'booked'
             WHERE flight_instance_id = $1 AND seat_number = ANY($2::text[])`,
            [flight_instance_id, seatsArray]
        );

        // --- Step 5: Commit the transaction ---
        await client.query("COMMIT");
        res.status(201).json(bookingResult.rows[0]);

    } catch (err) {
        await client.query("ROLLBACK");
        
        // This is the error that gets printed in your BACKEND TERMINAL. It is the key to debugging.
        console.error("❌ Booking transaction error:", err); 
        
        if (err.message.includes("no longer available") || err.message.includes("could not be found")) {
             res.status(409).json({ error: err.message }); // 409 Conflict for user
        } else {
             res.status(500).json({ error: "Booking failed due to a server error." }); // Generic error for user
        }
    } finally {
        client.release();
    }
});

// GET all bookings for a specific user
router.get("/user/:user_id", async (req, res) => {
    try {
        const { user_id } = req.params;
        const result = await pool.query(
            `SELECT 
                b.booking_id, b.pnr, b.seat_numbers, b.booking_date, b.status,
                b.scheduled_departure AS departure_time, b.scheduled_arrival AS arrival_time,
                b.flight_instance_id, cp.full_name, f.flight_number, ac.manufacturer AS airline,
                dep_airport.iata AS departure_iata, dep_airport.city AS departure_city,
                arr_airport.iata AS arrival_iata, arr_airport.city AS arrival_city
            FROM bookings b
            JOIN users u ON b.user_id = u.id
            LEFT JOIN customer_profiles cp ON u.id = cp.user_id
            JOIN flight_instances fi ON b.flight_instance_id = fi.id
            JOIN flights f ON fi.flight_id = f.id
            JOIN aircraft ac ON f.aircraft_id = ac.id
            JOIN routes r ON f.route_id = r.id
            JOIN airports dep_airport ON r.source_airport_id = dep_airport.id
            JOIN airports arr_airport ON r.dest_airport_id = arr_airport.id
            WHERE b.user_id = $1 ORDER BY b.scheduled_departure DESC`,
            [user_id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error("❌ Error fetching user bookings:", err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /cancel a booking
router.put("/cancel/:booking_id", async (req, res) => {
    const client = await pool.connect();
    try {
        const { booking_id } = req.params;
        await client.query("BEGIN");
        const bookingRes = await client.query("SELECT * FROM bookings WHERE booking_id = $1", [booking_id]);
        if (bookingRes.rows.length === 0) {
            throw new Error("Booking not found.");
        }
        const booking = bookingRes.rows[0];
        const seatsArray = booking.seat_numbers.split(',');
        await client.query("UPDATE bookings SET status = 'cancelled' WHERE booking_id = $1", [booking_id]);
        await client.query(
            `UPDATE flight_seats SET status = 'available' 
             WHERE flight_instance_id = $1 AND seat_number = ANY($2::text[])`,
            [booking.flight_instance_id, seatsArray]
        );
        await client.query("COMMIT");
        res.json({ message: "Booking cancelled successfully" });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("❌ Cancellation error:", err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// GET /ticket for a booking
router.get("/ticket/:booking_id", async (req, res) => {
    try {
        const { booking_id } = req.params;
        const result = await pool.query(
            `SELECT 
                b.booking_id, b.pnr, b.seat_numbers, b.booking_date, b.status,
                b.scheduled_departure AS departure_time, b.scheduled_arrival AS arrival_time,
                cp.full_name, f.flight_number, ac.manufacturer AS airline,
                dep_airport.name AS departure_airport_name, arr_airport.name AS arrival_airport_name,
                dep_airport.iata AS departure_iata, dep_airport.city AS departure_city,
                arr_airport.iata AS arrival_iata, arr_airport.city AS arrival_city
            FROM bookings b
            JOIN users u ON b.user_id = u.id
            LEFT JOIN customer_profiles cp ON u.id = cp.user_id
            JOIN flight_instances fi ON b.flight_instance_id = fi.id
            JOIN flights f ON fi.flight_id = f.id
            JOIN aircraft ac ON f.aircraft_id = ac.id
            JOIN routes r ON f.route_id = r.id
            JOIN airports dep_airport ON r.source_airport_id = dep_airport.id
            JOIN airports arr_airport ON r.dest_airport_id = arr_airport.id
            WHERE b.booking_id = $1`,
            [booking_id]
        );
        if (result.rows.length === 0) {
            return res.status(404).send("Ticket not found");
        }
        const ticket = result.rows[0];
        const departure = new Date(ticket.departure_time);
        const ticketHtml = `
            <!DOCTYPE html><html><head><title>e-Ticket - ${ticket.pnr}</title><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet"><style>body{font-family:'Segoe UI',sans-serif}.ticket{border:2px dashed #6f42c1;max-width:800px;margin:40px auto;padding:20px;border-radius:15px}.ticket-header{background-color:#6f42c1;color:#fff;padding:10px;border-radius:10px 10px 0 0}.barcode{font-family:'Libre Barcode 39',cursive;font-size:4rem;text-align:center}</style><link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+39&display=swap" rel="stylesheet"></head><body><div class="ticket"><div class="ticket-header text-center"><h2>FlightReserve - Boarding Pass</h2></div><div class="p-3"><div class="row"><div class="col-8"><h5 class="text-muted">PASSENGER NAME</h5><h3>${ticket.full_name}</h3><div class="row mt-4"><div class="col"><h5 class="text-muted">FROM</h5><h4>${ticket.departure_city} (${ticket.departure_iata})</h4><p>${ticket.departure_airport_name}</p></div><div class="col"><h5 class="text-muted">TO</h5><h4>${ticket.arrival_city} (${ticket.arrival_iata})</h4><p>${ticket.arrival_airport_name}</p></div></div></div><div class="col-4 text-end"><h5 class="text-muted">FLIGHT</h5><h3>${ticket.airline} ${ticket.flight_number}</h3><h5 class="text-muted mt-4">SEAT</h5><h3>${ticket.seat_numbers}</h3><h5 class="text-muted mt-4">PNR</h5><h3>${ticket.pnr}</h3></div></div><hr><div class="row text-center"><div class="col"><h5 class="text-muted">DEPARTURE</h5><h4>${departure.toLocaleDateString()} at ${departure.toLocaleTimeString()}</h4></div><div class="col"><h5 class="text-muted">STATUS</h5><h4 class="text-success">${ticket.status.toUpperCase()}</h4></div></div><div class="barcode mt-3">${ticket.pnr}</div></div></div></body></html>`;
        res.send(ticketHtml);
    } catch (err) {
        console.error("❌ Ticket generation error:", err);
        res.status(500).send("Error generating ticket");
    }
});



// Add this new route to routes/bookings.js

// NEW: GET all bookings (for admin dashboard)
router.get("/read", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM bookings ORDER BY booking_date DESC");
        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching all bookings:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// In routes/bookings.js

// FINAL, DEFINITIVE VERSION of the search endpoint
router.get("/reschedule/search/:bookingId/:newDate", async (req, res) => {
    try {
        const { bookingId, newDate } = req.params;

        // Step 1: Get the original flight's route_id
        const routeQuery = `
            SELECT f.route_id FROM bookings b
            JOIN flight_instances fi ON b.flight_instance_id = fi.id
            JOIN flights f ON fi.flight_id = f.id
            WHERE b.booking_id = $1
        `;
        const routeResult = await pool.query(routeQuery, [bookingId]);

        if (routeResult.rows.length === 0) {
            return res.status(404).json({ error: "Original booking not found." });
        }
        const { route_id } = routeResult.rows[0];

        // Step 2: Find all flight_ids on that route
        const flightsOnRouteQuery = `SELECT id FROM flights WHERE route_id = $1`;
        const flightsOnRouteResult = await pool.query(flightsOnRouteQuery, [route_id]);
        
        if (flightsOnRouteResult.rows.length === 0) {
            return res.status(404).json({ error: "No flights found for this route." });
        }
        const flightIds = flightsOnRouteResult.rows.map(f => f.id);
        
        // Step 3: Find available instances with the CORRECT status
        const availableInstancesQuery = `
            SELECT id, flight_id, scheduled_departure, scheduled_arrival, status
            FROM flight_instances
            WHERE flight_id = ANY($1::int[])
              AND DATE(scheduled_departure AT TIME ZONE 'Asia/Kolkata') = $2
              -- ⭐ THE FINAL FIX: Adding 'active' to the list of statuses to search for
              AND LOWER(status) = ANY(ARRAY['on-time', 'scheduled', 'active'])
            ORDER BY scheduled_departure ASC
        `;
        const instancesResult = await pool.query(availableInstancesQuery, [flightIds, newDate]);
        
        res.status(200).json(instancesResult.rows);

    } catch (err) {
        console.error("❌ Reschedule search crashed:", err.message);
        res.status(500).json({ error: "Server error while searching for flights." });
    }
});

// In routes/bookings.js

// FINAL, DEFINITIVE AND ABSOLUTELY CORRECTED version of the confirm endpoint
router.post("/reschedule/confirm", async (req, res) => {
    const { originalBookingId, newFlightInstanceId, additionalAmount } = req.body;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Step 1: Fetch and lock the original booking
        const originalBookingRes = await client.query("SELECT * FROM bookings WHERE booking_id = $1 FOR UPDATE", [originalBookingId]);
        if (originalBookingRes.rows.length === 0) {
            throw new Error("Original booking not found.");
        }
        const originalBooking = originalBookingRes.rows[0];

        if (originalBooking.status.toLowerCase() !== 'confirmed') {
            throw new Error(`Booking cannot be rescheduled as its status is '${originalBooking.status}'.`);
        }
        if (new Date(originalBooking.scheduled_departure) < new Date()) {
            throw new Error("Cannot reschedule a flight that has already departed.");
        }

        const seatNumbersArray = originalBooking.seat_numbers.split(',');

        // Step 2: Check if desired seats are available on the NEW flight
        const seatCheckQuery = `SELECT seat_number FROM flight_seats WHERE flight_instance_id = $1 AND seat_number = ANY($2::text[]) AND status = 'available' FOR UPDATE`;
        const availableSeats = await client.query(seatCheckQuery, [newFlightInstanceId, seatNumbersArray]);
        if (availableSeats.rows.length !== seatNumbersArray.length) {
            throw new Error("Sorry, one or more of your original seats are not available on the new flight.");
        }

        // Step 3: Update old booking status to 'cancelled'
        await client.query("UPDATE bookings SET status = 'cancelled' WHERE booking_id = $1", [originalBookingId]);

        // Step 4: Release old seats
        await client.query(
            `UPDATE flight_seats SET status = 'available' WHERE flight_instance_id = $1 AND seat_number = ANY($2::text[])`,
            [originalBooking.flight_instance_id, seatNumbersArray]
        );

        // Step 5: Create the new booking record
        const newPnr = generatePNR();
        const instanceResult = await client.query('SELECT scheduled_departure, scheduled_arrival FROM flight_instances WHERE id = $1', [newFlightInstanceId]);
        const { scheduled_departure, scheduled_arrival } = instanceResult.rows[0];

        const newBookingQuery = `
            INSERT INTO bookings (pnr, user_id, flight_instance_id, seat_numbers, status, booking_date, scheduled_departure, scheduled_arrival)
            VALUES ($1, $2, $3, $4, 'confirmed', NOW(), $5, $6)
            RETURNING *
        `;
        const newBookingResult = await client.query(newBookingQuery, [newPnr, originalBooking.user_id, newFlightInstanceId, originalBooking.seat_numbers, scheduled_departure, scheduled_arrival]);
        const newBooking = newBookingResult.rows[0];

        // Step 6: Reserve new seats
        await client.query(
            `UPDATE flight_seats SET status = 'booked' WHERE flight_instance_id = $1 AND seat_number = ANY($2::text[])`,
            [newFlightInstanceId, seatNumbersArray]
        );

        // Step 7: Create a new payment record (CORRECTED)
        if (additionalAmount > 0) {
            // ⭐ FINAL FIX: Changed payment status from 'completed' to 'success' to match the database constraint
            await client.query(
                `INSERT INTO payments (booking_id, amount, currency, status, payment_method, transaction_id) VALUES ($1, $2, 'INR', 'success', 'card', 'RESCHEDULE_' || $3)`,
                [newBooking.booking_id, additionalAmount, originalBookingId]
            );
        }

        await client.query('COMMIT');
        res.status(201).json({ message: "Flight rescheduled successfully!", newBooking });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Reschedule transaction error:", err.message);
        res.status(500).json({ error: err.message || "Failed to reschedule flight. Please try again." });
    } finally {
        client.release();
    }
});


module.exports = router;
