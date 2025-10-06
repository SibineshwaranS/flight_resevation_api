const express = require("express");
const router = express.Router();
const pool = require("../db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// auth.js
const JWT_SECRET = process.env.JWT_SECRET;

    // Generate JWT
    const maxAge = 3 * 24 * 60 * 60;
    const createToken = (user) => {
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: maxAge });
}


// 📌 Register route
router.post("/register", async (req, res) => {
  try {
    const { username, email, password, phone, role } = req.body;

    // --- CORRECTED VALIDATION LOGIC ---

    // 1. First, check if the username is already taken.
    const existingUserByUsername = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );

    if (existingUserByUsername.rows.length > 0) {
      // If found, return a specific error about the username.
      return res.status(400).json({ error: "This username is already taken." });
    }

    // 2. If username is available, THEN check if the email is already in use.
    const existingUserByEmail = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (existingUserByEmail.rows.length > 0) {
      // If found, return a specific error about the email.
      return res.status(400).json({ error: "This email is already registered." });
    }

    // --- END OF VALIDATION LOGIC ---

    // If both are unique, proceed to hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insert the new user into the database
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, phone, role) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [username, email, hashedPassword, phone, role || "customer"]
    );

    // Create a token and send the successful response
    const newUser = result.rows[0];
    const token = createToken(newUser);

    res.cookie("jwt", token, { httpOnly: true, maxAge: maxAge * 1000 });
    res.status(201).json({ message: "User registered successfully", user: newUser });

  } catch (err) {
    console.error("Registration Error:", err.message); // Log the error for debugging
    res.status(500).json({ error: "Server error during registration" });
  }
});
// 📌 Login route
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // ⭐️ CHANGE 1: Explicitly select the new 'profile_completed' column
    const result = await pool.query(
      "SELECT id, username, email, role, password_hash, profile_completed FROM users WHERE email = $1",
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const user = result.rows[0];

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const token = createToken(user);

    res.json({
      message: "Login successful",
      token,
      // ⭐️ CHANGE 2: Add the 'profile_completed' flag to the user object
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        profile_completed: user.profile_completed, // This is the new, crucial field
      }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Add this new route to your auth.js file
// It should be protected by an admin-check middleware in a real app.

// NEW: GET all users (for admin dashboard)
router.get("/read", async (req, res) => {
    try {
        // We select only non-sensitive information
        const result = await pool.query(
            "SELECT id, username, email, role, profile_completed FROM users ORDER BY id"
        );
        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching all users:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// You can also add a simple /read/:id route
router.get("/read/:id", async (req, res) => {
    try {
        const result = await pool.query("SELECT id, username, email, role FROM users WHERE id = $1", [req.params.id]);
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
});

// And a simple /update/:id route for role changes
router.put("/update/:id", async (req, res) => {
    try {
        const { role } = req.body;
        const result = await pool.query("UPDATE users SET role = $1 WHERE id = $2 RETURNING id, username, role", [role, req.params.id]);
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
});

// Example in your auth routes file
/**
 * @route   DELETE /auth/delete/:id
 * @desc    Deletes a user by their ID
 * @access  Private (should be protected by admin middleware)
 */
router.delete('/delete/:id', async (req, res) => {
    // 1. Get the user ID from the URL parameters
    const userId = req.params.id;

    // Log the incoming request for debugging
    console.log(`--- DELETE request received for user ID: ${userId} ---`);

    // It's good practice to validate the ID
    if (isNaN(parseInt(userId, 10))) {
        return res.status(400).json({ error: 'Invalid user ID format.' });
    }

    // 2. Wrap the database logic in a try...catch block to handle unexpected errors
    try {
        const deleteQuery = 'DELETE FROM users WHERE id = $1 RETURNING *';

        console.log('Executing query:', deleteQuery, 'with ID:', userId);

        const result = await pool.query(deleteQuery, [userId]);

        console.log('Database operation result:', result);

        // 3. Check if any rows were affected. result.rowCount tells us how many rows were deleted.
        if (result.rowCount > 0) {
            // Success: A user was found and deleted
            console.log(`Success: User with ID ${userId} was deleted.`);
            res.status(200).json({ message: `User with ID ${userId} deleted successfully.` });
        } else {
            // Failure: No rows were deleted, meaning the user ID was not found
            console.log(`Failure: No user found with ID ${userId} to delete.`);
            res.status(404).json({ error: `User with ID ${userId} not found.` });
        }

    } catch (error) {
        // 4. If the database throws an error (e.g., connection issue, foreign key constraint)
        console.error(`!!! DATABASE ERROR during user deletion for ID ${userId}:`, error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
});


module.exports = router;
