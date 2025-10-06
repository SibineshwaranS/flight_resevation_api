-- =================================================================
--      FlightReserve - Complete PostgreSQL Database Schema
-- =================================================================
-- The tables are ordered to satisfy foreign key dependencies.

-- 1. Users Table
-- Stores login credentials, roles, and basic user information.
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    phone VARCHAR(20),
    role VARCHAR(50) NOT NULL DEFAULT 'customer',
    profile_completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Customer Profiles Table
-- Stores detailed personal information linked to a user.
CREATE TABLE customer_profiles (
    id SERIAL PRIMARY KEY,
    user_id INT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(100),
    date_of_birth DATE,
    gender VARCHAR(10),
    nationality VARCHAR(50),
    passport_no VARCHAR(20),
    frequent_flyer_no VARCHAR(30),
    address TEXT,
    city VARCHAR(50),
    phone VARCHAR(20),
    photo_data BYTEA,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Airports Table
-- Stores data for all departure and arrival airports.
CREATE TABLE airports (
    id SERIAL PRIMARY KEY,
    iata CHAR(3) UNIQUE NOT NULL,
    icao CHAR(4) UNIQUE,
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    country TEXT NOT NULL,
    tz TEXT -- Timezone string like 'Asia/Kolkata'
);

-- 4. Routes Table
-- Defines a path between a source and destination airport.
CREATE TABLE routes (
    id SERIAL PRIMARY KEY,
    source_airport_id INT NOT NULL REFERENCES airports(id),
    dest_airport_id INT NOT NULL REFERENCES airports(id),
    distance_nm INT,
    typical_duration_min INT,
    CONSTRAINT check_different_airports CHECK (source_airport_id <> dest_airport_id)
);

-- 5. Seat Maps Table
-- Defines the seating layout for different aircraft models.
CREATE TABLE seat_maps (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    total_seats INT NOT NULL,
    layout JSONB -- Stores the seat configuration, e.g., {"rows": 30, "config": "3-3"}
);

-- 6. Aircraft Table
-- Stores information about individual aircraft in the fleet.
CREATE TABLE aircraft (
    id SERIAL PRIMARY KEY,
    registration_no VARCHAR(20) UNIQUE NOT NULL,
    model TEXT NOT NULL,
    manufacturer TEXT NOT NULL,
    seat_map_id INT REFERENCES seat_maps(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Flights Table
-- A reusable flight schedule or template (e.g., the 9:30 AM flight from Chennai to Mumbai).
CREATE TABLE flights (
    id SERIAL PRIMARY KEY,
    flight_number VARCHAR(10) NOT NULL,
    route_id INT NOT NULL REFERENCES routes(id),
    aircraft_id INT NOT NULL REFERENCES aircraft(id),
    departure_time TIME, -- The time of day, e.g., '09:30:00'
    arrival_time TIME,   -- The time of day, e.g., '11:30:00'
    frequency VARCHAR(50) DEFAULT 'Daily',
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Flight Instances Table
-- A specific, bookable occurrence of a flight on a particular date.
CREATE TABLE flight_instances (
    id SERIAL PRIMARY KEY,
    flight_id INT NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
    scheduled_departure TIMESTAMPTZ NOT NULL,
    scheduled_arrival TIMESTAMPTZ NOT NULL,
    actual_departure TIMESTAMPTZ,
    actual_arrival TIMESTAMPTZ,
    status VARCHAR(50) NOT NULL DEFAULT 'on-time',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Flight Seats Table
-- Represents every seat for a specific flight instance.
CREATE TABLE flight_seats (
    seat_id SERIAL PRIMARY KEY,
    flight_instance_id INT NOT NULL REFERENCES flight_instances(id) ON DELETE CASCADE,
    seat_number VARCHAR(5) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'available', -- 'available', 'booked'
    UNIQUE (flight_instance_id, seat_number)
);

-- 10. Bookings Table
-- Records a customer's confirmed booking on a flight instance.
CREATE TABLE bookings (
    booking_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id),
    flight_instance_id INT NOT NULL REFERENCES flight_instances(id),
    pnr VARCHAR(10) UNIQUE NOT NULL,
    seat_numbers TEXT NOT NULL, -- e.g., "14A,14B"
    booking_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(20) NOT NULL DEFAULT 'confirmed',
    -- Denormalized data for easier ticket generation
    scheduled_departure TIMESTAMPTZ,
    scheduled_arrival TIMESTAMPTZ
);

-- 11. Payments Table
-- Records the financial transaction for a booking.
CREATE TABLE payments (
    payment_id SERIAL PRIMARY KEY,
    booking_id INT NOT NULL REFERENCES bookings(booking_id),
    amount NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(5) NOT NULL,
    payment_method VARCHAR(30),
    transaction_id VARCHAR(50),
    status VARCHAR(20) NOT NULL,
    paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

\echo 'Database schema created successfully!';