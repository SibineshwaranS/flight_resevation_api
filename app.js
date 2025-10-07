const express = require("express");
const cors = require("cors");
const path = require("path");
const cron = require("node-cron");
const pool = require("./db"); // PostgreSQL connection pool
const cookieParser = require("cookie-parser");
const app = express();
const port = 3000;


// This list defines which websites are allowed to connect to your API
const allowedOrigins = [
    'http://127.0.0.1:5500', // Your local machine for testing
    'https://flight-resevation.vercel.app'
];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or Postman)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'The CORS policy for this site does not allow access from your origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    }
}));


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));



// Routes
const customerProfilesRoutes = require("./customerProfiles");
const authRoutes = require("./auth");
const airportRoutes = require("./airports");
const routesRouter = require("./routes");
const aircraftRoutes = require("./aircraft");
const flightsRouter = require("./flights");
const { router: flightinstancesRouter, shiftExpiredFlights } = require("./flightinstances");
const flightSeatsRoutes = require("./flightseats");
const bookingsRoutes = require("./bookings");
const paymentsRoutes = require("./payments");
const refundsRoutes = require("./refunds");




// Register routes
app.use("/customers", customerProfilesRoutes);
app.use("/auth", authRoutes);
app.use("/airports", airportRoutes);
app.use("/routes", routesRouter);

app.use("/aircraft", aircraftRoutes);
app.use("/flights", flightsRouter);
app.use("/flightinstances", flightinstancesRouter);
app.use("/flightseats", flightSeatsRoutes);
app.use("/bookings", bookingsRoutes);
app.use("/payments", paymentsRoutes);
app.use("/refunds", refundsRoutes);


// Root route
app.get("/", (req, res) => {
  res.send("🚀 Flight Reservation API is running!");
});

// Cron job runs daily at midnight
cron.schedule("0 0 * * *", async () => {
  console.log("🌙 Midnight reached - shifting expired flights by +3 days...");
  try {
    await shiftExpiredFlights();
  } catch (err) {
    console.error("❌ Cron job failed:", err);
  }
});

// app.js

const PORT = process.env.PORT || 3000; // Use Render's port if available, otherwise fallback to 3000

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);

});


